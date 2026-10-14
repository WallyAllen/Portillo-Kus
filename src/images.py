"""Variantes AVIF/WebP locales para las fotos usadas por la plantilla."""
from io import BytesIO
from pathlib import Path
import re


def prepare_images(source, template):
    names = sorted(set(re.findall(r'<img\b[^>]*\bsrc="[^" ]*portillo-images/([^"/]+)"', template)))
    present = [name for name in names if (source / name).is_file()]
    if not present:
        return {}, {}  # Las fixtures del generador no contienen las fotos reales.
    try:
        from PIL import Image, ImageOps, features
    except ImportError as error:
        raise ValueError('Falta Pillow: instalar explícitamente con python -m pip install -r requirements.txt antes del build.') from error
    if not features.check('avif') or not features.check('webp'):
        raise ValueError('Pillow debe tener encoders AVIF y WebP; instalar el wheel indicado en requirements.txt.')
    assets, files = {}, {}
    for name in present:
        with Image.open(source / name) as original:
            image = ImageOps.exif_transpose(original).convert('RGB')
        width, height = image.size
        sizes = ('100vw' if name.startswith('hero-') else
                 '(min-width: 900px) 300px, (min-width: 640px) 320px, 78vw' if name.startswith('area-') else
                 '(min-width: 900px) 540px, calc(100vw - 48px)' if name in ('ciudadania.jpg', 'estudio.jpg') else
                 '(min-width: 760px) 360px, calc(100vw - 48px)')
        widths = sorted(set(min(width, target) for target in
                            ((480, 960, width) if name.startswith('hero-') else (320, 640, width))))
        variants = {'avif': [], 'webp': []}
        # El logo original mide 150px y 5 KB: no ampliar ni generar variantes inútiles.
        if width >= 320:
            for target in widths:
                resized = image.resize((target, round(height * target / width)), Image.Resampling.LANCZOS)
                for fmt in variants:
                    buffer = BytesIO()
                    options = {'quality': 50, 'speed': 8} if fmt == 'avif' else {'quality': 78, 'method': 5}
                    resized.save(buffer, format=fmt.upper(), **options)
                    filename = f'{Path(name).stem}-{target}.{fmt}'
                    files[filename] = buffer.getvalue()
                    variants[fmt].append((filename, target))
        assets[name] = {'width': width, 'height': height, 'sizes': sizes, 'variants': variants}
    return assets, files


def render_images(markup, assets):
    """<picture> con AVIF/WebP para cada foto con variantes.

    data-preload-media="(consulta)" suma antes un preload AVIF de prioridad alta
    que sólo vale con esa consulta. Lo usa el hero: en móvil cubre la pantalla
    entera, Chrome lo toma como fondo y el LCP es el título, así que va con
    prioridad baja para no quitarle red a las fuentes; en escritorio la foto sí
    es el LCP y el preload le devuelve la prioridad alta.
    """
    def replace(match):
        tag, prefix, name = match.group(0), match.group(1), match.group(2)
        media = re.search(r'\sdata-preload-media="([^"]*)"', tag)
        tag = re.sub(r'\sdata-preload-media="[^"]*"', '', tag)
        asset = assets.get(name)
        if asset is None:
            return tag
        tag = re.sub(r'\s+(?:width|height)="[^"]*"', '', tag)
        tag = tag[:-1] + f' width="{asset["width"]}" height="{asset["height"]}" decoding="async">'
        sources, preload = [], ''
        for fmt, variants in asset['variants'].items():
            if not variants:
                continue
            srcset = ', '.join(f'{prefix}{filename} {width}w' for filename, width in variants)
            sources.append(f'<source type="image/{fmt}" srcset="{srcset}" sizes="{asset["sizes"]}">')
            if media and fmt == 'avif':
                preload = (f'<link rel="preload" as="image" type="image/avif" imagesrcset="{srcset}" '
                           f'imagesizes="{asset["sizes"]}" media="{media.group(1)}" fetchpriority="high">')
        return preload + '<picture>' + ''.join(sources) + tag + '</picture>' if sources else tag
    return re.sub(r'<img\b[^>]*\bsrc="([^" ]*portillo-images/)([^"/]+)"[^>]*>', replace, markup)
