"""Genera src/icons/ (favicon.svg, favicon.ico, apple-touch-icon.png) con las iniciales PK.

Usa Cormorant Garamond (site-fonts) sobre el fondo #F7F5F1 y el granate de marca.
Se corre a mano cuando cambia la marca; los resultados se commitean.
Uso: python scripts/generar-iconos.py   (necesita Pillow y fontTools+brotli)
"""
import io
import pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "icons"
BG, BRAND = "#F7F5F1", "#9B1C31"
FONT = next((ROOT / "site-fonts").glob("cormorant-garamond-normal-latin-*.woff2"))

font = TTFont(FONT)
if "fvar" in font:  # fuente variable: fijar el peso 700
    from fontTools.varLib.instancer import instantiateVariableFont
    font = instantiateVariableFont(font, {"wght": 700})
buf = io.BytesIO(); font.flavor = None; font.save(buf); ttf = buf.getvalue()

gs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
names = [cmap[ord(c)] for c in "PK"]
adv = [font["hmtx"][n][0] for n in names]
width, size = sum(adv), 64 * 0.62  # tamaño de la fuente dentro de un lienzo de 64
scale = size / upm * 1.0
x0 = (64 - width * scale) / 2
cap = getattr(font["OS/2"], "sCapHeight", 0.63 * upm) or 0.63 * upm
y_base = 32 + cap * scale / 2  # centra las mayúsculas en vertical
d, x = "", x0
for n, a in zip(names, adv):
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    gs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y_base)))
    d += pen.getCommands(); x += a * scale
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
       f'<rect width="64" height="64" rx="12" fill="{BG}"/>'
       f'<path d="{d}" fill="{BRAND}"/></svg>\n')
(OUT / "favicon.svg").write_text(svg, encoding="utf-8")


def raster(px, radius):
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, px - 1, px - 1), radius, fill=BG)
    f = ImageFont.truetype(io.BytesIO(ttf), int(px * 0.62))
    ImageDraw.Draw(img).text((px / 2, px / 2), "PK", font=f, fill=BRAND, anchor="mm")
    return img


raster(180, 0).convert("RGB").save(OUT / "apple-touch-icon.png")  # iOS redondea solo
big = raster(256, 48)
big.save(OUT / "favicon.ico", sizes=[(32, 32)])
raster(192, 36).save(OUT / "icon-192.png")
raster(512, 96).save(OUT / "icon-512.png")
print("ok", sorted(p.name for p in OUT.iterdir()))
