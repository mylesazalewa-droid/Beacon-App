from __future__ import annotations
"""
SigLIP so400m-patch14-384 — gold standard image-text embedding for Beacon visual search.
878M params, 1152-dim embeddings, far superior to CLIP ViT-B/32 for zero-shot queries like:
  "2 people", "raising hands", "blue sky", "smiling woman", "dark stage lighting"
"""

import logging
import numpy as np

logger = logging.getLogger(__name__)

SIGLIP_DIM = 1152
MODEL_NAME = 'google/siglip-so400m-patch14-384'

_model = None
_processor = None
_HAS_SIGLIP = None


def _get_siglip():
    global _model, _processor, _HAS_SIGLIP
    if _HAS_SIGLIP is None:
        try:
            import torch
            from transformers import AutoProcessor, AutoModel
            logger.info('[siglip] Loading SigLIP so400m-patch14-384…')
            _model = AutoModel.from_pretrained(MODEL_NAME)
            _processor = AutoProcessor.from_pretrained(MODEL_NAME)
            _model.eval()
            _HAS_SIGLIP = True
            logger.info('[siglip] Ready')
        except Exception as e:
            logger.warning(f'[siglip] Could not load: {e}')
            _HAS_SIGLIP = False
    return (_model, _processor) if _HAS_SIGLIP else (None, None)


def embed_image(image_path: str) -> np.ndarray | None:
    """Return normalized 1152-dim SigLIP visual embedding for an image file."""
    model, processor = _get_siglip()
    if model is None:
        return None
    try:
        import torch
        from PIL import Image as PILImage
        img = PILImage.open(image_path).convert('RGB')
        inputs = processor(images=img, return_tensors='pt')
        with torch.no_grad():
            out = model.vision_model(**inputs)
            emb = out.pooler_output          # (1, 1152)
            emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy()[0].astype(np.float32)
    except Exception as e:
        logger.warning(f'[siglip] embed_image failed for {image_path}: {e}')
        return None


def embed_text(text: str) -> np.ndarray | None:
    """Return normalized 1152-dim SigLIP text embedding. Fast after model is loaded."""
    model, processor = _get_siglip()
    if model is None:
        return None
    try:
        import torch
        # SigLIP processor returns only input_ids for text (no attention_mask).
        # Use get_text_features() which handles inputs correctly.
        inputs = processor(text=[text], return_tensors='pt', padding='max_length')
        with torch.no_grad():
            out = model.get_text_features(
                input_ids=inputs['input_ids'],
                attention_mask=inputs.get('attention_mask'),  # None if not returned
            )
            # transformers >=5.x returns BaseModelOutputWithPooling instead of a raw tensor
            emb = out.pooler_output if hasattr(out, 'pooler_output') else out
            emb = emb / emb.norm(dim=-1, keepdim=True)
        return emb.cpu().numpy()[0].astype(np.float32)
    except Exception as e:
        logger.warning(f'[siglip] embed_text failed: {e}')
        return None


def search(conn, query: str, top_k: int = 300) -> dict[int, float]:
    """
    Search clip_siglip_embeddings using natural language.
    Returns {clip_id: normalized_score_0_to_1}.
    Falls back to {} if SigLIP not loaded or no embeddings stored.
    """
    query_vec = embed_text(query)
    if query_vec is None:
        return {}

    rows = conn.execute(
        'SELECT clip_id, embedding FROM clip_siglip_embeddings'
    ).fetchall()
    if not rows:
        return {}

    clip_ids, vecs = [], []
    for r in rows:
        try:
            vec = np.frombuffer(r['embedding'], dtype=np.float32)
            if len(vec) == SIGLIP_DIM:
                clip_ids.append(r['clip_id'])
                vecs.append(vec)
        except Exception:
            continue

    if not vecs:
        return {}

    matrix = np.stack(vecs)          # (N, 1152)
    raw_scores = matrix @ query_vec  # cosine similarity (both normalized → dot = cosine)

    # Statistical threshold: only return clips with score > mean + 0.8*std.
    # This adapts to the actual score distribution for each query:
    # - A query that matches some clips produces high spread → threshold selects only top matches
    # - A query that matches nothing produces low spread → nearly nothing passes threshold
    # SigLIP cosine similarities are typically in [-0.15, +0.20] range.
    mean_s = float(raw_scores.mean())
    std_s  = float(raw_scores.std())
    threshold = mean_s + 0.8 * std_s

    # Also require the score spread to be meaningful (rejects gibberish queries)
    if std_s < 0.01:
        return {}

    results = {}
    for cid, raw in zip(clip_ids, raw_scores.tolist()):
        if raw >= threshold:
            results[cid] = float(raw)

    if not results:
        return {}

    # Scale scores to 0–1 range within the qualifying set for display
    vals = list(results.values())
    min_s, max_s = min(vals), max(vals)
    if max_s > min_s:
        results = {cid: (s - min_s) / (max_s - min_s) for cid, s in results.items()}
    else:
        results = {cid: 1.0 for cid in results}

    top = sorted(results.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return dict(top)
