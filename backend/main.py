from __future__ import annotations

import os
import sys
import json
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure backend directory is in path when running from Electron
sys.path.insert(0, os.path.dirname(__file__))

from database import init_db, get_connection, get_db_stats, get_setting, set_setting
from models import (
    IngestRequest, SearchRequest, CategoryCreate, CategoryUpdate,
    CategoryReorder, WatchFolderAdd, SettingUpdate, ReclassifyRequest, HideClipRequest,
)
from categories import list_categories, create_category, update_category, delete_category, reorder_categories
from search import search_clips, get_clip_by_id, _get_all
from vision import check_ollama_status
from watcher import (
    start_watching, stop_watching, get_active_watch_folders,
    add_watch_folder, remove_watch_folder,
)
from ingest import ingest_folder

PORT = int(os.environ.get('BEACON_PORT', 7842))


_running_loop: asyncio.AbstractEventLoop | None = None

def _make_on_new_file():
    """Factory so both lifespan and post_watch_folder share the same handler logic."""
    async def on_new_file(path: str):
        global _ingest_count
        # Wait for the file to finish being written (macOS fires 'created' before data is flushed)
        await asyncio.sleep(2)
        # Stability check: ensure file size isn't still growing
        try:
            s1 = os.path.getsize(path)
            await asyncio.sleep(1)
            s2 = os.path.getsize(path)
            if s1 != s2:
                await asyncio.sleep(5)  # still writing — wait more
        except OSError:
            return  # file disappeared — skip
        if not os.path.exists(path):
            return
        async for _ in ingest_folder(os.path.dirname(path)):
            pass
        _ingest_count += 1
    return on_new_file

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _running_loop
    # Startup
    init_db()
    # Store the running loop so sync routes can schedule async work on it
    _running_loop = asyncio.get_running_loop()
    folders = get_active_watch_folders()
    if folders:
        start_watching(folders, _make_on_new_file(), _running_loop)
    yield
    # Shutdown
    stop_watching()


app = FastAPI(title='Beacon API', version='0.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'file://', 'app://'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'version': '0.1.0'}


# ─── Clips ────────────────────────────────────────────────────────────────────

@app.get('/clips')
def get_clips(
    category_id: int = Query(None),
    color_family: str = Query(None),
    starred: bool = Query(False),
    rating_min: int = Query(0),
    shot_type: str = Query(None),
    status: str = Query(None),
    has_project: bool = Query(False),
    no_project: bool = Query(False),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    clips = _get_all(
        category_id=category_id, color_family=color_family, starred=starred,
        rating_min=rating_min, shot_type=shot_type, status=status,
        has_project=has_project, no_project=no_project,
        limit=limit, offset=offset,
    )
    return {'clips': [c.model_dump() for c in clips], 'total': len(clips)}


@app.get('/clips/{clip_id}')
def get_clip(clip_id: int):
    clip = get_clip_by_id(clip_id)
    if not clip:
        raise HTTPException(404, 'Clip not found')
    return clip.model_dump()


@app.patch('/clips/{clip_id}')
def update_clip(clip_id: int, body: dict):
    """Partial update a clip (category, rating, shot_type, etc.)."""
    conn = get_connection()
    updates = []
    params = []
    if 'category_id' in body:
        updates.append('category_id = ?')
        params.append(body['category_id'])
    if 'rating' in body:
        updates.append('rating = ?')
        params.append(max(0, min(5, int(body['rating']))))
    if 'shot_type' in body:
        updates.append('shot_type = ?')
        params.append(body['shot_type'])
    if 'description' in body:
        updates.append('description = ?')
        params.append(body.get('description'))
    if 'keywords' in body:
        import json as _json
        kw = body.get('keywords', [])
        updates.append('keywords = ?')
        params.append(_json.dumps(kw) if isinstance(kw, list) else kw)
    if 'notes' in body:
        updates.append('notes = ?')
        params.append(body.get('notes'))
    if 'status' in body:
        valid = {'unreviewed', 'approved', 'in_use', 'archived'}
        s = body.get('status', 'unreviewed')
        if s in valid:
            updates.append('status = ?')
            params.append(s)
    if updates:
        params.append(clip_id)
        conn.execute(f'UPDATE clips SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
    conn.close()
    return {'success': True}


@app.post('/clips/{clip_id}/star')
def star_clip(clip_id: int, body: dict):
    starred = int(bool(body.get('starred', True)))
    conn = get_connection()
    conn.execute('UPDATE clips SET starred = ? WHERE id = ?', (starred, clip_id))
    conn.commit()
    conn.close()
    return {'success': True, 'starred': bool(starred)}


@app.post('/clips/{clip_id}/rotate')
def rotate_clip(clip_id: int, body: dict):
    """Rotate a photo 90° clockwise or counter-clockwise and regenerate its thumbnail."""
    direction = body.get('direction', 'cw')   # 'cw' or 'ccw'
    conn = get_connection()
    row = conn.execute('SELECT * FROM clips WHERE id = ?', (clip_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, 'Clip not found')
    if row['media_type'] not in ('image', 'photo', 'heic'):
        conn.close()
        raise HTTPException(400, 'Only photos can be rotated')

    original_path = row['original_path']
    thumb_path    = row['thumbnail_path']

    if not original_path or not os.path.exists(original_path):
        conn.close()
        raise HTTPException(404, 'Original file not found on disk')

    try:
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except ImportError:
            pass
        from PIL import Image as PILImage
        # PIL rotate() is counter-clockwise; expand=True adjusts canvas for 90°
        degrees = 270 if direction == 'cw' else 90   # CW = -90° = 270° in PIL
        img = PILImage.open(original_path).convert('RGB')
        img = img.rotate(degrees, expand=True)

        # HEIC originals are saved as JPEG (thumbnail is JPEG; save rotated as JPEG)
        ext = os.path.splitext(original_path)[1].lower()
        if ext in ('.heic', '.heif'):
            # Can't write back to HEIC easily; save as JPEG alongside original
            jpeg_path = os.path.splitext(original_path)[0] + '_rotated.jpg'
            img.save(jpeg_path, 'JPEG', quality=95)
            # Update DB to point to the new JPEG
            conn.execute('UPDATE clips SET original_path = ? WHERE id = ?', (jpeg_path, clip_id))
        else:
            img.save(original_path)

        # Regenerate thumbnail
        if thumb_path and os.path.exists(thumb_path):
            thumb = img.copy()
            thumb.thumbnail((640, 640), PILImage.LANCZOS)
            thumb.save(thumb_path, 'JPEG', quality=85)

        conn.commit()
        conn.close()
        return {'success': True}
    except Exception as e:
        conn.close()
        raise HTTPException(500, f'Rotation failed: {e}')


@app.post('/clips/batch')
def batch_update_clips(body: dict):
    """Bulk-update multiple clips: category, status, rating, add/set keywords."""
    clip_ids = body.get('clip_ids', [])
    if not clip_ids:
        return {'success': True, 'updated': 0}
    conn = get_connection()
    updates = []
    params = []
    if 'category_id' in body:
        updates.append('category_id = ?')
        params.append(body['category_id'])
    if 'status' in body:
        valid = {'unreviewed', 'approved', 'in_use', 'archived'}
        s = body.get('status')
        if s in valid:
            updates.append('status = ?')
            params.append(s)
    if 'rating' in body:
        updates.append('rating = ?')
        params.append(max(0, min(5, int(body['rating']))))
    if updates:
        placeholders = ','.join('?' * len(clip_ids))
        conn.execute(
            f'UPDATE clips SET {", ".join(updates)} WHERE id IN ({placeholders})',
            params + clip_ids
        )
    if 'add_keywords' in body:
        import json as _json
        new_kws = [k.strip() for k in body['add_keywords'] if k.strip()]
        if new_kws:
            rows = conn.execute(
                f'SELECT id, keywords FROM clips WHERE id IN ({",".join("?" * len(clip_ids))})',
                clip_ids
            ).fetchall()
            for row in rows:
                try:
                    existing = _json.loads(row['keywords'] or '[]')
                except Exception:
                    existing = []
                merged = list(dict.fromkeys(existing + new_kws))
                conn.execute('UPDATE clips SET keywords = ? WHERE id = ?',
                             (_json.dumps(merged), row['id']))
    conn.commit()
    conn.close()
    return {'success': True, 'updated': len(clip_ids)}


@app.post('/clips/{clip_id}/hide')
def hide_clip(clip_id: int, req: HideClipRequest):
    conn = get_connection()
    conn.execute('UPDATE clips SET hidden = ? WHERE id = ?', (int(req.hidden), clip_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.get('/clips/{clip_id}/similar')
def get_similar_clips(clip_id: int, limit: int = Query(24, le=50)):
    """
    Find visually similar clips.
    Priority: SigLIP visual → CLIP visual → text embeddings.
    """
    import numpy as np
    from search import _row_dict_to_clip
    from categories import get_category_map

    conn = get_connection()
    cats = get_category_map(conn)

    def _build_results(id_score_list, min_score=0.0):
        results = []
        for cid, score in id_score_list:
            if score < min_score:
                continue
            r = conn.execute('SELECT * FROM clips WHERE id = ? AND hidden = 0', (cid,)).fetchone()
            if r:
                clip = _row_dict_to_clip(dict(r), cats)
                clip.score = round(score, 3)
                results.append(clip.model_dump())
        return results

    def _dot_search(table, query_vec, dim):
        all_rows = conn.execute(
            f'SELECT clip_id, embedding FROM {table} WHERE clip_id != ?', (clip_id,)
        ).fetchall()
        scores = {}
        for r in all_rows:
            try:
                vec = np.frombuffer(r['embedding'], dtype=np.float32)
                if len(vec) == dim:
                    scores[r['clip_id']] = float(np.dot(query_vec, vec))
            except Exception:
                continue
        return scores

    # 1. SigLIP embeddings (best — 1152-dim, trained for zero-shot visual similarity)
    sig_row = conn.execute(
        'SELECT embedding FROM clip_siglip_embeddings WHERE clip_id = ?', (clip_id,)
    ).fetchone()
    if sig_row:
        query_vec = np.frombuffer(sig_row['embedding'], dtype=np.float32)
        scores = _dot_search('clip_siglip_embeddings', query_vec, 1152)
        if scores:
            top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
            results = _build_results(top, min_score=0.5)
            conn.close()
            return {'clips': results, 'mode': 'siglip'}

    # 2. CLIP visual embeddings (512-dim legacy fallback)
    vis_row = conn.execute(
        'SELECT embedding FROM clip_visual_embeddings WHERE clip_id = ?', (clip_id,)
    ).fetchone()
    if vis_row:
        query_vec = np.frombuffer(vis_row['embedding'], dtype=np.float32)
        scores = _dot_search('clip_visual_embeddings', query_vec, 512)
        if scores:
            top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
            results = _build_results(top)
            conn.close()
            return {'clips': results, 'mode': 'visual'}

    # 3. Text embeddings (category/description similarity)
    from embeddings import EMBEDDING_DIM
    txt_row = conn.execute('SELECT embedding FROM clip_embeddings WHERE clip_id = ?', (clip_id,)).fetchone()
    if not txt_row:
        conn.close()
        return {'clips': [], 'mode': 'none'}
    query_vec = np.frombuffer(txt_row['embedding'], dtype=np.float32)
    scores = _dot_search('clip_embeddings', query_vec, EMBEDDING_DIM)
    top = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]
    results = _build_results(top)
    conn.close()
    return {'clips': results, 'mode': 'text'}


@app.post('/clips/rethumb')
async def rethumb_clips():
    """SSE stream: regenerate thumbnails for all photos (applies EXIF rotation fix)."""
    from fastapi.responses import StreamingResponse

    async def _stream():
        conn = get_connection()
        rows = conn.execute(
            "SELECT id, original_path, thumbnail_path, media_type FROM clips WHERE hidden = 0 AND media_type IN ('photo', 'image', 'heic')"
        ).fetchall()
        total = len(rows)
        if total == 0:
            yield f'data: {json.dumps({"type":"complete","total":0,"done":0})}\n\n'
            conn.close()
            return

        done = 0
        errors = 0
        for row in rows:
            clip_id, orig, thumb, mtype = row['id'], row['original_path'], row['thumbnail_path'], row['media_type']
            fname = os.path.basename(orig or '')
            yield f'data: {json.dumps({"type":"progress","index":done+1,"total":total,"filename":fname})}\n\n'
            await asyncio.sleep(0)
            if not orig or not os.path.exists(orig):
                errors += 1; done += 1; continue
            try:
                from ingest import make_thumbnail
                new_thumb = make_thumbnail(orig, clip_id, mtype)
                if new_thumb:
                    conn.execute('UPDATE clips SET thumbnail_path = ? WHERE id = ?', (new_thumb, clip_id))
                    conn.commit()
                done += 1
            except Exception:
                errors += 1; done += 1
        conn.close()
        yield f'data: {json.dumps({"type":"complete","total":total,"done":done-errors,"errors":errors})}\n\n'

    return StreamingResponse(_stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.post('/clips/reembed')
async def reembed_clips():
    """
    SSE stream: re-generate SigLIP visual embeddings for all clips.
    Use this after updating the app to get visual search working on existing footage.
    """
    async def _stream():
        import numpy as np

        conn = get_connection()
        rows = conn.execute(
            '''SELECT c.id, c.thumbnail_path, c.filename
               FROM clips c
               WHERE c.hidden = 0
               ORDER BY c.id'''
        ).fetchall()
        total = len(rows)

        if total == 0:
            yield f'data: {json.dumps({"type": "complete", "total": 0})}\n\n'
            conn.close()
            return

        try:
            import siglip
        except Exception as e:
            yield f'data: {json.dumps({"type": "error", "error": f"SigLIP not available: {e}"})}\n\n'
            conn.close()
            return

        done = 0
        errors = 0
        for row in rows:
            clip_id = row['id']
            thumb = row['thumbnail_path']
            fname = row['filename']

            yield f'data: {json.dumps({"type": "progress", "index": done + 1, "total": total, "filename": fname})}\n\n'
            await asyncio.sleep(0)

            if not thumb or not os.path.exists(thumb):
                errors += 1
                done += 1
                continue

            try:
                vis_vec = siglip.embed_image(thumb)
                if vis_vec is not None:
                    conn.execute(
                        'INSERT OR REPLACE INTO clip_siglip_embeddings (clip_id, embedding) VALUES (?, ?)',
                        (clip_id, vis_vec.tobytes())
                    )
                    conn.commit()
                    done += 1
                else:
                    errors += 1
                    done += 1
            except Exception as e:
                errors += 1
                done += 1

        conn.close()
        yield f'data: {json.dumps({"type": "complete", "total": total, "done": done - errors, "errors": errors})}\n\n'

    return StreamingResponse(_stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.get('/clips/incomplete')
def get_incomplete_clips():
    """Return counts of clips missing AI analysis data — used to show the resume banner."""
    conn = get_connection()
    missing_desc = conn.execute(
        "SELECT COUNT(*) FROM clips WHERE hidden=0 AND (description IS NULL OR description='')"
    ).fetchone()[0]
    missing_embed = conn.execute(
        '''SELECT COUNT(*) FROM clips c WHERE c.hidden=0
           AND NOT EXISTS (SELECT 1 FROM clip_siglip_embeddings e WHERE e.clip_id=c.id)'''
    ).fetchone()[0]
    missing_faces = conn.execute(
        '''SELECT COUNT(*) FROM clips c WHERE c.hidden=0
           AND NOT EXISTS (SELECT 1 FROM clip_faces f WHERE f.clip_id=c.id)'''
    ).fetchone()[0]
    conn.close()
    return {
        'missing_description': missing_desc,
        'missing_embeddings': missing_embed,
        'missing_faces': missing_faces,
        'has_incomplete': missing_desc > 0 or missing_embed > 0,
    }


@app.post('/clips/reanalyze')
async def reanalyze_clips():
    """
    SSE stream: re-run AI description + tagging + embeddings on clips that are
    missing a description (i.e. were imported but crashed before analysis finished).
    """
    async def _stream():
        conn = get_connection()
        rows = conn.execute(
            """SELECT id, original_path, thumbnail_path, filename, media_type
               FROM clips
               WHERE hidden=0 AND (description IS NULL OR description='')
               ORDER BY id"""
        ).fetchall()
        total = len(rows)

        if total == 0:
            yield f'data: {json.dumps({"type":"complete","total":0,"done":0,"skipped":0})}\n\n'
            conn.close()
            return

        yield f'data: {json.dumps({"type":"start","total":total})}\n\n'

        from ingest import make_thumbnail, FFMPEG, FFPROBE
        from vision import classify_frame, majority_vote_classify
        from embeddings import store_embedding
        do_face = get_setting('face_recognition', '1') == '1'
        max_frames = int(get_setting('max_frames_per_clip', '3') or 3)
        vision_model = get_setting('vision_model', 'llava:13b')

        done = 0; errors = 0
        for row in rows:
            clip_id   = row['id']
            orig      = row['original_path']
            thumb     = row['thumbnail_path']
            fname     = row['filename']
            mtype     = row['media_type']

            yield f'data: {json.dumps({"type":"progress","index":done+1,"total":total,"filename":fname,"stage":"AI analysis"})}\n\n'
            await asyncio.sleep(0)

            if not orig or not os.path.exists(orig):
                errors += 1; done += 1; continue

            try:
                # Ensure thumbnail exists
                if not thumb or not os.path.exists(thumb):
                    from ingest import make_thumbnail
                    thumb = make_thumbnail(orig, clip_id, mtype)
                    if thumb:
                        conn.execute('UPDATE clips SET thumbnail_path=? WHERE id=?', (thumb, clip_id))
                        conn.commit()

                # Extract smart frames for video; use thumbnail for photos
                smart_frames = []
                if mtype == 'video':
                    from ingest import extract_smart_frames
                    smart_frames = extract_smart_frames(orig, max_frames=max_frames)
                if not smart_frames and thumb and os.path.exists(thumb):
                    smart_frames = [(0.0, thumb)]

                # Run vision analysis
                description = ''; keywords = []; category_name = 'Unclassified'; confidence = 0.0
                if smart_frames:
                    frame_results = [classify_frame(fp, model=vision_model) for _, fp in smart_frames if fp and os.path.exists(fp)]
                    if frame_results:
                        category_name, confidence, description, keywords = majority_vote_classify(frame_results)

                # Update clip record
                from categories import get_or_create_category
                cat_id = get_or_create_category(conn, category_name)
                conn.execute(
                    'UPDATE clips SET description=?, keywords=?, category_id=?, confidence=? WHERE id=?',
                    (description, json.dumps(keywords), cat_id, confidence, clip_id)
                )
                conn.commit()

                # Text embedding
                embed_text = f"{description} {' '.join(keywords)}".strip()
                if embed_text:
                    store_embedding(conn, clip_id, embed_text)

                # SigLIP visual embedding
                thumb_for_embed = smart_frames[0][0] if smart_frames else thumb
                if thumb_for_embed and os.path.exists(thumb_for_embed):
                    try:
                        import siglip, numpy as np
                        vis_vec = siglip.embed_image(thumb_for_embed)
                        if vis_vec is not None:
                            conn.execute(
                                'INSERT OR REPLACE INTO clip_siglip_embeddings (clip_id, embedding) VALUES (?,?)',
                                (clip_id, vis_vec.tobytes())
                            )
                            conn.commit()
                    except Exception:
                        pass

                # Face detection
                if do_face and smart_frames:
                    try:
                        import faces as faces_mod
                        crop_dir = os.path.join(os.path.dirname(thumb or ''), 'face_crops')
                        os.makedirs(crop_dir, exist_ok=True)
                        all_faces = []
                        for ts, fp in smart_frames:
                            found = faces_mod.detect_faces(fp, frame_time=ts, crop_dir=crop_dir)
                            all_faces.extend(found)
                        if all_faces:
                            faces_mod.store_clip_faces(conn, clip_id, all_faces)
                    except Exception:
                        pass

                done += 1
            except Exception as e:
                errors += 1; done += 1

        # Re-cluster faces after batch
        if do_face:
            try:
                import faces as faces_mod
                faces_mod.cluster_faces(conn)
            except Exception:
                pass

        conn.close()
        yield f'data: {json.dumps({"type":"complete","total":total,"done":done-errors,"errors":errors})}\n\n'

    return StreamingResponse(_stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.post('/clips/redetect-faces')
async def redetect_faces():
    """
    SSE stream: re-run face detection on all clips that have no face data yet,
    then re-cluster. Safe to run after adding new people or after a crash.
    """
    async def _stream():
        conn = get_connection()
        rows = conn.execute(
            """SELECT c.id, c.original_path, c.thumbnail_path, c.filename, c.media_type
               FROM clips c
               WHERE c.hidden=0
                 AND NOT EXISTS (SELECT 1 FROM clip_faces f WHERE f.clip_id=c.id)
               ORDER BY c.id"""
        ).fetchall()
        total = len(rows)

        if total == 0:
            yield f'data: {json.dumps({"type":"complete","total":0,"done":0})}\n\n'
            conn.close()
            return

        yield f'data: {json.dumps({"type":"start","total":total})}\n\n'

        max_frames = int(get_setting('max_frames_per_clip', '3') or 3)
        done = 0; errors = 0

        try:
            import faces as faces_mod
        except Exception as e:
            yield f'data: {json.dumps({"type":"error","error":f"Face recognition not available: {e}"})}\n\n'
            conn.close()
            return

        crop_dir = os.path.join(get_setting('data_dir', '/tmp'), 'thumbnails', 'face_crops')
        os.makedirs(crop_dir, exist_ok=True)

        for row in rows:
            clip_id = row['id']
            orig    = row['original_path']
            thumb   = row['thumbnail_path']
            fname   = row['filename']
            mtype   = row['media_type']

            yield f'data: {json.dumps({"type":"progress","index":done+1,"total":total,"filename":fname,"stage":"Face detection"})}\n\n'
            await asyncio.sleep(0)

            if not orig or not os.path.exists(orig):
                errors += 1; done += 1; continue

            try:
                smart_frames = []
                if mtype == 'video':
                    from ingest import extract_smart_frames
                    smart_frames = extract_smart_frames(orig, max_frames=max_frames)
                if not smart_frames and thumb and os.path.exists(thumb):
                    smart_frames = [(0.0, thumb)]

                all_faces = []
                for ts, fp in smart_frames:
                    found = faces_mod.detect_faces(fp, frame_time=ts, crop_dir=crop_dir)
                    all_faces.extend(found)
                if all_faces:
                    faces_mod.store_clip_faces(conn, clip_id, all_faces)
                done += 1
            except Exception:
                errors += 1; done += 1

        # Re-cluster all faces
        yield f'data: {json.dumps({"type":"progress","index":total,"total":total,"filename":"","stage":"Clustering faces"})}\n\n'
        try:
            faces_mod.cluster_faces(conn)
        except Exception:
            pass

        conn.close()
        yield f'data: {json.dumps({"type":"complete","total":total,"done":done-errors,"errors":errors})}\n\n'

    return StreamingResponse(_stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


# ─── Tags ─────────────────────────────────────────────────────────────────────

@app.get('/tags')
def get_tags():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM tags ORDER BY name').fetchall()
    conn.close()
    return {'tags': [dict(r) for r in rows]}

@app.post('/tags')
def create_tag(body: dict):
    name = (body.get('name') or '').strip()
    color = body.get('color', '#3498DB')
    if not name:
        raise HTTPException(400, 'Tag name required')
    conn = get_connection()
    try:
        cur = conn.execute('INSERT INTO tags (name, color) VALUES (?, ?)', (name, color))
        tag_id = cur.lastrowid
        conn.commit()
        conn.close()
        return {'id': tag_id, 'name': name, 'color': color}
    except Exception:
        conn.close()
        raise HTTPException(409, 'Tag already exists')

@app.delete('/tags/{tag_id}')
def delete_tag(tag_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM tags WHERE id = ?', (tag_id,))
    conn.commit()
    conn.close()
    return {'success': True}

@app.get('/clips/{clip_id}/tags')
def get_clip_tags(clip_id: int):
    conn = get_connection()
    rows = conn.execute(
        'SELECT t.* FROM tags t JOIN clip_tags ct ON ct.tag_id = t.id WHERE ct.clip_id = ?', (clip_id,)
    ).fetchall()
    conn.close()
    return {'tags': [dict(r) for r in rows]}

@app.post('/clips/{clip_id}/tags')
def add_clip_tag(clip_id: int, body: dict):
    tag_id = body.get('tag_id')
    if not tag_id:
        raise HTTPException(400, 'tag_id required')
    conn = get_connection()
    try:
        conn.execute('INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?, ?)', (clip_id, tag_id))
        conn.commit()
    finally:
        conn.close()
    return {'success': True}

@app.delete('/clips/{clip_id}/tags/{tag_id}')
def remove_clip_tag(clip_id: int, tag_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM clip_tags WHERE clip_id = ? AND tag_id = ?', (clip_id, tag_id))
    conn.commit()
    conn.close()
    return {'success': True}


# ─── Saved Searches ────────────────────────────────────────────────────────────

@app.get('/saved-searches')
def get_saved_searches():
    conn = get_connection()
    rows = conn.execute('SELECT * FROM saved_searches ORDER BY created_at DESC').fetchall()
    conn.close()
    return {'searches': [dict(r) for r in rows]}

@app.post('/saved-searches')
def create_saved_search(body: dict):
    name = (body.get('name') or '').strip()
    if not name:
        raise HTTPException(400, 'Name required')
    conn = get_connection()
    cur = conn.execute(
        'INSERT INTO saved_searches (name, icon, query, category_id, color_family, rating_min) VALUES (?, ?, ?, ?, ?, ?)',
        (name, body.get('icon', '🔍'), body.get('query'), body.get('category_id'),
         body.get('color_family'), int(body.get('rating_min', 0)))
    )
    row_id = cur.lastrowid
    conn.commit()
    row = conn.execute('SELECT * FROM saved_searches WHERE id = ?', (row_id,)).fetchone()
    conn.close()
    return dict(row)

@app.delete('/saved-searches/{search_id}')
def delete_saved_search(search_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM saved_searches WHERE id = ?', (search_id,))
    conn.commit()
    conn.close()
    return {'success': True}


# ─── Highlights ────────────────────────────────────────────────────────────────

@app.get('/highlights')
def get_highlights(limit: int = Query(50, le=200)):
    """Return top-quality clips scored by sharpness, face count, and rating."""
    import numpy as np
    from search import _row_dict_to_clip
    from categories import get_category_map
    conn = get_connection()
    cats = get_category_map(conn)
    rows = conn.execute('SELECT * FROM clips WHERE hidden = 0').fetchall()
    scored = []
    for row in rows:
        rd = dict(row)
        clip_id = rd['id']
        score = 0.0
        # Rating is a hard boost (user-curated)
        rating = int(rd.get('rating') or 0)
        if rating > 0:
            score += rating * 0.25   # up to +1.25 for 5 stars
        # Face presence boost (1-3 faces = best for church)
        face_count = conn.execute(
            'SELECT COUNT(*) FROM clip_faces WHERE clip_id = ?', (clip_id,)
        ).fetchone()[0]
        if 1 <= face_count <= 3:
            score += 0.3
        elif face_count > 3:
            score += 0.15  # crowd shot, still good
        # Sharpness via thumbnail Laplacian std
        thumb = rd.get('thumbnail_path')
        if thumb and os.path.exists(thumb):
            try:
                from PIL import Image as PILImage, ImageFilter
                img = PILImage.open(thumb).convert('L')
                edges = img.filter(ImageFilter.FIND_EDGES)
                arr = list(edges.getdata())
                mean_e = sum(arr) / len(arr)
                std_e = (sum((x - mean_e) ** 2 for x in arr) / len(arr)) ** 0.5
                score += min(std_e / 25.0, 1.0) * 0.5
            except Exception:
                pass
        # Star = already loved by user
        if rd.get('starred'):
            score += 0.4
        scored.append((rd, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    results = []
    for rd, sc in scored[:limit]:
        clip = _row_dict_to_clip(rd, cats)
        clip.score = round(sc, 3)
        results.append(clip.model_dump())
    conn.close()
    return {'clips': results, 'total': len(results)}


# ─── Share / ZIP Export ────────────────────────────────────────────────────────

@app.post('/clips/share')
async def share_clips(body: dict):
    """Create a ZIP of selected clips and return it as a download."""
    import zipfile, io, tempfile
    clip_ids = body.get('clip_ids', [])
    if not clip_ids:
        raise HTTPException(400, 'No clip_ids provided')
    conn = get_connection()
    rows = []
    for cid in clip_ids:
        r = conn.execute('SELECT * FROM clips WHERE id = ?', (cid,)).fetchone()
        if r:
            rows.append(dict(r))
    conn.close()
    if not rows:
        raise HTTPException(404, 'No clips found')

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for rd in rows:
            path = rd['original_path']
            if path and os.path.exists(path):
                zf.write(path, os.path.basename(path))
    buf.seek(0)
    from fastapi.responses import StreamingResponse as SR
    return SR(
        buf,
        media_type='application/zip',
        headers={'Content-Disposition': 'attachment; filename="beacon_export.zip"'}
    )


# ─── FCP XML Export ───────────────────────────────────────────────────────────

@app.post('/export/fcpxml')
def export_fcpxml(body: dict):
    """Export selected clips as Final Cut Pro XML (FCPXML 1.9) for import into FCP or Premiere."""
    clip_ids = body.get('clip_ids', [])
    event_name = body.get('event_name', 'Beacon Export')
    if not clip_ids:
        raise HTTPException(400, 'No clip_ids provided')
    conn = get_connection()
    rows = []
    for cid in clip_ids:
        r = conn.execute('SELECT * FROM clips WHERE id = ?', (cid,)).fetchone()
        if r:
            rows.append(dict(r))
    conn.close()
    if not rows:
        raise HTTPException(404, 'No clips found')

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE fcpxml>',
        '<fcpxml version="1.9">',
        '  <resources>',
        '    <format id="r1" name="FFVideoFormat1080p2997" frameDuration="1001/30000s" width="1920" height="1080"/>',
    ]
    for i, rd in enumerate(rows):
        aid = f'a{i+1}'
        path = rd['original_path'] or ''
        fname = rd['filename'] or ''
        media_type = rd.get('media_type') or 'image'
        # Duration: default 5s for photos, actual for videos
        dur_s = rd.get('duration_secs') or 5.0
        dur_str = f'{int(dur_s * 30000)}/30000s'
        file_url = f'file://{path}'
        if media_type in ('photo', 'image'):
            lines.append(f'    <asset id="{aid}" name="{fname}" src="{file_url}" hasVideo="1" format="r1" duration="{dur_str}"/>')
        else:
            lines.append(f'    <asset id="{aid}" name="{fname}" src="{file_url}" hasVideo="1" hasAudio="1" format="r1" duration="{dur_str}"/>')
    lines.append('  </resources>')
    lines.append(f'  <library><event name="{event_name}">')
    for i, rd in enumerate(rows):
        fname = rd['filename'] or ''
        dur_s = rd.get('duration_secs') or 5.0
        dur_str = f'{int(dur_s * 30000)}/30000s'
        desc = (rd.get('description') or '').replace('"', '&quot;').replace('&', '&amp;')
        lines.append(f'    <clip name="{fname}" ref="a{i+1}" duration="{dur_str}" note="{desc}"/>')
    lines.append('  </event></library>')
    lines.append('</fcpxml>')

    xml = '\n'.join(lines)
    from fastapi.responses import Response as FResponse
    return FResponse(
        content=xml.encode('utf-8'),
        media_type='application/xml',
        headers={'Content-Disposition': f'attachment; filename="{event_name}.fcpxml"'}
    )


# ─── Persons (face recognition) ───────────────────────────────────────────────

@app.get('/colors/families')
def get_color_families():
    """Color family distribution across all clips."""
    from colors import get_family_counts
    conn = get_connection()
    result = get_family_counts(conn)
    conn.close()
    return {'families': result}


@app.get('/persons')
def get_persons():
    conn = get_connection()
    rows = conn.execute(
        '''SELECT p.id, p.name, p.face_count, p.thumbnail_path,
                  COUNT(DISTINCT cf.clip_id) as clip_count
           FROM persons p
           LEFT JOIN clip_faces cf ON cf.person_id = p.id
           GROUP BY p.id
           ORDER BY p.face_count DESC'''
    ).fetchall()
    conn.close()
    return {'persons': [
        {
            'id': r['id'],
            'name': r['name'],
            'face_count': r['face_count'],
            'clip_count': r['clip_count'],
            'thumbnail_path': r['thumbnail_path'],
        }
        for r in rows
    ]}


@app.put('/persons/{person_id}')
def update_person(person_id: int, body: dict):
    name = body.get('name', '').strip()
    conn = get_connection()
    conn.execute('UPDATE persons SET name = ? WHERE id = ?', (name or None, person_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.delete('/persons/{person_id}')
def delete_person(person_id: int):
    conn = get_connection()
    conn.execute('UPDATE clip_faces SET person_id = NULL WHERE person_id = ?', (person_id,))
    conn.execute('DELETE FROM persons WHERE id = ?', (person_id,))
    conn.commit()
    conn.close()
    return {'success': True}


@app.post('/persons/{person_id}/merge/{other_id}')
def merge_persons(person_id: int, other_id: int):
    """Merge other_id into person_id (useful when same person split into two clusters)."""
    conn = get_connection()
    conn.execute('UPDATE clip_faces SET person_id = ? WHERE person_id = ?', (person_id, other_id))
    conn.execute('DELETE FROM persons WHERE id = ?', (other_id,))
    face_count = conn.execute(
        'SELECT COUNT(*) FROM clip_faces WHERE person_id = ?', (person_id,)
    ).fetchone()[0]
    conn.execute('UPDATE persons SET face_count = ? WHERE id = ?', (face_count, person_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.get('/persons/{person_id}/clips')
def get_person_clips(person_id: int, limit: int = Query(100, le=500)):
    from search import _row_dict_to_clip
    from categories import get_category_map
    conn = get_connection()
    cats = get_category_map(conn)
    clip_ids = conn.execute(
        'SELECT DISTINCT clip_id FROM clip_faces WHERE person_id = ?', (person_id,)
    ).fetchall()
    results = []
    for row in clip_ids:
        r = conn.execute('SELECT * FROM clips WHERE id = ? AND hidden = 0', (row['clip_id'],)).fetchone()
        if r:
            results.append(_row_dict_to_clip(dict(r), cats).model_dump())
    conn.close()
    return {'clips': results[:limit]}


@app.post('/persons/cluster')
def recluster_faces():
    """Re-run face clustering on all stored face embeddings."""
    try:
        from faces import cluster_all_faces
        conn = get_connection()
        result = cluster_all_faces(conn)
        conn.close()
        return result
    except Exception as e:
        raise HTTPException(500, f'Clustering failed: {str(e)}')


@app.get('/persons/{person_id}/thumbnail')
def person_thumbnail(person_id: int):
    from fastapi.responses import Response
    conn = get_connection()

    # First try: person's stored thumbnail_path (face crop saved during ingest)
    person_row = conn.execute(
        'SELECT thumbnail_path FROM persons WHERE id = ?', (person_id,)
    ).fetchone()

    if person_row and person_row['thumbnail_path'] and os.path.exists(person_row['thumbnail_path']):
        conn.close()
        return FileResponse(person_row['thumbnail_path'], media_type='image/jpeg')

    # Second try: find a face crop stored in clip_faces
    face_row = conn.execute(
        '''SELECT cf.crop_path, cf.bbox, c.thumbnail_path
           FROM clip_faces cf
           JOIN clips c ON c.id = cf.clip_id
           WHERE cf.person_id = ? AND c.thumbnail_path IS NOT NULL
           ORDER BY cf.id LIMIT 1''',
        (person_id,)
    ).fetchone()
    conn.close()

    if not face_row:
        raise HTTPException(404, 'No face data')

    # Use saved crop directly if available
    if face_row['crop_path'] and os.path.exists(face_row['crop_path']):
        return FileResponse(face_row['crop_path'], media_type='image/jpeg')

    # Fallback: crop face region from clip thumbnail using stored bbox
    if face_row['thumbnail_path'] and os.path.exists(face_row['thumbnail_path']) and face_row['bbox']:
        try:
            import io
            from PIL import Image as PILImage
            bbox = json.loads(face_row['bbox'])
            x, y, bw, bh = bbox
            img = PILImage.open(face_row['thumbnail_path'])
            iw, ih = img.size
            pad = int(max(bw, bh) * 0.5)
            x1, y1 = max(0, x - pad), max(0, y - pad)
            x2, y2 = min(iw, x + bw + pad), min(ih, y + bh + pad)
            if x2 > x1 and y2 > y1:
                crop = img.crop((x1, y1, x2, y2))
                crop = crop.resize((200, 200), PILImage.LANCZOS)
                buf = io.BytesIO()
                crop.save(buf, 'JPEG', quality=85)
                buf.seek(0)
                return Response(content=buf.getvalue(), media_type='image/jpeg')
        except Exception as e:
            logger.warning(f'[persons] thumbnail crop failed: {e}')

    if face_row['thumbnail_path'] and os.path.exists(face_row['thumbnail_path']):
        return FileResponse(face_row['thumbnail_path'], media_type='image/jpeg')

    raise HTTPException(404, 'No thumbnail available')


@app.get('/clips/{clip_id}/people')
def get_clip_people(clip_id: int):
    """People detected in a specific clip."""
    from faces import get_clip_face_summary
    conn = get_connection()
    people = get_clip_face_summary(conn, clip_id)
    conn.close()
    return {'people': people}


@app.post('/clips/{clip_id}/reclassify')
async def reclassify_clip(clip_id: int):
    clip = get_clip_by_id(clip_id)
    if not clip:
        raise HTTPException(404, 'Clip not found')

    async def gen():
        async for update in ingest_folder(os.path.dirname(clip.original_path), reingest=True):
            if update.get('type') == 'classified' and update.get('filename') == clip.filename:
                yield f"data: {json.dumps(update)}\n\n"
                return
            yield f"data: {json.dumps(update)}\n\n"

    return StreamingResponse(gen(), media_type='text/event-stream')


# ─── Search ───────────────────────────────────────────────────────────────────

@app.get('/search')
def search(
    q: str = Query(''),
    category_id: int = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    clips, match_type = search_clips(q, category_id=category_id, limit=limit, offset=offset)
    return {
        'clips': [c.model_dump() for c in clips],
        'total': len(clips),
        'match_type': match_type,
        'query': q,
    }


# ─── Ingest ───────────────────────────────────────────────────────────────────

@app.post('/ingest/files')
async def ingest_specific_files(req: dict):
    """Ingest a list of specific file paths (for drag-and-drop of individual files)."""
    file_paths = req.get('files', [])
    if not file_paths:
        raise HTTPException(400, 'No files provided')

    async def generate():
        try:
            async for update in ingest_folder(
                folder_path='',
                reingest=False,
                event_name=req.get('event_name'),
                specific_files=file_paths,
            ):
                yield f"data: {json.dumps(update)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


@app.post('/ingest')
async def start_ingest(req: IngestRequest):
    if not os.path.isdir(req.folder_path):
        raise HTTPException(400, f'Folder not found: {req.folder_path}')

    async def generate():
        try:
            async for update in ingest_folder(
                req.folder_path,
                reingest=req.reingest,
                event_name=req.event_name,
                camera_angle=req.camera_angle,
                rename_files=req.rename_files,
            ):
                yield f"data: {json.dumps(update)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


# ─── Categories ───────────────────────────────────────────────────────────────

@app.get('/categories')
def get_categories():
    cats = list_categories()
    return {'categories': [c.model_dump() for c in cats]}


@app.post('/categories')
def add_category(req: CategoryCreate):
    # Check for duplicate
    conn = get_connection()
    existing = conn.execute(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?)', (req.name,)
    ).fetchone()
    conn.close()
    if existing:
        raise HTTPException(400, f'Category "{req.name}" already exists')
    cat = create_category(req.name)
    return cat.model_dump()


@app.put('/categories/{cat_id}')
def edit_category(cat_id: int, req: CategoryUpdate):
    try:
        cat = update_category(cat_id, name=req.name, color_index=req.color_index)
        return cat.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete('/categories/{cat_id}')
def remove_category(cat_id: int):
    try:
        result = delete_category(cat_id)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post('/categories/reorder')
def reorder(req: CategoryReorder):
    reorder_categories(req.ordered_ids)
    return {'success': True}


# ─── Smart Collections ────────────────────────────────────────────────────────

@app.get('/collections')
def get_collections():
    """List all saved smart collections."""
    conn = get_connection()
    rows = conn.execute(
        'SELECT id, name, icon, query, category_id, color_family, media_type, sort FROM smart_collections ORDER BY sort, name'
    ).fetchall()
    conn.close()
    return {'collections': [dict(r) for r in rows]}


@app.post('/collections')
def create_collection(body: dict):
    name = body.get('name', '').strip()
    if not name:
        raise HTTPException(400, 'Name required')
    conn = get_connection()
    cur = conn.execute(
        '''INSERT INTO smart_collections (name, icon, query, category_id, color_family, media_type)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (
            name,
            body.get('icon', '📁'),
            body.get('query', '') or None,
            body.get('category_id') or None,
            body.get('color_family') or None,
            body.get('media_type') or None,
        )
    )
    conn.commit()
    row = conn.execute('SELECT * FROM smart_collections WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


@app.delete('/collections/{coll_id}')
def delete_collection(coll_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM smart_collections WHERE id = ?', (coll_id,))
    conn.commit()
    conn.close()
    return {'success': True}


@app.put('/collections/{coll_id}')
def update_collection(coll_id: int, body: dict):
    conn = get_connection()
    fields = []
    vals = []
    for col in ('name', 'icon', 'query', 'category_id', 'color_family', 'media_type'):
        if col in body:
            fields.append(f'{col} = ?')
            vals.append(body[col] or None)
    if fields:
        vals.append(coll_id)
        conn.execute(f'UPDATE smart_collections SET {", ".join(fields)} WHERE id = ?', vals)
        conn.commit()
    conn.close()
    return {'success': True}


# ─── Collection Clips (manual membership) ────────────────────────────────────

@app.get('/collections/{coll_id}/clips')
def get_collection_clips(coll_id: int):
    """Return clips manually added to a collection."""
    from search import _row_dict_to_clip
    from categories import get_category_map
    conn = get_connection()
    cats = get_category_map(conn)
    rows = conn.execute(
        '''SELECT c.* FROM clips c
           JOIN collection_clips cc ON cc.clip_id = c.id
           WHERE cc.collection_id = ? AND c.hidden = 0
           ORDER BY cc.added_at DESC''',
        (coll_id,)
    ).fetchall()
    conn.close()
    return {'clips': [_row_dict_to_clip(dict(r), cats).model_dump() for r in rows]}


@app.post('/collections/{coll_id}/clips')
def add_clip_to_collection(coll_id: int, body: dict):
    """Add a clip to a collection (drag-and-drop)."""
    clip_id = body.get('clip_id')
    if not clip_id:
        raise HTTPException(400, 'clip_id required')
    conn = get_connection()
    conn.execute(
        'INSERT OR IGNORE INTO collection_clips (collection_id, clip_id) VALUES (?, ?)',
        (coll_id, clip_id)
    )
    conn.commit()
    count = conn.execute(
        'SELECT COUNT(*) FROM collection_clips WHERE collection_id = ?', (coll_id,)
    ).fetchone()[0]
    conn.close()
    return {'success': True, 'clip_count': count}


@app.delete('/collections/{coll_id}/clips/{clip_id}')
def remove_clip_from_collection(coll_id: int, clip_id: int):
    """Remove a clip from a collection."""
    conn = get_connection()
    conn.execute(
        'DELETE FROM collection_clips WHERE collection_id = ? AND clip_id = ?',
        (coll_id, clip_id)
    )
    conn.commit()
    conn.close()
    return {'success': True}


# ─── Export (organized folder copy) ──────────────────────────────────────────

@app.post('/export')
async def export_clips(body: dict):
    """
    Copy clips to a destination folder, organized by category and/or date.
    body: {
        dest_folder: str,
        clip_ids: [int] | null (null = all clips),
        organize_by: 'category' | 'date' | 'category_date',
        include_metadata: bool
    }
    Streams progress events like ingest.
    """
    import shutil
    from search import _row_dict_to_clip
    from categories import get_category_map

    dest_folder = body.get('dest_folder', '').strip()
    if not dest_folder:
        raise HTTPException(400, 'dest_folder required')

    organize_by = body.get('organize_by', 'category')
    clip_ids = body.get('clip_ids')  # None = all
    include_metadata = body.get('include_metadata', True)

    async def generate():
        conn = get_connection()
        cats = get_category_map(conn)

        if clip_ids:
            placeholders = ','.join('?' * len(clip_ids))
            rows = conn.execute(
                f'SELECT * FROM clips WHERE id IN ({placeholders}) AND hidden = 0',
                clip_ids
            ).fetchall()
        else:
            rows = conn.execute('SELECT * FROM clips WHERE hidden = 0 ORDER BY date_ingested DESC').fetchall()

        total = len(rows)
        if total == 0:
            conn.close()
            yield f"data: {json.dumps({'type': 'complete', 'total': 0})}\n\n"
            return

        # Create a dated master folder inside the chosen destination
        from datetime import datetime as _dt
        master_name = f'Beacon Export {_dt.now().strftime("%Y-%m-%d %H-%M")}'
        export_root = os.path.join(dest_folder, master_name)
        os.makedirs(export_root, exist_ok=True)
        copied = 0
        skipped = 0
        errors = 0

        for idx, row in enumerate(rows, 1):
            rd = dict(row)
            clip = _row_dict_to_clip(rd, cats)
            src = clip.original_path

            if not src or not os.path.exists(src):
                errors += 1
                yield f"data: {json.dumps({'type': 'progress', 'index': idx, 'total': total, 'filename': clip.filename, 'stage': 'Missing — skipped'})}\n\n"
                continue

            # Build destination subfolder
            cat_name = (clip.category_name or 'Unclassified').replace('/', '-')
            date_str = (clip.date_ingested or '')[:10] or 'Unknown-Date'
            year_month = date_str[:7] if len(date_str) >= 7 else 'Unknown'

            if organize_by == 'category':
                subfolder = cat_name
            elif organize_by == 'date':
                subfolder = year_month
            elif organize_by == 'category_date':
                subfolder = os.path.join(cat_name, year_month)
            else:
                subfolder = cat_name

            out_dir = os.path.join(export_root, subfolder)
            os.makedirs(out_dir, exist_ok=True)

            # Handle filename collision
            out_name = clip.filename
            out_path = os.path.join(out_dir, out_name)
            counter = 1
            stem = Path(out_name).stem
            ext = Path(out_name).suffix
            while os.path.exists(out_path):
                out_path = os.path.join(out_dir, f'{stem}_{counter}{ext}')
                counter += 1

            yield f"data: {json.dumps({'type': 'progress', 'index': idx, 'total': total, 'filename': clip.filename, 'stage': f'Copying → {subfolder}/'})}\n\n"
            await asyncio.sleep(0)

            try:
                shutil.copy2(src, out_path)
                copied += 1

                # Optionally write sidecar metadata JSON
                if include_metadata:
                    meta = {
                        'filename': clip.filename,
                        'category': clip.category_name,
                        'description': clip.description,
                        'keywords': clip.keywords,
                        'transcript': clip.transcript,
                        'date_ingested': clip.date_ingested,
                        'duration_secs': clip.duration_secs,
                        'confidence': clip.confidence,
                    }
                    meta_path = out_path + '.json'
                    with open(meta_path, 'w') as f:
                        json.dump(meta, f, indent=2)

            except Exception as e:
                errors += 1
                yield f"data: {json.dumps({'type': 'error', 'index': idx, 'total': total, 'filename': clip.filename, 'error': str(e)})}\n\n"

        conn.close()
        yield f"data: {json.dumps({'type': 'complete', 'total': total, 'copied': copied, 'errors': errors, 'dest': export_root})}\n\n"

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


# ─── Watch Folders ────────────────────────────────────────────────────────────

@app.get('/watch-folders')
def get_watch_folders():
    return {'folders': get_active_watch_folders()}


@app.post('/watch-folders')
def post_watch_folder(req: WatchFolderAdd):
    if not os.path.isdir(req.folder_path):
        raise HTTPException(400, f'Folder not found: {req.folder_path}')
    result = add_watch_folder(req.folder_path)
    # Restart watcher using the stored running loop (get_event_loop() in a sync
    # route returns a different loop than the uvicorn loop — this is the fix)
    loop = _running_loop
    if loop and loop.is_running():
        folders = get_active_watch_folders()
        start_watching(folders, _make_on_new_file(), loop)
    return result


@app.delete('/watch-folders')
def delete_watch_folder(folder_path: str = Query(...)):
    remove_watch_folder(folder_path)
    return {'success': True}


_ingest_count = 0

@app.get('/watch-folders/stats')
def watch_folder_stats():
    return {'ingest_count': _ingest_count}


@app.get('/fs/subfolders')
def list_subfolders(path: str = Query(...)):
    """List immediate subdirectories of a path (used for SD card / volume import picker)."""
    if not os.path.isdir(path):
        raise HTTPException(400, f'Not a directory: {path}')
    try:
        entries = []
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            if os.path.isdir(full) and not name.startswith('.'):
                entries.append({'name': name, 'path': full})
        return {'subfolders': entries}
    except PermissionError:
        return {'subfolders': []}


# ─── Settings ─────────────────────────────────────────────────────────────────

@app.get('/settings')
def get_settings():
    conn = get_connection()
    rows = conn.execute('SELECT key, value FROM settings').fetchall()
    conn.close()
    return {r['key']: r['value'] for r in rows}


@app.put('/settings')
def update_setting(req: SettingUpdate):
    set_setting(req.key, req.value)
    return {'success': True}


@app.get('/settings/ollama-status')
def ollama_status():
    model = get_setting('vision_model', 'llava:13b')
    return check_ollama_status(model)


@app.get('/settings/db-stats')
def db_stats():
    return get_db_stats()


@app.post('/settings/clear-index')
def clear_index():
    conn = get_connection()
    conn.execute('DELETE FROM clips')
    conn.execute('DELETE FROM clip_embeddings')
    conn.execute('DELETE FROM clip_visual_embeddings')
    conn.execute('DELETE FROM clip_faces')
    conn.execute('DELETE FROM persons')
    conn.commit()
    conn.close()
    return {'success': True}


# ─── Projects ────────────────────────────────────────────────────────────────

@app.get('/projects')
def get_projects():
    conn = get_connection()
    rows = conn.execute(
        '''SELECT p.*, COUNT(cp.clip_id) as clip_count
           FROM projects p
           LEFT JOIN clip_projects cp ON cp.project_id = p.id
           GROUP BY p.id ORDER BY p.created_at DESC'''
    ).fetchall()
    conn.close()
    return {'projects': [dict(r) for r in rows]}


@app.post('/projects')
def create_project(body: dict):
    name = (body.get('name') or '').strip()
    if not name:
        raise HTTPException(400, 'name required')
    color = body.get('color', '#6B8FFF')
    conn = get_connection()
    cur = conn.execute('INSERT INTO projects (name, color) VALUES (?, ?)', (name, color))
    project_id = cur.lastrowid
    conn.commit()
    row = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,)).fetchone()
    conn.close()
    return dict(row)


@app.patch('/projects/{project_id}')
def update_project(project_id: int, body: dict):
    conn = get_connection()
    updates, params = [], []
    if 'name' in body:
        updates.append('name = ?'); params.append(body['name'])
    if 'color' in body:
        updates.append('color = ?'); params.append(body['color'])
    if updates:
        conn.execute(f'UPDATE projects SET {", ".join(updates)} WHERE id = ?', params + [project_id])
        conn.commit()
    conn.close()
    return {'success': True}


@app.delete('/projects/{project_id}')
def delete_project(project_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM projects WHERE id = ?', (project_id,))
    conn.commit()
    conn.close()
    return {'success': True}


@app.post('/projects/{project_id}/clips')
def add_clip_to_project(project_id: int, body: dict):
    clip_ids = body.get('clip_ids') or ([body['clip_id']] if 'clip_id' in body else [])
    conn = get_connection()
    for cid in clip_ids:
        conn.execute('INSERT OR IGNORE INTO clip_projects (clip_id, project_id) VALUES (?, ?)',
                     (cid, project_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.delete('/projects/{project_id}/clips/{clip_id}')
def remove_clip_from_project(project_id: int, clip_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM clip_projects WHERE clip_id = ? AND project_id = ?',
                 (clip_id, project_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.get('/projects/{project_id}/clips')
def get_project_clips(project_id: int):
    from search import _row_dict_to_clip
    from categories import get_category_map
    conn = get_connection()
    cats = get_category_map(conn)
    rows = conn.execute(
        '''SELECT c.* FROM clips c
           JOIN clip_projects cp ON cp.clip_id = c.id
           WHERE cp.project_id = ? AND c.hidden = 0
           ORDER BY cp.added_at DESC''',
        (project_id,)
    ).fetchall()
    # Populate _projects for each clip so the detail panel shows project tags
    clip_ids = [dict(r)['id'] for r in rows]
    projects_map = {}
    if clip_ids:
        ph = ','.join('?' * len(clip_ids))
        proj_rows = conn.execute(
            f'''SELECT cp2.clip_id, p.id, p.name, p.color
                FROM clip_projects cp2 JOIN projects p ON p.id = cp2.project_id
                WHERE cp2.clip_id IN ({ph})''',
            clip_ids
        ).fetchall()
        for pr in proj_rows:
            projects_map.setdefault(pr['clip_id'], []).append(
                {'id': pr['id'], 'name': pr['name'], 'color': pr['color']}
            )
    conn.close()
    results = []
    for r in rows:
        rd = dict(r)
        rd['_projects'] = projects_map.get(rd['id'], [])
        results.append(_row_dict_to_clip(rd, cats).model_dump())
    return {'clips': results}


# ─── Shot Lists ───────────────────────────────────────────────────────────────

@app.get('/shot-lists')
def get_shot_lists():
    conn = get_connection()
    rows = conn.execute(
        '''SELECT sl.*, COUNT(sli.id) as item_count
           FROM shot_lists sl
           LEFT JOIN shot_list_items sli ON sli.shot_list_id = sl.id
           GROUP BY sl.id ORDER BY sl.created_at DESC'''
    ).fetchall()
    conn.close()
    return {'shot_lists': [dict(r) for r in rows]}


@app.post('/shot-lists')
def create_shot_list(body: dict):
    name = (body.get('name') or 'Untitled Shot List').strip()
    conn = get_connection()
    cur = conn.execute('INSERT INTO shot_lists (name) VALUES (?)', (name,))
    sl_id = cur.lastrowid
    conn.commit()
    row = conn.execute('SELECT * FROM shot_lists WHERE id = ?', (sl_id,)).fetchone()
    conn.close()
    return {**dict(row), 'item_count': 0}


@app.patch('/shot-lists/{sl_id}')
def update_shot_list(sl_id: int, body: dict):
    conn = get_connection()
    if 'name' in body:
        conn.execute('UPDATE shot_lists SET name = ? WHERE id = ?', (body['name'], sl_id))
        conn.commit()
    conn.close()
    return {'success': True}


@app.delete('/shot-lists/{sl_id}')
def delete_shot_list(sl_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM shot_lists WHERE id = ?', (sl_id,))
    conn.commit()
    conn.close()
    return {'success': True}


@app.get('/shot-lists/{sl_id}/items')
def get_shot_list_items(sl_id: int):
    from search import _row_dict_to_clip
    from categories import get_category_map
    conn = get_connection()
    cats = get_category_map(conn)
    rows = conn.execute(
        '''SELECT sli.id as item_id, sli.position, sli.note, c.*
           FROM shot_list_items sli
           JOIN clips c ON c.id = sli.clip_id
           WHERE sli.shot_list_id = ?
           ORDER BY sli.position ASC''',
        (sl_id,)
    ).fetchall()
    conn.close()
    items = []
    for r in rows:
        rd = dict(r)
        clip = _row_dict_to_clip(rd, cats).model_dump()
        items.append({'item_id': rd['item_id'], 'position': rd['position'], 'note': rd['note'], 'clip': clip})
    return {'items': items}


@app.post('/shot-lists/{sl_id}/items')
def add_shot_list_item(sl_id: int, body: dict):
    clip_id = body.get('clip_id')
    note = body.get('note', '')
    conn = get_connection()
    max_pos = conn.execute(
        'SELECT COALESCE(MAX(position), -1) FROM shot_list_items WHERE shot_list_id = ?', (sl_id,)
    ).fetchone()[0]
    cur = conn.execute(
        'INSERT INTO shot_list_items (shot_list_id, clip_id, position, note) VALUES (?, ?, ?, ?)',
        (sl_id, clip_id, max_pos + 1, note)
    )
    item_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {'success': True, 'item_id': item_id, 'position': max_pos + 1}


@app.delete('/shot-lists/{sl_id}/items/{item_id}')
def remove_shot_list_item(sl_id: int, item_id: int):
    conn = get_connection()
    conn.execute('DELETE FROM shot_list_items WHERE id = ? AND shot_list_id = ?', (item_id, sl_id))
    conn.commit()
    conn.close()
    return {'success': True}


@app.post('/shot-lists/{sl_id}/reorder')
def reorder_shot_list(sl_id: int, body: dict):
    """body: {ordered_item_ids: [id, id, ...]}"""
    ordered = body.get('ordered_item_ids', [])
    conn = get_connection()
    for pos, item_id in enumerate(ordered):
        conn.execute('UPDATE shot_list_items SET position = ? WHERE id = ? AND shot_list_id = ?',
                     (pos, item_id, sl_id))
    conn.commit()
    conn.close()
    return {'success': True}


# ─── Duplicates ───────────────────────────────────────────────────────────────

@app.get('/duplicates')
def find_duplicates():
    """Find exact and near-duplicate clips by file-hash grouping."""
    import hashlib
    from collections import defaultdict
    from search import get_category_map
    from search import _row_dict_to_clip

    conn = get_connection()
    cats = get_category_map(conn)
    rows = conn.execute(
        '''SELECT c.id, c.filename, c.original_path, c.file_size_bytes,
                  c.thumbnail_path, c.description, c.keywords, c.media_type,
                  c.date_ingested, c.taken_at, c.category_id, c.confidence,
                  c.hidden, c.starred, c.rating, c.shot_type, c.notes,
                  c.status, c.color_data, c.transcript, c.duration_secs,
                  c.proxy_path
           FROM clips c WHERE c.hidden = 0'''
    ).fetchall()
    conn.close()

    # Group by file_size_bytes first (cheap pre-filter)
    size_groups: dict[int, list] = defaultdict(list)
    for r in rows:
        sz = r['file_size_bytes']
        if sz and sz > 0:
            size_groups[sz].append(dict(r))

    def _quick_hash(path: str) -> str | None:
        """Hash first 64 KB + last 64 KB of file — fast and reliable for duplicate detection."""
        try:
            h = hashlib.md5()
            size = os.path.getsize(path)
            with open(path, 'rb') as f:
                h.update(f.read(65536))
                if size > 65536:
                    f.seek(max(0, size - 65536))
                    h.update(f.read())
            return h.hexdigest()
        except Exception:
            return None

    exact_groups: list[list[dict]] = []
    for _size, group in size_groups.items():
        if len(group) < 2:
            continue
        hash_buckets: dict[str, list] = defaultdict(list)
        for clip in group:
            h = _quick_hash(clip['original_path'])
            if h:
                hash_buckets[h].append(clip)
        for bucket in hash_buckets.values():
            if len(bucket) >= 2:
                # Serialize clips to dicts the frontend expects
                clip_dicts = []
                for rd in bucket:
                    rd['_tags'] = []
                    rd['_projects'] = []
                    c = _row_dict_to_clip(rd, cats)
                    clip_dicts.append(c.model_dump())
                exact_groups.append(clip_dicts)

    return {
        'exact_groups': exact_groups,
        'total_duplicates': sum(len(g) - 1 for g in exact_groups),
        'total_groups': len(exact_groups),
    }


@app.post('/bulk-delete')
def bulk_delete_clips(body: dict):
    """Remove clips from index. Optionally move original files to trash."""
    import subprocess as _sp
    clip_ids = body.get('clip_ids', [])
    also_trash = body.get('also_trash_files', False)
    if not clip_ids:
        return {'deleted': 0}

    conn = get_connection()
    deleted = 0
    trashed = 0
    for cid in clip_ids:
        row = conn.execute('SELECT original_path FROM clips WHERE id = ?', (cid,)).fetchone()
        if not row:
            continue
        original_path = row['original_path']
        # Remove from DB (cascade handles related tables via ON DELETE if set, else manual)
        conn.execute('DELETE FROM clip_faces WHERE clip_id = ?', (cid,))
        conn.execute('DELETE FROM clip_tags WHERE clip_id = ?', (cid,))
        conn.execute('DELETE FROM shot_list_items WHERE clip_id = ?', (cid,))
        conn.execute('DELETE FROM clips WHERE id = ?', (cid,))
        deleted += 1
        if also_trash and original_path and os.path.exists(original_path):
            try:
                # Use macOS `trash` command or AppleScript to move to Trash
                _sp.run(['osascript', '-e',
                         f'tell application "Finder" to delete POSIX file "{original_path}"'],
                        capture_output=True, timeout=10)
                trashed += 1
            except Exception:
                pass
    conn.commit()
    conn.close()
    return {'deleted': deleted, 'trashed': trashed}


# ─── Scripture refs ───────────────────────────────────────────────────────────

@app.get('/clips/{clip_id}/scripture')
def get_clip_scripture(clip_id: int):
    conn = get_connection()
    row = conn.execute('SELECT scripture_refs, transcript FROM clips WHERE id = ?', (clip_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, 'Clip not found')
    refs = []
    if row['scripture_refs']:
        try:
            refs = json.loads(row['scripture_refs'])
        except Exception:
            pass
    if not refs and row['transcript']:
        from scripture import detect_scripture_refs
        refs = detect_scripture_refs(row['transcript'])
    return {'scripture_refs': refs}


@app.get('/scripture/search')
def search_by_scripture(book: str = None, reference: str = None):
    """Find clips referencing a scripture (e.g. book='John', reference='John 3:16')."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, filename, thumbnail_path, scripture_refs FROM clips WHERE hidden=0 AND scripture_refs IS NOT NULL AND scripture_refs != '[]'"
    ).fetchall()
    conn.close()
    results = []
    for row in rows:
        try:
            refs = json.loads(row['scripture_refs'] or '[]')
        except Exception:
            continue
        match = False
        for r in refs:
            if reference and reference.lower() in r.get('reference', '').lower():
                match = True; break
            if book and book.lower() in r.get('book', '').lower():
                match = True; break
        if match:
            results.append({'id': row['id'], 'filename': row['filename'], 'scripture_refs': refs})
    return {'clips': results, 'total': len(results)}


# ─── Transcript segments ──────────────────────────────────────────────────────

@app.get('/clips/{clip_id}/transcript-segments')
def get_transcript_segments(clip_id: int):
    conn = get_connection()
    row = conn.execute('SELECT transcript_segments FROM clips WHERE id = ?', (clip_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, 'Clip not found')
    segments = []
    if row['transcript_segments']:
        try:
            segments = json.loads(row['transcript_segments'])
        except Exception:
            pass
    return {'segments': segments}


# ─── Usage tracking ───────────────────────────────────────────────────────────

@app.post('/clips/{clip_id}/mark-used')
async def mark_clip_used(clip_id: int):
    conn = get_connection()
    conn.execute(
        "UPDATE clips SET used_count = COALESCE(used_count, 0) + 1, last_used_at = datetime('now') WHERE id = ?",
        (clip_id,)
    )
    conn.commit()
    conn.close()
    return {'ok': True}


# ─── Background LLaVA description enrichment ─────────────────────────────────

@app.post('/clips/enrich-descriptions')
async def enrich_descriptions():
    """
    SSE stream: run LLaVA on clips that were classified by CLIP (fast path) and
    have a generic description. Enriches their descriptions with real visual detail.
    """
    async def _stream():
        conn = get_connection()
        rows = conn.execute(
            """SELECT id, original_path, thumbnail_path, filename, media_type
               FROM clips
               WHERE hidden=0 AND enriched_by_llava=0
                 AND (description IS NULL OR description=''
                      OR description LIKE '%service with music%'
                      OR description LIKE '%Sermon or teaching%'
                      OR description LIKE '%Baptism ceremony%'
                      OR description LIKE '%ministry or youth%'
                      OR description LIKE '%event or community%'
                      OR description LIKE '%General church%')
               ORDER BY id"""
        ).fetchall()
        total = len(rows)
        if total == 0:
            yield f'data: {json.dumps({"type":"complete","total":0,"done":0})}\n\n'
            conn.close(); return

        yield f'data: {json.dumps({"type":"start","total":total})}\n\n'

        vision_model = get_setting('vision_model', 'llava:13b')
        from vision import classify_frame
        from embeddings import store_embedding

        done = 0; errors = 0
        for row in rows:
            clip_id = row['id']
            thumb = row['thumbnail_path']
            fname = row['filename']

            yield f'data: {json.dumps({"type":"progress","index":done+1,"total":total,"filename":fname})}\n\n'
            await asyncio.sleep(0)

            if not thumb or not os.path.exists(thumb):
                errors += 1; done += 1; continue

            try:
                result = classify_frame(thumb, model=vision_model)
                description = result.get('description', '').strip()
                keywords = result.get('keywords', [])
                if description:
                    conn.execute(
                        'UPDATE clips SET description=?, keywords=?, enriched_by_llava=1 WHERE id=?',
                        (description, json.dumps(keywords), clip_id)
                    )
                    embed_text = f'{description} {" ".join(keywords)}'.strip()
                    store_embedding(conn, clip_id, embed_text)
                    conn.commit()
                done += 1
            except Exception:
                errors += 1; done += 1

        conn.close()
        yield f'data: {json.dumps({"type":"complete","total":total,"done":done-errors,"errors":errors})}\n\n'

    return StreamingResponse(_stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


# ─── Thumbnails ───────────────────────────────────────────────────────────────

@app.get('/thumbnail/{clip_id}')
def get_thumbnail(clip_id: int):
    clip = get_clip_by_id(clip_id)
    if not clip or not clip.thumbnail_path:
        raise HTTPException(404, 'Thumbnail not found')
    if not os.path.exists(clip.thumbnail_path):
        raise HTTPException(404, 'Thumbnail file missing')
    return FileResponse(clip.thumbnail_path, media_type='image/jpeg')


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=PORT,
        log_level='info',
        access_log=False,
    )
