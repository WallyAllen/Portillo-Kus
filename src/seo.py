"""Metadatos y archivos SEO a partir de contenido confirmado."""
import html
import json
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

# La URL pública del sitio, sin barra final. Todas las URLs absolutas salen de acá.
SITE_URL = 'https://portillokusestudio.com'
PENDING = '[PENDIENTE]'


def can_index(base_url):
    """Producción se indexa por defecto; NOINDEX=1 o cualquier otra URL lo bloquea."""
    url, final = urlsplit(base_url), urlsplit(SITE_URL)
    return (os.environ.get('NOINDEX') != '1' and url.scheme == final.scheme
            and url.hostname == final.hostname and url.path in ('', '/'))


def plain(value):
    return re.sub(r'<[^>]*>', '', str(value)).strip()


def valid_maps_url(value):
    """Sólo una URL https de Google Maps, sin credenciales: lo demás no se enlaza ni se declara."""
    try:
        parts = urlsplit(str(value).strip())
        return (parts.scheme == 'https' and parts.hostname in
                ('www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl')
                and not parts.username and not parts.password
                and (parts.path.startswith('/maps/') or parts.hostname == 'maps.app.goo.gl'))
    except ValueError:
        return False


def business(flat, base_url, image, langs, estudio):
    """LegalService con los datos de ESTUDIO (build.py), los mismos que muestra el pie."""
    horario = estudio['horario']
    data = {
        '@type': 'LegalService', '@id': base_url + '#estudio',
        'name': estudio['nombre'], 'url': base_url,
        'logo': base_url + 'portillo-images/logo.png', 'image': image,
        'telephone': estudio['telefono'], 'email': estudio['email'],
        'address': {'@type': 'PostalAddress', **estudio['direccion']},
        'openingHoursSpecification': [{'@type': 'OpeningHoursSpecification',
                    'dayOfWeek': horario['dias'], 'opens': horario['abre'], 'closes': horario['cierra']}],
        'areaServed': {'@type': 'Country', 'name': 'Argentina'},
        'knowsLanguage': [l['html_lang'] for l in langs],
        'sameAs': list(estudio['redes'].values()),
        'employee': {'@type': 'Person', 'name': plain(flat['estudio.name']),
                     'jobTitle': plain(flat['estudio.role'])},
        'hasOfferCatalog': {'@type': 'OfferCatalog', 'name': plain(flat['areas.eyebrow']),
                    'itemListElement': [{'@type': 'Offer', 'itemOffered': {
                        '@type': 'Service', 'name': plain(flat[f'areas.a{i}_title'])}}
                        for i in range(1, 10)]},
    }
    if valid_maps_url(flat.get('google_maps_url', '')):
        data['hasMap'] = str(flat['google_maps_url']).strip()
    # Traducciones del sitio no acreditan los idiomas de atención del estudio.
    contact_languages = flat.get('seo.contact_languages', '')
    if contact_languages and not str(contact_languages).startswith(PENDING):
        codes = [s.strip() for s in str(contact_languages).split(',') if s.strip()]
        if not codes or any(not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', code) for code in codes):
            raise ValueError('seo.contact_languages debe contener códigos de idioma separados por coma.')
        data['contactPoint'] = {'@type': 'ContactPoint',
            'telephone': estudio['telefono'], 'contactType': 'customer service',
            'availableLanguage': codes}
    return data


def metadata(lang, flat, base_url, path, page='home', langs=(), estudio=None):
    canonical = base_url + path
    title = flat['meta.title'] if page == 'home' else flat['privacy.meta_title']
    description = flat['meta.description'] if page == 'home' else flat['privacy.description']
    title, description = plain(title), plain(description)
    if title.startswith(PENDING) or description.startswith(PENDING):
        raise ValueError(f'{lang["code"]}: los metadatos deben describir servicios confirmados, sin reseñas pendientes.')
    if len(title) > 60 or len(description) > 155:
        raise ValueError(f'{lang["code"]}/{page}: título ({len(title)}) o descripción ({len(description)}) demasiado largos.')
    image = f'{base_url}portillo-images/og-{lang["code"]}.jpg'
    esc = lambda value: html.escape(str(value), quote=True)
    tags = [f'<link rel="canonical" href="{esc(canonical)}">']
    # Sólo las vistas de prueba llevan robots: sin la etiqueta, producción se indexa.
    if not can_index(base_url):
        tags.append('<meta name="robots" content="noindex, nofollow">')
    tags += ['<meta property="og:type" content="website">',
            f'<meta property="og:site_name" content="{esc(estudio["nombre"])}">',
            f'<meta property="og:locale" content="{lang["og_locale"]}">',
            *(f'<meta property="og:locale:alternate" content="{l["og_locale"]}">'
              for l in langs if l['code'] != lang['code']),
            f'<meta property="og:title" content="{esc(title)}">',
            f'<meta property="og:description" content="{esc(description)}">',
            f'<meta property="og:url" content="{esc(canonical)}">',
            f'<meta property="og:image" content="{esc(image)}">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            f'<meta property="og:image:alt" content="{esc(flat["meta.og_image_alt"])}">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{esc(title)}">',
            f'<meta name="twitter:description" content="{esc(description)}">',
            f'<meta name="twitter:image" content="{esc(image)}">',
            f'<meta name="twitter:image:alt" content="{esc(flat["meta.og_image_alt"])}">']
    graph = [{
        '@type': 'WebPage', '@id': canonical + '#webpage', 'url': canonical,
        'name': title, 'description': description, 'inLanguage': lang['html_lang'],
        'isPartOf': {'@id': base_url + '#website'},
        'about': {'@id': base_url + '#estudio'},
    }, {
        '@type': 'WebSite', '@id': base_url + '#website', 'url': base_url,
        'name': estudio['nombre'], 'inLanguage': [l['html_lang'] for l in langs],
        'publisher': {'@id': base_url + '#estudio'},
    }]
    # El negocio va sólo en la portada. Sin aggregateRating ni review a propósito:
    # Google no las acepta sobre el propio negocio.
    if page == 'home':
        graph.append(business(flat, base_url, image, langs, estudio))
    payload = json.dumps({'@context':'https://schema.org', '@graph':graph}, ensure_ascii=False)
    # Un JSON con </script> jamás puede cerrar el elemento que lo contiene.
    tags.append('<script type="application/ld+json">' + payload.replace('<', '\\u003c') + '</script>')
    return '\n'.join(tags)


def write_files(dist, base_url, langs, path_for):
    ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
    ET.register_namespace('xhtml', 'http://www.w3.org/1999/xhtml')
    ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    xhtml = '{http://www.w3.org/1999/xhtml}'
    root = ET.Element(ns + 'urlset')
    built = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    for page in ('home','privacy'):
        for lang in langs:
            entry = ET.SubElement(root, ns + 'url')
            ET.SubElement(entry, ns + 'loc').text = base_url + path_for(lang, page)
            ET.SubElement(entry, ns + 'lastmod').text = built
            for alternate in langs:
                ET.SubElement(entry, xhtml + 'link', rel='alternate',
                              hreflang=alternate['hreflang'], href=base_url+path_for(alternate,page))
            default = next(l for l in langs if l['code']=='es')
            ET.SubElement(entry, xhtml+'link',rel='alternate',hreflang='x-default',href=base_url+path_for(default,page))
    ET.ElementTree(root).write(dist/'sitemap.xml',encoding='utf-8',xml_declaration=True)
    rules = 'Allow: /\nDisallow: /panel\nDisallow: /api/' if can_index(base_url) else 'Disallow: /'
    (dist/'robots.txt').write_text(f'User-agent: *\n{rules}\nSitemap: {base_url}sitemap.xml\n',encoding='utf-8')
