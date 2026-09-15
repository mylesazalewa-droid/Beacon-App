"""
CLIP zero-shot classification — replaces Ollama/LLaVA.

~100ms per image vs 30s for LLaVA.  Same CLIP model used for visual embeddings.
Falls back gracefully if CLIP is unavailable.
"""
from __future__ import annotations

import logging
from typing import Optional
from PIL import Image

logger = logging.getLogger(__name__)

# ── Category definitions ───────────────────────────────────────────────────────
# Each category maps to a list of natural language prompts.
# More prompts = more robust zero-shot matching.

CATEGORY_PROMPTS: dict[str, list[str]] = {
    'Worship': [
        'church worship service with singing',
        'congregation singing hymns',
        'worship band playing music on stage',
        'people raising hands in praise',
        'choir singing in church',
        'live music performance at church',
        'worship leader singing on stage',
    ],
    'Sermon': [
        'pastor preaching a sermon',
        'minister speaking at pulpit',
        'priest giving a speech at church',
        'pastor teaching the bible',
        'preacher speaking to congregation',
        'man speaking at lectern in church',
    ],
    'Baptism': [
        'baptism ceremony in water',
        'person being baptized',
        'water baptism in a tank',
        'baptismal immersion ceremony',
        'pastor baptizing someone',
        'baptism in a river or pool',
    ],
    'Kids Ministry': [
        'children in sunday school class',
        'kids at church event',
        'youth group activities',
        'children doing crafts at church',
        'kids ministry program',
        'young children playing or learning at church',
    ],
    'Events': [
        'church event or gathering',
        'community celebration at church',
        'church conference or seminar',
        'wedding ceremony at church',
        'graduation ceremony',
        'church fundraiser or fair',
        'holiday celebration at church',
    ],
    'Unclassified': [
        'miscellaneous church media footage',
        'generic video clip',
    ],
}

# ── Model singleton ────────────────────────────────────────────────────────────
_processor = None
_model = None
_category_embeddings: dict[str, 'np.ndarray'] = {}  # cached per-category text embeddings

_LOADED = False
_FAILED = False


def _load_clip():
    global _processor, _model, _LOADED, _FAILED
    if _LOADED or _FAILED:
        return _LOADED
    try:
        import torch
        from transformers import CLIPProcessor, CLIPModel
        logger.info('[clip_classify] Loading CLIP ViT-L/14 model…')
        _model = CLIPModel.from_pretrained('openai/clip-vit-large-patch14')
        _processor = CLIPProcessor.from_pretrained('openai/clip-vit-large-patch14')
        _model.eval()
        _LOADED = True
        logger.info('[clip_classify] CLIP ViT-L/14 ready')
    except Exception as e:
        logger.warning(f'[clip_classify] CLIP unavailable: {e}')
        _FAILED = True
    return _LOADED


def _get_text_embeddings() -> dict[str, 'np.ndarray'] | None:
    """Compute and cache mean text embeddings for each category."""
    global _category_embeddings
    if _category_embeddings:
        return _category_embeddings
    if not _load_clip():
        return None

    import torch
    import numpy as np

    with torch.no_grad():
        for cat_name, prompts in CATEGORY_PROMPTS.items():
            inputs = _processor(text=prompts, return_tensors='pt', padding=True, truncation=True)
            out = _model.get_text_features(**inputs)
            # transformers >=5.x returns a wrapped output instead of a raw tensor
            text_features = out.pooler_output if hasattr(out, 'pooler_output') else out
            # normalize
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            # mean pool across prompts
            mean_feat = text_features.mean(dim=0)
            mean_feat = mean_feat / mean_feat.norm()
            _category_embeddings[cat_name] = mean_feat.numpy()

    return _category_embeddings


def classify_image(image_path: str) -> dict:
    """
    Zero-shot classify an image using CLIP.

    Returns:
        {
            'category': str,
            'confidence': float,   # 0..1
            'description': str,
            'keywords': list[str],
            'scores': dict[str, float],  # all category scores
        }
    Returns empty dict on failure (caller falls back to LLaVA).
    """
    if not _load_clip():
        return {}

    text_embeddings = _get_text_embeddings()
    if text_embeddings is None:
        return {}

    import torch
    import numpy as np

    try:
        img = Image.open(image_path).convert('RGB')
    except Exception as e:
        logger.warning(f'[clip_classify] Cannot open {image_path}: {e}')
        return {}

    try:
        with torch.no_grad():
            inputs = _processor(images=img, return_tensors='pt')
            out = _model.get_image_features(**inputs)
            image_features = out.pooler_output if hasattr(out, 'pooler_output') else out
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            img_vec = image_features[0].numpy()

        # cosine similarity against each category
        scores: dict[str, float] = {}
        for cat_name, text_vec in text_embeddings.items():
            scores[cat_name] = float(np.dot(img_vec, text_vec))

        # softmax to get probabilities
        score_arr = np.array(list(scores.values()), dtype=np.float32)
        # scale scores to make softmax less flat
        score_arr = score_arr * 10.0
        exp = np.exp(score_arr - score_arr.max())
        probs = exp / exp.sum()
        prob_map = dict(zip(scores.keys(), probs.tolist()))

        best_cat = max(prob_map, key=lambda k: prob_map[k])
        confidence = float(prob_map[best_cat])

        # Build a simple description from category
        description = _make_description(best_cat, confidence)
        keywords = _make_keywords(best_cat)

        return {
            'category': best_cat,
            'confidence': confidence,
            'description': description,
            'keywords': keywords,
            'scores': prob_map,
        }

    except Exception as e:
        logger.error(f'[clip_classify] Inference error: {e}')
        return {}


def classify_frames(frame_paths: list[str]) -> dict:
    """
    Classify multiple frames and return the majority-vote result.
    Much faster than calling LLaVA per frame.
    """
    if not frame_paths:
        return {}

    all_results = [classify_image(p) for p in frame_paths if p]
    valid = [r for r in all_results if r]
    if not valid:
        return {}

    if len(valid) == 1:
        return valid[0]

    # Aggregate: sum probabilities across frames
    import numpy as np
    cats = list(CATEGORY_PROMPTS.keys())
    combined = np.zeros(len(cats))
    for r in valid:
        for i, cat in enumerate(cats):
            combined[i] += r.get('scores', {}).get(cat, 0.0)
    combined /= len(valid)

    best_idx = int(np.argmax(combined))
    best_cat = cats[best_idx]
    confidence = float(combined[best_idx])

    description = _make_description(best_cat, confidence)
    keywords = _make_keywords(best_cat)

    return {
        'category': best_cat,
        'confidence': confidence,
        'description': description,
        'keywords': keywords,
        'scores': dict(zip(cats, combined.tolist())),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

_DESCRIPTIONS = {
    'Worship': 'Worship service with music and congregational singing.',
    'Sermon': 'Sermon or teaching from the pastor.',
    'Baptism': 'Baptism ceremony.',
    'Kids Ministry': 'Children\'s ministry or youth program.',
    'Events': 'Church event or community gathering.',
    'Unclassified': 'General church media content.',
}

_KEYWORDS: dict[str, list[str]] = {
    'Worship': ['worship', 'music', 'singing', 'praise', 'church'],
    'Sermon': ['sermon', 'preaching', 'pastor', 'teaching', 'bible'],
    'Baptism': ['baptism', 'water', 'ceremony', 'church'],
    'Kids Ministry': ['children', 'kids', 'youth', 'ministry', 'sunday school'],
    'Events': ['event', 'celebration', 'gathering', 'community', 'church'],
    'Unclassified': ['church', 'media'],
}


def _make_description(category: str, confidence: float) -> str:
    base = _DESCRIPTIONS.get(category, 'Church media content.')
    return base


def _make_keywords(category: str) -> list[str]:
    return _KEYWORDS.get(category, ['church'])


# ── Shot type classification ──────────────────────────────────────────────────
# Separate from category — describes the composition/framing of the shot.

SHOT_TYPE_PROMPTS: dict[str, list[str]] = {
    'wide': [
        'a wide establishing shot of a room or venue',
        'full room view showing everyone',
        'wide angle view of a stage or sanctuary',
    ],
    'close-up': [
        'a close-up portrait of a person',
        'tight shot of a face',
        'face and shoulders of one person',
    ],
    'crowd': [
        'a large crowd of many people gathered together',
        'audience filling a room',
        'many faces in a congregation',
    ],
    'speaker': [
        'a person speaking or preaching on stage',
        'someone at a podium giving a speech',
        'presenter speaking to an audience',
    ],
    'worship': [
        'musicians playing instruments on a stage',
        'worship band performing',
        'singer with a microphone leading music',
    ],
    'baptism': [
        'a water baptism ceremony',
        'someone being immersed in water',
        'baptism pool or baptismal tank',
    ],
    'outdoor': [
        'an outdoor scene with sky or nature',
        'exterior of a building or grounds',
        'people gathered outside',
    ],
    'kids': [
        'children playing or doing an activity',
        'young kids in a classroom or ministry',
        'children smiling and having fun',
    ],
    'prayer': [
        'people bowing heads in prayer',
        'hands raised in worship or prayer',
        'congregation in a moment of prayer',
    ],
    'candid': [
        'a candid informal moment between people',
        'behind the scenes conversation',
        'people talking or laughing casually',
    ],
}

_shot_type_embeddings: dict[str, 'np.ndarray'] = {}


def _get_shot_type_embeddings() -> dict[str, 'np.ndarray'] | None:
    global _shot_type_embeddings
    if _shot_type_embeddings:
        return _shot_type_embeddings
    if not _load_clip():
        return None
    import torch
    import numpy as np
    with torch.no_grad():
        for shot_name, prompts in SHOT_TYPE_PROMPTS.items():
            inputs = _processor(text=prompts, return_tensors='pt', padding=True, truncation=True)
            out = _model.get_text_features(**inputs)
            text_features = out.pooler_output if hasattr(out, 'pooler_output') else out
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            mean_feat = text_features.mean(dim=0)
            mean_feat = mean_feat / mean_feat.norm()
            _shot_type_embeddings[shot_name] = mean_feat.numpy()
    return _shot_type_embeddings


def classify_shot_type(image_path: str) -> str | None:
    """
    Zero-shot classify the shot type/composition of an image using CLIP.
    Returns one of: wide, close-up, crowd, speaker, worship, baptism,
                    outdoor, kids, prayer, candid — or None on failure.
    """
    if not _load_clip():
        return None
    embeddings = _get_shot_type_embeddings()
    if embeddings is None:
        return None
    import torch
    import numpy as np
    try:
        img = Image.open(image_path).convert('RGB')
        with torch.no_grad():
            inputs = _processor(images=img, return_tensors='pt')
            out = _model.get_image_features(**inputs)
            image_features = out.pooler_output if hasattr(out, 'pooler_output') else out
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            img_vec = image_features[0].numpy()
        scores = {k: float(np.dot(img_vec, v)) for k, v in embeddings.items()}
        return max(scores, key=lambda k: scores[k])
    except Exception as e:
        logger.debug(f'[clip_classify] shot_type failed for {image_path}: {e}')
        return None
