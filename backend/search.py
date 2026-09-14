from __future__ import annotations

import re
import logging
from database import get_connection
from embeddings import vector_search
from categories import get_category_map
from models import ClipOut

logger = logging.getLogger(__name__)

# Search blend weights
CLIP_VISUAL_WEIGHT = 0.55   # CLIP text→image: finds visual concepts ("smile", "dark", "crowd")
TEXT_EMBED_WEIGHT  = 0.25   # SentenceTransformer text→description: finds tagged topics
KEYWORD_WEIGHT     = 0.20   # Exact keyword match: finds transcripts, filenames


def _clip_visual_search(conn, query: str, top_k: int = 300) -> dict[int, float]:
    """
    CLIP text→image semantic search.
    Converts query to a CLIP text embedding then dot-products against stored
    visual embeddings (generated during ingest). Returns {clip_id: score}.
    This is what makes "smile", "dark background", "crowd" actually work.
    """
    try:
        import numpy as np
        import torch
        from faces import _get_clip   # reuse already-loaded CLIP model

        model, processor = _get_clip()

        # Augment the query with natural language to improve CLIP matching
        augmented = f'a photo of {query}'
        inputs = processor(text=[augmented], return_tensors='pt', padding=True, truncation=True)
        with torch.no_grad():
            text_features = model.get_text_features(**inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        text_vec = text_features.cpu().numpy()[0].astype(np.float32)

        rows = conn.execute(
            'SELECT clip_id, embedding FROM clip_visual_embeddings'
        ).fetchall()
        if not rows:
            return {}

        clip_ids = []
        vecs = []
        for r in rows:
            try:
                vec = np.frombuffer(r['embedding'], dtype=np.float32)
                if len(vec) == 512:
                    clip_ids.append(r['clip_id'])
                    vecs.append(vec)
            except Exception:
                continue

        if not vecs:
            return {}

        matrix = np.stack(vecs)          # (N, 512)
        scores = matrix @ text_vec       # cosine similarity (vecs are L2-normed)

        # Normalize to 0-1 range for blending — CLIP scores typically 0.15–0.35
        min_s, max_s = float(scores.min()), float(scores.max())
        if max_s <= min_s:
            return {}
        scores_norm = (scores - min_s) / (max_s - min_s)

        threshold = 0.25   # bottom 25% discarded
        results = {}
        for clip_id, raw, norm in zip(clip_ids, scores.tolist(), scores_norm.tolist()):
            if norm >= threshold:
                results[clip_id] = norm

        top = sorted(results.items(), key=lambda x: x[1], reverse=True)[:top_k]
        return dict(top)

    except Exception as e:
        logger.debug(f'[search] CLIP visual search failed: {e}')
        return {}


def parse_query(raw: str) -> dict:
    """
    Power search syntax:
      visual:"..."  → description + keywords only
      speech:"..."  → transcript only
      plain text    → hybrid (vector + keyword)
    """
    result = {'visual_query': None, 'speech_query': None, 'base_query': None, 'mode': 'hybrid'}
    visual_match = re.search(r'visual:"([^"]+)"', raw, re.IGNORECASE)
    speech_match = re.search(r'speech:"([^"]+)"', raw, re.IGNORECASE)

    if visual_match:
        result['visual_query'] = visual_match.group(1).strip()
    if speech_match:
        result['speech_query'] = speech_match.group(1).strip()

    if result['visual_query'] and result['speech_query']:
        result['mode'] = 'both'
    elif result['visual_query']:
        result['mode'] = 'visual'
    elif result['speech_query']:
        result['mode'] = 'speech'
    else:
        clean = raw.strip()
        if clean:
            result['base_query'] = clean
            result['mode'] = 'hybrid'
    return result


def keyword_score(text: str, query: str) -> float:
    if not text or not query:
        return 0.0
    terms = query.lower().split()
    text_lower = text.lower()
    matched = sum(1 for t in terms if t in text_lower)
    return matched / len(terms) if terms else 0.0


def search_clips(
    query: str,
    category_id: int = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[ClipOut], str]:
    if not query.strip():
        return _get_all(category_id, limit, offset), 'all'

    parsed = parse_query(query)
    mode = parsed['mode']
    conn = get_connection()
    cats = get_category_map(conn)

    base_sql = 'SELECT * FROM clips WHERE hidden = 0'
    params = []
    if category_id:
        base_sql += ' AND category_id = ?'
        params.append(category_id)

    rows = conn.execute(base_sql, params).fetchall()
    scored = []

    if mode == 'visual':
        q = parsed['visual_query']
        for row in rows:
            rd = dict(row)
            text = ' '.join(filter(None, [rd.get('description', ''), rd.get('keywords', '')]))
            s = keyword_score(text, q)
            if s > 0:
                scored.append((rd, s, 'visual'))

    elif mode == 'speech':
        q = parsed['speech_query']
        for row in rows:
            rd = dict(row)
            s = keyword_score(rd.get('transcript', '') or '', q)
            if s > 0:
                scored.append((rd, s, 'speech'))

    elif mode == 'both':
        v_q, s_q = parsed['visual_query'], parsed['speech_query']
        for row in rows:
            rd = dict(row)
            vs = keyword_score(' '.join(filter(None, [rd.get('description', ''), rd.get('keywords', '')])), v_q)
            ss = keyword_score(rd.get('transcript', '') or '', s_q)
            combined = (vs + ss) / 2
            if combined > 0:
                scored.append((rd, combined, 'both'))

    else:
        # Hybrid: SigLIP (primary visual) + text embeddings + keyword + person name
        q = parsed['base_query'] or query.strip()

        # SigLIP text→image: gold standard — understands "2 people", "raising hands",
        # "blue sky", "smiling woman", etc. directly from visual content
        siglip_scores: dict[int, float] = {}
        try:
            import siglip as _siglip
            siglip_scores = _siglip.search(conn, q, top_k=300)
        except Exception:
            pass

        # Fallback CLIP visual search if SigLIP embeddings not yet generated
        if not siglip_scores:
            siglip_scores = _clip_visual_search(conn, q, top_k=300)

        # SentenceTransformer text→description: finds AI-labeled topics
        text_embed_scores: dict[int, float] = {}
        try:
            text_embed_scores = vector_search(conn, q, top_k=300)
        except Exception:
            pass

        # Person-name search
        person_clip_ids: set[int] = set()
        try:
            person_rows = conn.execute(
                '''SELECT cf.clip_id FROM clip_faces cf
                   JOIN persons p ON p.id = cf.person_id
                   WHERE p.name IS NOT NULL AND LOWER(p.name) LIKE ?''',
                (f'%{q.lower()}%',)
            ).fetchall()
            person_clip_ids = {r['clip_id'] for r in person_rows}
        except Exception:
            pass

        has_siglip = bool(siglip_scores)
        # vector_search() already applies statistical thresholding and normalises
        # scores to 0-1, so any clip present in text_embed_scores has meaningful signal.
        text_embed_useful = bool(text_embed_scores)

        for row in rows:
            rd = dict(row)
            clip_id = rd['id']

            sig_s  = siglip_scores.get(clip_id, 0.0)
            text_s = text_embed_scores.get(clip_id, 0.0) if text_embed_useful else 0.0

            # Include category name so queries like "worship" / "kids" work even
            # when keywords are generic
            full_text = ' '.join(filter(None, [
                rd.get('description', ''),
                rd.get('transcript', ''),
                rd.get('keywords', ''),
                rd.get('filename', ''),
                cats.get(rd.get('category_id'), {}).get('name', '') if cats else '',
            ]))
            kw_s = keyword_score(full_text, q)
            person_boost = 0.5 if clip_id in person_clip_ids else 0.0

            if has_siglip:
                # SigLIP already pre-filtered by mean+std — scores here are 0-1 within matches
                score = (
                    0.65 * sig_s +
                    0.20 * text_s +
                    0.15 * kw_s +
                    person_boost
                )
                threshold = 0.01   # SigLIP already filtered; just pass everything through
            elif text_embed_useful:
                # No visual embeddings but text embeddings are available.
                # text_s is already normalised 0-1 by vector_search; use it as primary signal.
                score = (
                    0.60 * text_s +
                    0.30 * kw_s +
                    person_boost
                )
                threshold = 0.05   # low — text embeddings already filtered by statistics
            else:
                # Last resort: pure keyword + person name
                score = KEYWORD_WEIGHT * kw_s + person_boost
                threshold = 0.05   # was 0.10; relax so partial matches surface

            if score > threshold:
                v_match = sig_s > 0.3 or text_s > 0.3 or keyword_score(rd.get('description', '') or '', q) > 0 or clip_id in person_clip_ids
                s_match = keyword_score(rd.get('transcript', '') or '', q) > 0
                mt = 'both' if (v_match and s_match) else ('speech' if s_match else 'visual')
                scored.append((rd, score, mt))

    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[offset:offset + limit]

    results = []
    for row_dict, score, mt in scored:
        clip = _row_dict_to_clip(row_dict, cats)
        clip.match_type = mt
        clip.score = round(score, 3)
        results.append(clip)

    conn.close()
    return results, mode


def _row_dict_to_clip(row: dict, cats: dict) -> ClipOut:
    import json as _json
    from database import CATEGORY_COLORS
    kw = []
    if row.get('keywords'):
        try:
            kw = _json.loads(row['keywords'])
        except Exception:
            kw = []
    cat_id = row.get('category_id')
    cat_name = None
    cat_color = None
    if cats and cat_id:
        cat = cats.get(cat_id)
        if cat:
            cat_name = cat['name']
            cat_color = CATEGORY_COLORS[cat['color_index'] % len(CATEGORY_COLORS)]
    # Parse color data
    color_data = None
    if row.get('color_data'):
        try:
            import json as _json2
            color_data = _json2.loads(row['color_data'])
        except Exception:
            pass

    # Load tags for this clip (stored separately in clip_tags)
    tags_list = row.get('_tags') or []

    return ClipOut(
        id=row['id'],
        filename=row['filename'],
        original_path=row['original_path'],
        category_id=cat_id,
        category_name=cat_name,
        category_color=cat_color,
        confidence=row.get('confidence') or 0.0,
        description=row.get('description'),
        keywords=kw,
        transcript=row.get('transcript'),
        thumbnail_path=row.get('thumbnail_path'),
        duration_secs=row.get('duration_secs'),
        file_size_bytes=row.get('file_size_bytes'),
        media_type=row.get('media_type'),
        hidden=bool(row.get('hidden', 0)),
        date_ingested=row.get('date_ingested') or '',
        taken_at=row.get('taken_at'),
        color_data=color_data,
        starred=bool(row.get('starred', 0)),
        rating=int(row.get('rating') or 0),
        shot_type=row.get('shot_type'),
        tags=tags_list,
        notes=row.get('notes'),
        status=row.get('status') or 'unreviewed',
        projects=row.get('_projects') or [],
    )


def _get_all(category_id: int = None, color_family: str = None, starred: bool = False,
             rating_min: int = 0, shot_type: str = None, status: str = None,
             has_project: bool = False, no_project: bool = False,
             limit: int = 100, offset: int = 0) -> list[ClipOut]:
    conn = get_connection()
    cats = get_category_map(conn)
    sql = 'SELECT * FROM clips WHERE hidden = 0'
    params = []
    if category_id:
        sql += ' AND category_id = ?'
        params.append(category_id)
    if color_family:
        sql += " AND json_extract(color_data, '$.family') = ?"
        params.append(color_family)
    if starred:
        sql += ' AND starred = 1'
    if rating_min and rating_min > 0:
        sql += ' AND rating >= ?'
        params.append(rating_min)
    if shot_type:
        sql += ' AND shot_type = ?'
        params.append(shot_type)
    if status:
        sql += ' AND status = ?'
        params.append(status)
    if has_project:
        sql += ' AND id IN (SELECT clip_id FROM clip_projects)'
    if no_project:
        sql += ' AND id NOT IN (SELECT clip_id FROM clip_projects)'
    sql += ' ORDER BY date_ingested DESC LIMIT ? OFFSET ?'
    params += [limit, offset]
    rows = conn.execute(sql, params).fetchall()

    # Fetch project memberships for these clips in one query
    clip_ids = [dict(r)['id'] for r in rows]
    projects_map: dict[int, list] = {}
    if clip_ids:
        placeholders = ','.join('?' * len(clip_ids))
        proj_rows = conn.execute(
            f'''SELECT cp.clip_id, p.id, p.name, p.color
                FROM clip_projects cp JOIN projects p ON p.id = cp.project_id
                WHERE cp.clip_id IN ({placeholders})''',
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
        results.append(_row_dict_to_clip(rd, cats))
    return results


def get_clip_by_id(clip_id: int) -> ClipOut | None:
    conn = get_connection()
    cats = get_category_map(conn)
    row = conn.execute('SELECT * FROM clips WHERE id = ?', (clip_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return _row_dict_to_clip(dict(row), cats)
