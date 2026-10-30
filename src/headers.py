"""_headers del Worker: reglas base (src/_headers) + caché del HTML + CSP.

La CSP se arma acá porque depende del HTML generado: los scripts en línea se
autorizan por hash (sin 'unsafe-inline' en script-src) y Umami sólo entra si el
build lo incluyó (UMAMI_ID).
"""
import base64
import hashlib
import re

# Content-Security-Policy-Report-Only no bloquea nada; Content-Security-Policy sí.
CSP_HEADER = 'Content-Security-Policy'

# Dominios de Umami Cloud (script + envío de eventos). Sólo con UMAMI_ID.
UMAMI_SCRIPT = 'https://cloud.umami.is'
UMAMI_CONNECT = ('https://cloud.umami.is', 'https://api-gateway.umami.dev')

# Ruta que no es HTML ni lleva hash: se revalida siempre.
REVALIDATED = ('/sitemap.xml', '/robots.txt', '/site.webmanifest')
REVALIDATE = 'Cache-Control: public, max-age=0, must-revalidate'


def inline_script_hashes(pages):
    """'sha256-…' de cada <script> en línea que se ejecuta (JSON-LD no se ejecuta)."""
    hashes = set()
    for html in pages:
        for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, flags=re.S):
            if 'src=' in attrs or 'ld+json' in attrs or not body.strip():
                continue
            hashes.add("'sha256-" + base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode() + "'")
    return sorted(hashes)


def build_csp(pages):
    umami = any(UMAMI_SCRIPT + '/script.js' in html for html in pages)
    directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", *inline_script_hashes(pages), *([UMAMI_SCRIPT] if umami else [])],
        # style="--i:0" en atributos y el CSS en línea: sin 'unsafe-inline' no hay alternativa razonable.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'", *(UMAMI_CONNECT if umami else ())],
        'frame-src': ['https://www.google.com'],  # mapa, recién al tocar "Ver mapa"
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'self'"],
    }
    return '; '.join(f'{name} {" ".join(values)}' for name, values in directives.items())


def write_files(dist, source, langs, path_for, pages=()):
    # Un solo bloque /*: la CSP va con los demás encabezados globales (dos bloques /* no se combinan).
    base, _, rest = source.strip().partition('\n\n')
    rules = f'{base}\n  {CSP_HEADER}: {build_csp(pages)}\n' + (f'\n{rest}\n' if rest else '')
    routes = sorted({'/' + path_for(lang, page).lstrip('/') for lang in langs for page in ('home', 'privacy')})
    for route in ('/*.html', *routes, *REVALIDATED):
        rules += f'\n{route}\n  {REVALIDATE}\n'
    (dist / '_headers').write_text(rules, encoding='utf-8')
