from __future__ import annotations

"""
Dominant color extraction for Beacon.

During ingest, we sample the thumbnail and extract:
  - dominant hex color  (e.g. "#E8A43C")
  - color family label  (e.g. "warm", "cool", "neutral", "dark", "bright")
  - palette of top-5 hex colors

These are stored as JSON in clips.color_data and are used for
filterable color-family fields in the library.
"""

import json
import logging
import struct
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# Color family buckets (hue ranges in degrees 0-360, saturation/lightness weights)
COLOR_FAMILIES = [
    ('red',     (345, 15),   0.4),
    ('orange',  (15,  45),   0.4),
    ('yellow',  (45,  70),   0.3),
    ('green',   (70,  160),  0.4),
    ('teal',    (160, 195),  0.4),
    ('blue',    (195, 255),  0.4),
    ('purple',  (255, 300),  0.4),
    ('pink',    (300, 345),  0.4),
]


def extract_colors(image_path: str, n_colors: int = 5) -> dict | None:
    """
    Extract dominant colors from an image using k-means clustering on RGB pixels.

    Returns:
        {
          "dominant": "#RRGGBB",
          "family": "warm" | "cool" | "neutral" | "dark" | "bright",
          "palette": ["#RRGGBB", ...],  # top n_colors
        }
    or None on failure.
    """
    try:
        from PIL import Image

        img = Image.open(image_path).convert('RGB')

        # Downsample for speed — 64x36 is plenty for color analysis
        img = img.resize((64, 36), Image.LANCZOS)
        pixels = np.array(img, dtype=np.float32).reshape(-1, 3)  # (N, 3)

        # Simple k-means
        centers = _kmeans(pixels, k=n_colors, max_iter=20)

        # Sort centers by cluster size (most common color first)
        labels = _assign(pixels, centers)
        counts = np.bincount(labels, minlength=n_colors)
        order = np.argsort(-counts)
        centers = centers[order]

        palette = [_rgb_to_hex(c) for c in centers]
        dominant = palette[0]
        family = _color_family(centers[0])

        return {
            'dominant': dominant,
            'family': family,
            'palette': palette,
        }

    except Exception as e:
        logger.warning(f'[colors] extract_colors failed for {image_path}: {e}')
        return None


def _kmeans(pixels: np.ndarray, k: int, max_iter: int = 20) -> np.ndarray:
    """Tiny k-means on pixel array. Returns (k, 3) center array."""
    rng = np.random.default_rng(42)
    idx = rng.choice(len(pixels), k, replace=False)
    centers = pixels[idx].copy()

    for _ in range(max_iter):
        labels = _assign(pixels, centers)
        new_centers = np.array([
            pixels[labels == j].mean(axis=0) if (labels == j).any() else centers[j]
            for j in range(k)
        ])
        if np.allclose(centers, new_centers, atol=1.0):
            break
        centers = new_centers

    return centers.astype(np.float32)


def _assign(pixels: np.ndarray, centers: np.ndarray) -> np.ndarray:
    """Assign each pixel to the nearest center. Returns label array."""
    diffs = pixels[:, None, :] - centers[None, :, :]   # (N, k, 3)
    dist2 = (diffs ** 2).sum(axis=2)                    # (N, k)
    return dist2.argmin(axis=1)                          # (N,)


def _rgb_to_hex(rgb: np.ndarray) -> str:
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    r, g, b = max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b))
    return f'#{r:02X}{g:02X}{b:02X}'


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgb_to_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    r, g, b = r / 255, g / 255, b / 255
    cmax = max(r, g, b)
    cmin = min(r, g, b)
    delta = cmax - cmin
    l = (cmax + cmin) / 2

    if delta == 0:
        return 0.0, 0.0, l

    s = delta / (1 - abs(2 * l - 1))

    if cmax == r:
        h = ((g - b) / delta) % 6
    elif cmax == g:
        h = (b - r) / delta + 2
    else:
        h = (r - g) / delta + 4

    h = h * 60
    if h < 0:
        h += 360

    return h, s, l


def _color_family(rgb: np.ndarray) -> str:
    """Map a dominant RGB color to a human-readable family label."""
    r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
    h, s, l = _rgb_to_hsl(r, g, b)

    # Very dark → "dark"
    if l < 0.15:
        return 'dark'
    # Very bright / washed out → "bright" or "neutral"
    if l > 0.85:
        return 'bright'
    # Low saturation → neutral
    if s < 0.15:
        return 'neutral'

    # Map hue to named family
    for name, (lo, hi), _min_s in COLOR_FAMILIES:
        if lo <= hi:
            if lo <= h < hi:
                return name
        else:  # wraps around 360
            if h >= lo or h < hi:
                return name

    return 'neutral'


# Friendly display names for families used in the UI
FAMILY_LABELS = {
    'red':     '🔴 Red',
    'orange':  '🟠 Orange',
    'yellow':  '🟡 Yellow',
    'green':   '🟢 Green',
    'teal':    '🩵 Teal',
    'blue':    '🔵 Blue',
    'purple':  '🟣 Purple',
    'pink':    '🩷 Pink',
    'dark':    '⚫ Dark',
    'bright':  '⚪ Bright',
    'neutral': '🩶 Neutral',
}


def get_family_counts(conn) -> list[dict]:
    """Return color family distribution across all clips."""
    rows = conn.execute(
        "SELECT color_data FROM clips WHERE hidden = 0 AND color_data IS NOT NULL"
    ).fetchall()
    counts: dict[str, int] = {}
    for row in rows:
        try:
            data = json.loads(row['color_data'])
            fam = data.get('family', 'neutral')
            counts[fam] = counts.get(fam, 0) + 1
        except Exception:
            pass
    return [
        {'family': k, 'label': FAMILY_LABELS.get(k, k), 'count': v}
        for k, v in sorted(counts.items(), key=lambda x: -x[1])
    ]
