from __future__ import annotations

import base64
import json
import re
import httpx
from collections import Counter
from pathlib import Path

OLLAMA_URL = 'http://localhost:11434'


def _encode_image(image_path: str) -> str:
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def get_category_list() -> list[str]:
    from database import get_connection
    conn = get_connection()
    rows = conn.execute(
        'SELECT name FROM categories ORDER BY sort_order, id'
    ).fetchall()
    conn.close()
    return [r['name'] for r in rows]


def classify_frame(image_path: str, model: str = 'llava:13b') -> dict:
    """Run LLaVA on a single frame. Returns {category, description, keywords}."""
    categories = get_category_list()
    cat_list = ' | '.join(categories)

    prompt = f"""You are a video archivist for a church media team. Church staff will search this footage later using specific terms like "worship", "pastor preaching", "baptism pool", "kids craft", "prayer moment", "congregation singing".

Analyze this image carefully. Respond with ONLY valid JSON — no markdown, no explanation, no extra text.

{{
  "category": "<must be exactly one of: {cat_list}>",
  "description": "<20-35 words — be SPECIFIC: WHO is visible (pastor, worship leader, children, congregation, choir, soloist, speaker, youth), WHAT they are doing (singing, preaching, praying, being baptized, playing, crafting, worshipping), and WHERE (stage, pulpit, baptistry, kids room, lobby, outdoor, auditorium)>",
  "keywords": ["<role: pastor/worship-leader/children/congregation/choir>", "<action: singing/preaching/praying/baptism/crafts>", "<setting: stage/pulpit/auditorium/outdoor/kids-room>", "<mood: celebratory/reverent/intimate/energetic>", "<service type: Sunday service/youth group/VBS/special event>", "<2-4 more specific searchable terms>"]
}}

Example of a GOOD response:
{{
  "category": "Worship",
  "description": "Worship leader with acoustic guitar singing at center stage, congregation with hands raised visible in background during Sunday service",
  "keywords": ["worship leader", "acoustic guitar", "singing", "hands raised", "congregation", "Sunday service", "stage", "praise", "worship band", "contemporary worship"]
}}"""

    image_b64 = _encode_image(image_path)

    try:
        resp = httpx.post(
            f'{OLLAMA_URL}/api/generate',
            json={
                'model': model,
                'prompt': prompt,
                'images': [image_b64],
                'stream': False,
                'options': {'temperature': 0.1, 'num_predict': 256},
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        raw = resp.json().get('response', '{}')

        # Extract JSON from response (model sometimes wraps it in markdown)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
        else:
            data = json.loads(raw)

        # Normalize category to closest match
        returned_cat = data.get('category', '').strip()
        best_cat = _match_category(returned_cat, categories)

        return {
            'category': best_cat,
            'description': data.get('description', '').strip(),
            'keywords': data.get('keywords', [])[:5],
        }
    except Exception as e:
        return {
            'category': 'Unclassified',
            'description': '',
            'keywords': [],
            'error': str(e),
        }


def _match_category(raw: str, categories: list[str]) -> str:
    """Find the closest category name (case-insensitive, partial match)."""
    raw_lower = raw.lower().strip()
    for cat in categories:
        if cat.lower() == raw_lower:
            return cat
    for cat in categories:
        if cat.lower() in raw_lower or raw_lower in cat.lower():
            return cat
    return 'Unclassified'


def majority_vote_classify(frame_results: list[dict]) -> tuple[str, float, str, list[str]]:
    """
    Given results from multiple frames, return:
    (category, confidence, best_description, merged_keywords)
    Uses majority vote for category, picks longest description from winning category,
    and merges + deduplicates keywords across all frames.
    """
    if not frame_results:
        return 'Unclassified', 0.0, '', []

    valid = [r for r in frame_results if r.get('category') and not r.get('error')]
    if not valid:
        return 'Unclassified', 0.0, '', []

    categories = [r['category'] for r in valid]
    counter = Counter(categories)
    top_cat, top_count = counter.most_common(1)[0]
    confidence = top_count / len(categories)

    # Pick the most detailed (longest) description from frames that matched the winning category
    descriptions = [
        r['description'] for r in valid
        if r.get('category') == top_cat and r.get('description')
    ]
    description = max(descriptions, key=len) if descriptions else ''

    # Merge all keywords, preserve originals but deduplicate case-insensitively
    seen = set()
    keywords = []
    all_kw = []
    for r in valid:
        all_kw.extend(r.get('keywords', []))
    kw_counter = Counter(kw.lower().strip() for kw in all_kw if kw.strip())
    for kw, _ in kw_counter.most_common(12):
        if kw not in seen:
            seen.add(kw)
            keywords.append(kw)

    return top_cat, confidence, description, keywords


def check_ollama_status(model: str = 'llava:13b') -> dict:
    """Check if Ollama is running and the specified model is available."""
    try:
        resp = httpx.get(f'{OLLAMA_URL}/api/tags', timeout=5.0)
        resp.raise_for_status()
        models = [m['name'] for m in resp.json().get('models', [])]
        model_available = any(m.startswith(model.split(':')[0]) for m in models)
        return {
            'running': True,
            'model_available': model_available,
            'models': models,
            'url': OLLAMA_URL,
        }
    except Exception as e:
        return {
            'running': False,
            'model_available': False,
            'models': [],
            'url': OLLAMA_URL,
            'error': str(e),
        }
