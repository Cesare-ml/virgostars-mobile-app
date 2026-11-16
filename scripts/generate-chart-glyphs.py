"""Generate chart glyph textures from OFL Noto fonts into a NEW directory.

Requires Pillow. The generated files are transparent white glyphs, not VirgoStars
original artwork. Names and dimensions match the shared renderer texture contract.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, sys

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'third_party' / 'noto-symbols'
SOURCES = {
    'symbols': ('NotoSansSymbols.ttf', 'f7e7e04b4a24b6c78893d50cbfd2b2f6cae49617ab047bfef668d252adb128f7'),
    'symbols2': ('NotoSansSymbols2-Regular.ttf', '7d5fb73b7ca67a6798101741f5d280a3d016a56a197afcd4199dbb57b4b82a21'),
}
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/generate-chart-glyphs.py output-directory')
out = Path(sys.argv[1]).resolve()
if out.exists():
    raise SystemExit('Output exists; inspect it and choose a new directory')
for name, expected in SOURCES.values():
    if hashlib.sha256((FONTS / name).read_bytes()).hexdigest() != expected:
        raise SystemExit('Font hash mismatch: ' + name)
out.mkdir(parents=True)

def font(key, size):
    face = ImageFont.truetype(str(FONTS / SOURCES[key][0]), size)
    if key == 'symbols':
        face.set_variation_by_name('Bold')
    return face

def image(text, size, *, key='symbols', badge='', retro=False):
    w, h = size
    scale = 3
    im = Image.new('RGBA', (w*scale, h*scale), (0,0,0,0))
    draw = ImageDraw.Draw(im)
    face = font(key, int(h * scale * (0.86 if len(text) == 1 else 0.62)))
    missing = face.getmask(chr(0x10ffff))
    missing_signature = (missing.size, bytes(missing))
    for char in text:
        mask = face.getmask(char)
        if (mask.size, bytes(mask)) == missing_signature:
            raise SystemExit('Font does not contain required glyph: U+%04X' % ord(char))
    box = draw.textbbox((0,0), text, font=face)
    x = (w*scale - (box[2]-box[0]))/2 - box[0]
    y = (h*scale - (box[3]-box[1]))/2 - box[1]
    draw.text((x,y), text, font=face, fill='white')
    small = font('symbols', int(h*scale*0.20))
    if badge:
        draw.text((w*scale*0.68, h*scale*0.08), badge, font=small, fill='white')
    if retro:
        draw.text((w*scale*0.72, h*scale*0.70), 'R', font=small, fill='white')
    return im.resize((w,h), Image.Resampling.LANCZOS)

def save(relative, text, size=(360,249), **kwargs):
    target = out / 'img' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    image(text, size, **kwargs).save(target, format='PNG', optimize=True)

for i in range(12):
    save(f'simboli-bianchi/segni/{i+1:02}.png', chr(0x2648+i))
    save(f'simboli-bianchi/case/{i+1:02}.png', str(i+1), (360,228))

bodies = {
    'Sun': ('☉','symbols2',''), 'Moon': ('☽','symbols',''),
    'Mercury': ('☿','symbols',''), 'Venus': ('♀','symbols',''),
    'Mars': ('♂','symbols',''), 'Jupiter': ('♃','symbols',''),
    'Saturn': ('♄','symbols',''), 'Uranus': ('♅','symbols',''),
    'Neptune': ('♆','symbols',''), 'Pluto': ('♇','symbols',''),
    'Chiron': ('⚷','symbols',''),
    'mean Node': ('☊','symbols','M'), 'true Node': ('☊','symbols','T'),
    'mean Node Sud': ('☋','symbols','M'), 'true Node Sud': ('☋','symbols','T'),
    'mean Apogee': ('⚸','symbols','M'), 'osc. Apogee': ('⚸','symbols','O'),
    'mean Perigee': ('P','symbols','M'), 'osc. Perigee': ('P','symbols','O'),
    'AS': ('AS','symbols',''), 'DS': ('DS','symbols',''),
    'MC': ('MC','symbols',''), 'IC': ('IC','symbols',''),
}
for name, (glyph, face, badge) in bodies.items():
    save(f'simboli-bianchi/elementi-celesti/{name}.png', glyph, key=face, badge=badge)
    save(f'simboli-bianchi/elementi-celesti/{name}-r.png', glyph, key=face, badge=badge, retro=True)
print('Generated', len(list(out.rglob('*.png'))), 'transparent glyph textures at', out)