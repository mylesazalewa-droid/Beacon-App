from __future__ import annotations
"""
Face detection + recognition for Beacon using InsightFace buffalo_l (ArcFace).

Pipeline:
  1. detect_faces(image_path) — InsightFace det_10g detector (much better than haarcascade)
  2. Each face: 512-dim ArcFace embedding (w600k_r50 model)
  3. store_clip_faces() — persist to clip_faces table with face crop saved on disk
  4. cluster_all_faces() — AgglomerativeClustering groups same person across clips
  5. Persons stored in persons table; named via Settings > People
"""

import os
import cv2
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

FACE_EMBEDDING_DIM = 512          # ArcFace output dim
CLUSTER_DISTANCE_THRESHOLD = 0.45 # cosine — lower = stricter matching
MIN_FACE_SIZE = 30                 # px

_insight_app = None
_HAS_INSIGHT = None
_np = None


def _get_np():
    global _np
    if _np is None:
        import numpy as np
        _np = np
    return _np


def _get_insight():
    """Lazy-load InsightFace buffalo_l. Returns app or None."""
    global _insight_app, _HAS_INSIGHT
    if _HAS_INSIGHT is None:
        try:
            from insightface.app import FaceAnalysis
            app = FaceAnalysis(
                name='buffalo_l',
                providers=['CPUExecutionProvider'],
            )
            app.prepare(ctx_id=0, det_size=(640, 640))
            _insight_app = app
            _HAS_INSIGHT = True
            logger.info('[faces] InsightFace buffalo_l (ArcFace) ready')
        except Exception as e:
            logger.warning(f'[faces] InsightFace not available: {e}')
            _HAS_INSIGHT = False
    return _insight_app if _HAS_INSIGHT else None


# ── Face detection ────────────────────────────────────────────────────────────

def detect_faces(image_path: str, frame_time: float = 0.0, crop_dir: str | None = None) -> list[dict]:
    """
    Detect and embed faces using InsightFace buffalo_l.
    Returns list of {bbox, embedding, frame_time, crop_path}.
    Falls back to [] if InsightFace unavailable or no faces found.
    """
    np = _get_np()
    app = _get_insight()
    if app is None:
        return []

    try:
        img_bgr = cv2.imread(str(image_path))
        if img_bgr is None:
            return []

        # InsightFace expects BGR uint8
        faces = app.get(img_bgr)
        if not faces:
            return []

        results = []
        h_img, w_img = img_bgr.shape[:2]

        for face in faces:
            if face.det_score < 0.5:
                continue

            # bbox is [x1, y1, x2, y2]
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            bw, bh = x2 - x1, y2 - y1

            if bw < MIN_FACE_SIZE or bh < MIN_FACE_SIZE:
                continue

            # Generous padding for crop
            pad = int(max(bw, bh) * 0.4)
            cx1 = max(0, x1 - pad)
            cy1 = max(0, y1 - pad)
            cx2 = min(w_img, x2 + pad)
            cy2 = min(h_img, y2 + pad)
            crop_bgr = img_bgr[cy1:cy2, cx1:cx2]

            # Save crop to disk for person thumbnails
            saved_crop = None
            if crop_dir and crop_bgr.size > 0:
                os.makedirs(crop_dir, exist_ok=True)
                import hashlib, time as _time
                crop_name = f'face_{hashlib.md5(f"{image_path}{x1}{y1}{_time.time()}".encode()).hexdigest()[:10]}.jpg'
                saved_crop = os.path.join(crop_dir, crop_name)
                try:
                    cv2.imwrite(saved_crop, crop_bgr)
                except Exception:
                    saved_crop = None

            # ArcFace 512-dim embedding (L2-normalized by InsightFace)
            emb = face.embedding.astype(np.float32) if face.embedding is not None else None

            results.append({
                'bbox': [x1, y1, bw, bh],        # store as [x,y,w,h] for compatibility
                'embedding': emb.tobytes() if emb is not None else None,
                'frame_time': frame_time,
                'crop_path': saved_crop,
            })

        if results:
            logger.info(f'[faces] {len(results)} face(s) in {os.path.basename(image_path)}')
        return results

    except Exception as e:
        logger.warning(f'[faces] detect_faces error: {e}')
        return []


# ── Visual embedding (SigLIP — used for similar-clip search) ─────────────────

def embed_image(image_path: str):
    """Generate SigLIP visual embedding (delegated to siglip.py)."""
    try:
        import siglip
        return siglip.embed_image(image_path)
    except Exception as e:
        logger.warning(f'[faces] embed_image failed: {e}')
        return None


# ── Persistence ───────────────────────────────────────────────────────────────

def store_clip_faces(conn, clip_id: int, face_list: list[dict]):
    """Delete old face records for clip then insert new ones."""
    conn.execute('DELETE FROM clip_faces WHERE clip_id = ?', (clip_id,))
    for f in face_list:
        conn.execute(
            'INSERT INTO clip_faces (clip_id, frame_time, bbox, embedding, crop_path) VALUES (?, ?, ?, ?, ?)',
            (clip_id, f['frame_time'], json.dumps(f['bbox']), f['embedding'], f.get('crop_path'))
        )


def get_clip_face_summary(conn, clip_id: int) -> list[dict]:
    """Return named persons detected in a clip."""
    rows = conn.execute(
        '''SELECT DISTINCT p.id, p.name, p.thumbnail_path
           FROM clip_faces cf
           JOIN persons p ON p.id = cf.person_id
           WHERE cf.clip_id = ?''',
        (clip_id,)
    ).fetchall()
    return [
        {
            'id': r['id'],
            'name': r['name'] or f'Person {r["id"]}',
            'thumbnail_path': r['thumbnail_path'],
        }
        for r in rows
    ]


# ── Clustering ────────────────────────────────────────────────────────────────

def cluster_all_faces(conn) -> dict:
    """Re-cluster all ArcFace embeddings into persons. Preserves user-assigned names."""
    np = _get_np()

    rows = conn.execute(
        'SELECT id, clip_id, embedding, det_score, crop_path FROM clip_faces WHERE embedding IS NOT NULL'
    ).fetchall()

    if not rows:
        return {'persons_created': 0, 'persons_total': 0, 'faces_clustered': 0}

    if len(rows) == 1:
        _ensure_person_for_face(conn, dict(rows[0]))
        return {'persons_created': 1, 'persons_total': 1, 'faces_clustered': 1}

    face_ids, vecs = [], []
    face_det_scores = {}   # face_id → det_score
    face_crop_paths = {}   # face_id → crop_path
    for row in rows:
        try:
            vec = np.frombuffer(row['embedding'], dtype=np.float32)
            if len(vec) == FACE_EMBEDDING_DIM:
                fid = row['id']
                face_ids.append(fid)
                vecs.append(vec)
                face_det_scores[fid] = float(row['det_score'] or 0.0)
                face_crop_paths[fid] = row['crop_path']
        except Exception:
            continue

    if len(vecs) < 2:
        return {'persons_created': 0, 'persons_total': 0, 'faces_clustered': len(vecs)}

    try:
        from sklearn.cluster import AgglomerativeClustering
    except ImportError:
        logger.warning('[faces] scikit-learn not installed')
        return {'persons_created': 0, 'persons_total': 0, 'faces_clustered': 0}

    matrix = np.stack(vecs)
    # ArcFace embeddings are already L2-normalized by InsightFace
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    matrix_norm = matrix / norms

    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=CLUSTER_DISTANCE_THRESHOLD,
        metric='cosine',
        linkage='average',
    )
    labels = clustering.fit_predict(matrix_norm)

    # Preserve user-assigned names per cluster
    named_by_face = {}
    for face_id in face_ids:
        row = conn.execute(
            '''SELECT p.name FROM clip_faces cf
               JOIN persons p ON p.id = cf.person_id
               WHERE cf.id = ? AND p.name IS NOT NULL AND p.name != ""''',
            (face_id,)
        ).fetchone()
        if row:
            named_by_face[face_id] = row['name']

    cluster_names = {}
    for i, face_id in enumerate(face_ids):
        label = int(labels[i])
        if face_id in named_by_face and label not in cluster_names:
            cluster_names[label] = named_by_face[face_id]

    # Reset persons
    conn.execute('DELETE FROM persons WHERE name IS NULL OR name = ""')
    conn.execute('UPDATE clip_faces SET person_id = NULL')

    cluster_to_person = {}
    persons_created = 0

    for cluster_id in sorted(set(int(l) for l in labels)):
        mask = np.array([int(l) == cluster_id for l in labels])
        cluster_vecs = matrix_norm[mask]
        centroid = cluster_vecs.mean(axis=0)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = centroid / norm

        face_count = int(mask.sum())
        inherited_name = cluster_names.get(cluster_id)

        # Pick best face crop (highest detection confidence → clearest face)
        cluster_indices = [i for i, l in enumerate(labels) if int(l) == cluster_id]
        rep_face_id = max(
            (face_ids[i] for i in cluster_indices),
            key=lambda fid: face_det_scores.get(fid, 0.0)
        )
        crop_path = face_crop_paths.get(rep_face_id)

        cur = conn.execute(
            'INSERT INTO persons (name, face_count, representative_embedding, thumbnail_path) VALUES (?, ?, ?, ?)',
            (inherited_name, face_count, centroid.tobytes(), crop_path)
        )
        person_id = cur.lastrowid
        cluster_to_person[cluster_id] = person_id
        if not inherited_name:
            persons_created += 1

    for i, (face_id, label) in enumerate(zip(face_ids, labels)):
        conn.execute(
            'UPDATE clip_faces SET person_id = ? WHERE id = ?',
            (cluster_to_person[int(label)], face_id)
        )

    conn.commit()
    total = conn.execute('SELECT COUNT(*) FROM persons').fetchone()[0]
    logger.info(f'[faces] {total} persons from {len(face_ids)} faces')
    return {'persons_created': persons_created, 'persons_total': total, 'faces_clustered': len(face_ids)}


def _ensure_person_for_face(conn, row: dict):
    np = _get_np()
    existing = conn.execute('SELECT person_id FROM clip_faces WHERE id = ?', (row['id'],)).fetchone()
    if existing and existing['person_id']:
        return
    vec = np.frombuffer(row['embedding'], dtype=np.float32)
    crop_row = conn.execute('SELECT crop_path FROM clip_faces WHERE id = ?', (row['id'],)).fetchone()
    cur = conn.execute(
        'INSERT INTO persons (face_count, representative_embedding, thumbnail_path) VALUES (?, ?, ?)',
        (1, vec.tobytes(), crop_row['crop_path'] if crop_row else None)
    )
    conn.execute('UPDATE clip_faces SET person_id = ? WHERE id = ?', (cur.lastrowid, row['id']))
    conn.commit()
