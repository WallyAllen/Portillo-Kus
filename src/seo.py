"""Metadatos y archivos SEO a partir de contenido confirmado."""
import html
import json
import os
import re
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


def metadata(lang, flat, base_url, path, page='home', langs=()):
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
            '<meta property="og:site_name" content="Portillo Kus &amp; Asociados">',
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
        'name': flat['contacto.card1_title'],
        'inLanguage': [l['html_lang'] for l in langs],
        'publisher': {'@id': base_url + '#estudio'},
    }]
    business = {
        '@type': 'LegalService', '@id': base_url + '#estudio',
        'name': flat['contacto.card1_title'], 'url': base_url,
        'telephone': '+54 9 11 2711-1987', 'email': 'portillokusyasociados@gmail.com',
        'address': {'@type': 'PostalAddress', 'streetAddress': flat['seo.street_address'],
                    'addressLocality': 'Ciudad Autónoma de Buenos Aires',
                    'addressRegion': 'CABA', 'postalCode': 'C1035', 'addressCountry': 'AR'},
        'openingHoursSpecification': {'@type': 'OpeningHoursSpecification',
                    'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday'],
                    'opens': '10:30', 'closes': '18:00'},
        'hasOfferCatalog': {'@type': 'OfferCatalog', 'name': plain(flat['areas.eyebrow']),
                    'itemListElement': [{'@type': 'Offer', 'itemOffered': {
                        '@type': 'Service', 'name': plain(flat[f'areas.a{i}_title'])}}
                        for i in range(1, 10)]},
    }
    # Traducciones del sitio no acreditan los idiomas de atención del estudio.
    contact_languages = flat.get('seo.contact_languages', '')
    if contact_languages and not str(contact_languages).startswith(PENDING):
        codes = [s.strip() for s in str(contact_languages).split(',') if s.strip()]
        if not codes or any(not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', code) for code in codes):
            raise ValueError('seo.contact_languages debe contener códigos de idioma separados por coma.')
        business['contactPoint'] = {'@type': 'ContactPoint',
            'telephone': business['telephone'], 'contactType': 'customer service',
            'availableLanguage': codes}
    rating, count_text = str(flat['num.rating']), str(flat['num.reviews'])
    if not rating.startswith(PENDING) and not count_text.startswith(PENDING):
        try:
            value = float(flat['num.rating_raw'])
            count = int(count_text)
        except ValueError:
            raise ValueError('Puntaje o cantidad de reseñas inválidos para JSON-LD.')
        if not (1 <= value <= 5 and count > 0):
            raise ValueError('Puntaje o cantidad de reseñas fuera de rango.')
        business['aggregateRating'] = {'@type':'AggregateRating', 'ratingValue':value,
                                      'reviewCount':count, 'bestRating':5, 'worstRating':1}
    graph.append(business)
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
    for page in ('home','privacy'):
        for lang in langs:
            entry = ET.SubElement(root, ns + 'url')
            ET.SubElement(entry, ns + 'loc').text = base_url + path_for(lang, page)
            for alternate in langs:
                ET.SubElement(entry, xhtml + 'link', rel='alternate',
                              hreflang=alternate['hreflang'], href=base_url+path_for(alternate,page))
            default = next(l for l in langs if l['code']=='es')
            ET.SubElement(entry, xhtml+'link',rel='alternate',hreflang='x-default',href=base_url+path_for(default,page))
    ET.ElementTree(root).write(dist/'sitemap.xml',encoding='utf-8',xml_declaration=True)
    rules = 'Allow: /' if can_index(base_url) else 'Disallow: /'
    (dist/'robots.txt').write_text(f'User-agent: *\n{rules}\nSitemap: {base_url}sitemap.xml\n',encoding='utf-8')
