"""Descarga manual reproducible desde Google Fonts; el build no usa la red.

Ejecutar sólo al actualizar los assets de fuentes. Conserva los WOFF2 oficiales
sin modificar y copia las licencias SIL OFL originales de google/fonts.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

# slug: (consulta de Google Fonts, carpeta de la licencia, subsets)
# Karla no tiene cirílico: /ru usa fuentes del sistema para el texto corrido.
FAMILIES = {
    'cormorant-garamond': ('Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,700',
                           'cormorantgaramond', ('latin', 'cyrillic')),
    'karla': ('Karla:wght@400;600;700', 'karla', ('latin',)),
}
USER_AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36')


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': USER_AGENT}), timeout=30) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'site-fonts')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for slug, (query, license_dir, subsets) in FAMILIES.items():
        css_url = f'https://fonts.googleapis.com/css2?family={query}&display=swap'
        css = fetch(css_url).decode('utf-8')
        downloaded = {}
        for subset in subsets:
            blocks = re.findall(r'/\* ' + subset + r' \*/\s*(@font-face\s*\{[^}]+\})', css)
            if not blocks:
                raise ValueError(f'Google Fonts no devolvió subset {subset} para {slug}')
            for block in blocks:
                style = re.search(r'font-style:\s*([^;]+)', block).group(1)
                weight = re.search(r'font-weight:\s*([^;]+)', block).group(1)
                url = re.search(r'url\((https://fonts.gstatic.com/[^)]+\.woff2)\)', block).group(1)
                # Google sirve WOFF2 variable idéntico para varios pesos: un asset.
                if url not in downloaded:
                    data = fetch(url)
                    name = f'{slug}-{style}-{subset}-{hashlib.sha256(data).hexdigest()[:8]}.woff2'
                    (args.output / name).write_bytes(data)
                    downloaded[url] = (name, data)
                name, data = downloaded[url]
                unicode_range = re.search(r'unicode-range:\s*([^;]+)', block).group(1)
                manifest.append({'file': name, 'family': slug, 'style': style, 'weight': weight,
                                 'subset': subset, 'unicode_range': unicode_range,
                                 'source': url, 'css_source': css_url,
                                 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        license_url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{license_dir}/OFL.txt'
        (args.output / f'{slug}-OFL.txt').write_bytes(fetch(license_url))
    (args.output / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
