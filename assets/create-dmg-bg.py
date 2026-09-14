#!/usr/bin/env python3
"""
Generate the Beacon DMG installer background image.
Run automatically during `npm run build:mac`.
Output: assets/dmg-background.png  (700×430 logical px, saved at 2× for Retina)
"""
import os, sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    print("[dmg-bg] Pillow not available – skipping background generation")
    sys.exit(0)

# ── Canvas ─────────────────────────────────────────────────────────────────────
W, H   = 700, 430   # logical window size (matches package.json dmg.window)
SCALE  = 2           # 2× for Retina
IW, IH = W * SCALE, H * SCALE

# ── Brand colours ──────────────────────────────────────────────────────────────
BG_TOP  = ( 11,  18,  48)   # #0B1230 deep navy
BG_BOT  = (  6,   9,  24)   # #060918 near-black
ACCENT  = (107, 143, 255)   # #6B8FFF periwinkle
ACCENT2 = (160, 127, 255)   # #A07FFF purple
WHITE   = (255, 255, 255)
MUTED   = (170, 176, 210)
DIM     = ( 80,  90, 130)

# ── Helpers ────────────────────────────────────────────────────────────────────
def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

def best_font(size):
    """Return the best available macOS system font at the given pixel size."""
    candidates = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSDisplay.ttf',
        '/System/Library/Fonts/SFNS.ttf',
        '/Library/Fonts/Arial Bold.ttf',
        '/System/Library/Fonts/STHeiti Light.ttc',
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size * SCALE)
            except Exception:
                continue
    return ImageFont.load_default()

def text_center_x(draw, text, font, img_w):
    bb = draw.textbbox((0, 0), text, font=font)
    return (img_w - (bb[2] - bb[0])) // 2

# ── Render ─────────────────────────────────────────────────────────────────────
img  = Image.new('RGB', (IW, IH))
draw = ImageDraw.Draw(img)

# Gradient background
for y in range(IH):
    draw.line([(0, y), (IW, y)], fill=lerp(BG_TOP, BG_BOT, y / IH))

# Soft radial glow at top-centre
glow = Image.new('RGB', (IW, IH), (0, 0, 0))
gd   = ImageDraw.Draw(glow)
cx   = IW // 2
# Inner bright core
gd.ellipse([cx - 220, -160, cx + 220, 300], fill=(25, 38, 100))
# Outer colour haze
gd.ellipse([cx - 400, -300, cx + 400, 500], fill=(18, 22, 70))
glow = glow.filter(ImageFilter.GaussianBlur(90))
img  = Image.blend(img, glow, 0.7)
draw = ImageDraw.Draw(img)

# Subtle accent dot left of logo (decorative)
dot_layer = Image.new('RGB', (IW, IH), (0, 0, 0))
dd = ImageDraw.Draw(dot_layer)
dd.ellipse([cx - 500, 20, cx - 200, 200], fill=(107, 143, 255))
dd.ellipse([cx + 200, 30, cx + 500, 190], fill=(160, 127, 255))
dot_layer = dot_layer.filter(ImageFilter.GaussianBlur(70))
img = Image.blend(img, dot_layer, 0.15)
draw = ImageDraw.Draw(img)

# ── Title: BEACON ────────────────────────────────────────────────────────────
title_font = best_font(30)
title = 'BEACON'
tx = text_center_x(draw, title, title_font, IW)
# Subtle glow pass
for offset in range(3, 0, -1):
    draw.text((tx, 52 * SCALE), title, font=title_font,
              fill=(*ACCENT, max(0, 40 * offset)))
draw.text((tx, 52 * SCALE), title, font=title_font, fill=WHITE)

# ── Subtitle ─────────────────────────────────────────────────────────────────
sub_font = best_font(11)
sub = 'Drag Beacon into your Applications folder and launch it to get started.'
sx = text_center_x(draw, sub, sub_font, IW)
draw.text((sx, 108 * SCALE), sub, font=sub_font, fill=MUTED)

# ── Thin separator ────────────────────────────────────────────────────────────
sep_y = 138 * SCALE
draw.line([(60 * SCALE, sep_y), (640 * SCALE, sep_y)], fill=(*DIM, 80), width=1)

# ── Arrow between App icon and Applications folder ───────────────────────────
# Icons are at x≈150 (app), x≈350 (applications), x≈555 (uninstall)
# Arrow lives between 150 and 350, vertically centred around y=215
AX   = int(250 * SCALE)   # arrow centre x (between x=150 app and x=350 Applications)
AY   = int(210 * SCALE)   # arrow centre y (matches icon y=215 in package.json contents)
ALEN = int(38 * SCALE)    # arrow half-length
ATW  = int(10 * SCALE)    # arrowhead width

arrow_col = (60, 70, 120)
# Shaft
draw.line([(AX - ALEN, AY), (AX + ALEN - ATW, AY)], fill=arrow_col, width=2 * SCALE)
# Head
draw.polygon([
    (AX + ALEN - ATW, AY - ATW),
    (AX + ALEN,       AY),
    (AX + ALEN - ATW, AY + ATW),
], fill=arrow_col)

# ── Version watermark (bottom-right) ─────────────────────────────────────────
ver_font = best_font(7)
ver = 'v0.2.0'
vb  = draw.textbbox((0, 0), ver, font=ver_font)
draw.text((IW - (vb[2] - vb[0]) - 20 * SCALE, IH - 30 * SCALE), ver,
          font=ver_font, fill=DIM)

# ── Save ──────────────────────────────────────────────────────────────────────
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dmg-background.png')
img.save(out, 'PNG', dpi=(144, 144))
print(f'[dmg-bg] Written → {out}')
