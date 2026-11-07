"""Genera dist/ desde template.html + content.<lang>.json.

Uso: python src/build.py [--produccion] [--servir]
La URL pública es seo.SITE_URL; la variable de entorno SITE_URL la cambia para
una vista de prueba (que entonces sale con noindex).
Para sumar un idioma nuevo: crear content.<lang>.json con las mismas claves que
content.es.json, agregar una entrada a TODOS_LOS_IDIOMAS y una imagen og-<lang>.jpg,
y nombrarlo en IDIOMAS_PUBLICADOS.
"""
import hashlib
import json
import re
import argparse
import html as html_tools
import os
import pathlib
import posixpath
import shutil
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from urllib.parse import quote, urlsplit
from analytics import analytics_fields, validate_analytics
from seo import SITE_URL, metadata, valid_maps_url, write_files as write_seo_files
from headers import write_files as write_headers
from images import prepare_images, render_images, version_images
from edge import write_files as write_edge_files

BASE = pathlib.Path(__file__).resolve().parent
SITE_ROOT = BASE.parent
DIST = SITE_ROOT / "dist"
PENDING = "[PENDIENTE]"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"}

# Datos del estudio que se repiten en toda la página: se cambian solo acá.
# En los textos de los JSON, "{reviews}" se reemplaza por la cantidad de reseñas.
WA_NUMBER = "5491127111987"
TEL = "+5491127111987"
# Los mismos datos los leen el pie y el JSON-LD (seo.py): cambiarlos acá cambia los dos.
ESTUDIO = {
    "nombre": "Portillo Kus & Asociados",
    # Tal como figura en la ficha de Google: "Cómo llegar" lo usa para llegar a la ficha.
    "nombre_ficha": "Portillo Kus & Asociados. Estudio Jurídico",
    "telefono": TEL,
    "telefono_visible": "+54 9 11 2711-1987",
    "email": "portillokusyasociados@gmail.com",
    "direccion": {"streetAddress": "Av. Pte. Roque Sáenz Peña 616, piso 4, oficina 403",
                  "addressLocality": "Ciudad Autónoma de Buenos Aires", "addressRegion": "CABA",
                  "postalCode": "C1035", "addressCountry": "AR"},
    "horario": {"dias": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                "abre": "10:30", "cierra": "18:00"},
    # Matrícula CPACF del Dr. Portillo, tal como la dé el estudio (p. ej. "T° 100 F° 200").
    # Vacía, "El estudio" no muestra la línea de matrícula.
    "matricula": "",
    # Orden del pie; en el JSON-LD van como sameAs.
    "redes": {"instagram": "https://instagram.com/abogadoenargentina",
              "instagram_2": "https://instagram.com/soyabogadoenargentina",
              "tiktok": "https://tiktok.com/@abogadoenargentina",
              "youtube": "https://youtube.com/@portillokusestudio"},
}
# Piso redondo: los textos dicen "más de {reviews}", así no envejece con cada reseña.
# Ficha de Google al 30/10/2026: 5,0 con 448 reseñas.
REVIEWS = 400
RATING = 5.0
CLIENTS = 1200
# Datos de arriba que el estudio todavía no confirmó: se muestran marcados y
# bloquean --produccion. Sacar el nombre cuando llegue el dato real.
SIN_CONFIRMAR = set()

# slug: carpeta de salida ("" = raíz) · html_lang: atributo lang · hreflang: código hreflang
# og_locale: og:locale · thousands / decimal: separadores numéricos de cada idioma
TODOS_LOS_IDIOMAS = [
    {"code": "es", "slug": "", "html_lang": "es", "hreflang": "es", "og_locale": "es_AR", "label": "ES", "name": "Español", "thousands": ".", "decimal": ","},
    {"code": "en", "slug": "en", "html_lang": "en", "hreflang": "en", "og_locale": "en_US", "label": "EN", "name": "English", "thousands": ",", "decimal": "."},
    {"code": "pt", "slug": "pt", "html_lang": "pt-BR", "hreflang": "pt-BR", "og_locale": "pt_BR", "label": "PT", "name": "Português", "thousands": ".", "decimal": ","},
    {"code": "ru", "slug": "ru", "html_lang": "ru", "hreflang": "ru", "og_locale": "ru_RU", "label": "RU", "name": "Русский", "thousands": " ", "decimal": ","},
    {"code": "zh", "slug": "zh", "html_lang": "zh-Hans", "hreflang": "zh-Hans", "og_locale": "zh_CN", "label": "中文", "name": "中文", "thousands": ",", "decimal": "."},
]
# Idiomas que se generan, se ofrecen en el selector y van a hreflang y sitemap.
# Ruso y chino quedan para la etapa 2: para publicarlos, sumarlos acá.
IDIOMAS_PUBLICADOS = ("es", "en", "pt")
LANGS = [l for l in TODOS_LOS_IDIOMAS if l["code"] in IDIOMAS_PUBLICADOS]
DEFAULT_LANG = "es"
PRIVACY_SLUGS = {"es": "privacidad", "en": "en/privacy", "pt": "pt/privacidade",
                 "ru": "ru/privacy", "zh": "zh/privacy"}


def fmt_number(value, lang, decimals=0):
    s = f"{value:,.{decimals}f}"  # formato inglés: 1,200.0
    return s.replace(",", "\x00").replace(".", lang["decimal"]).replace("\x00", lang["thousands"])


def dato(nombre, texto):
    return f"{PENDING} {texto}" if nombre in SIN_CONFIRMAR else texto


def resolve_reviews(value):
    if not isinstance(value, str):
        return value
    value = value.replace("{year}", str(date.today().year))  # año del build, para el ©
    if "{reviews}" not in value:
        return value
    value = value.replace("{reviews}", str(REVIEWS))
    return value if value.startswith(PENDING) else dato("reviews", value)


def oculto(value):
    """Vacío o pendiente: el bloque que depende de ese dato no se genera."""
    value = str(value).strip()
    return not value or value.startswith(PENDING)


def flatten(d, prefix=""):
    out = {}
    if isinstance(d, (dict, list)) and not d:
        out[prefix.rstrip(".")] = d
    elif isinstance(d, dict):
        for k, v in d.items():
            out.update(flatten(v, f"{prefix}{k}."))
    elif isinstance(d, list):
        for i, v in enumerate(d, 1):
            out.update(flatten(v, f"{prefix}{i}."))
    else:
        out[prefix.rstrip(".")] = d
    return out


def page_slug(lang, page="home"):
    return PRIVACY_SLUGS[lang["code"]] if page == "privacy" else lang["slug"]


def lang_by_code(code):
    return next(l for l in LANGS if l["code"] == code)


def page_path(lang, page="home"):
    slug = page_slug(lang, page)
    return slug + "/" if slug else ""


def out_path_for(lang, page="home"):
    return DIST / page_slug(lang, page) / "index.html"


def rel_prefix_for(lang, page="home"):
    """Prefijo relativo hacia la raíz del sitio (donde vive portillo-images/)."""
    if page == "404":
        return "/"  # el Worker la sirve en cualquier ruta: sólo sirven los enlaces absolutos
    slug = page_slug(lang, page)
    return "../" * len(slug.split("/")) if slug else ""


def link_to(target_lang, from_lang, page="home"):
    """Href relativo desde la página de from_lang hacia la home de target_lang."""
    if from_lang["code"] == target_lang["code"] and page != "404":
        return "#top"
    prefix = rel_prefix_for(from_lang, page)
    slug = page_slug(target_lang, page)
    if slug:
        return f"{prefix}{slug}/"
    return prefix or "./"


def build_hreflang_tags(lang, base_url, page="home"):
    lines = []
    for l in LANGS:
        slug = page_slug(l, page)
        href = f"{base_url}{slug}/" if slug else base_url
        lines.append(f'<link rel="alternate" hreflang="{l["hreflang"]}" href="{href}">')
    default = next(l for l in LANGS if l["code"] == DEFAULT_LANG)
    slug_default = page_slug(default, page)
    href_default = f"{base_url}{slug_default}/" if slug_default else base_url
    lines.append(f'<link rel="alternate" hreflang="x-default" href="{href_default}">')
    return "\n".join(lines)


def google_maps_link_attrs(value):
    """Un pendiente o URL ajena a Maps nunca genera un enlace navegable."""
    if valid_maps_url(value):
        return f'href="{html_tools.escape(str(value).strip(), quote=True)}" target="_blank" rel="noopener"'
    return 'role="link" aria-disabled="true"'


# Fuentes del hero en cada idioma, pedidas antes de que el CSS las descubra: la del
# título (el LCP) primero, después la itálica de la etiqueta de arriba y la del
# texto. En ruso el título es cirílico (más espacios y raya, del subset latino) y el
# cuerpo usa la fuente del sistema: Karla no se usa. En chino la etiqueta no va en
# itálica.
FONT_PRELOADS = {
    "ru": ("cormorant-garamond-normal-cyrillic", "cormorant-garamond-normal-latin",
           "cormorant-garamond-italic-cyrillic", "cormorant-garamond-italic-latin"),
    "zh": ("cormorant-garamond-normal-latin", "karla-normal-latin"),
}
FONT_PRELOADS_DEFAULT = ("cormorant-garamond-normal-latin", "cormorant-garamond-italic-latin",
                         "karla-normal-latin")


def font_preloads(code, prefix, page="home"):
    fonts = SITE_ROOT / "site-fonts"
    if not fonts.is_dir():
        return ""  # igual que la copia a dist/: sin site-fonts no hay fuentes locales
    tags = []
    for stem in FONT_PRELOADS.get(code, FONT_PRELOADS_DEFAULT):
        if page != "home" and "-italic-" in stem:
            continue  # privacidad no tiene la etiqueta en itálica: sería una descarga sin uso
        found = sorted(fonts.glob(f"{stem}-*.woff2"))
        if len(found) != 1:
            raise ValueError(f"Se esperaba un solo site-fonts/{stem}-*.woff2 y hay {len(found)}")
        tags.append(f'<link rel="preload" href="{prefix}fonts/{found[0].name}" '
                    'as="font" type="font/woff2" crossorigin>')
    return "\n".join(tags)


def build(lang, template, base_url, flat, page="home", image_assets=None, pendientes=None):
    """pendientes: si es una lista, se le suma "idioma: clave" por cada pendiente que llega a la página."""
    flat = dict(flat)

    flat["wa_number"] = WA_NUMBER
    flat["tel"] = TEL
    flat["tel_visible"] = ESTUDIO["telefono_visible"]
    flat["email"] = ESTUDIO["email"]
    flat["estudio.matricula"] = ESTUDIO["matricula"]
    direccion = ESTUDIO["direccion"]
    destino = f'{ESTUDIO["nombre_ficha"]}, {direccion["streetAddress"].split(",")[0]}, {direccion["postalCode"]} CABA'
    flat["maps_directions_url"] = "https://www.google.com/maps/dir/?api=1&amp;destination=" + quote(destino, safe="")
    flat.update({f"redes.{red}": url for red, url in ESTUDIO["redes"].items()})
    flat["num.clients"] = dato("clients", fmt_number(CLIENTS, lang))
    flat["num.clients_raw"] = str(CLIENTS)
    flat["num.rating"] = dato("rating", fmt_number(RATING, lang, 1))
    flat["num.rating_raw"] = str(RATING)
    flat["num.reviews"] = dato("reviews", str(REVIEWS))
    flat["google_maps_link_attrs"] = google_maps_link_attrs(flat.get("google_maps_url", ""))
    flat["html_lang"] = lang["html_lang"]
    flat.update(analytics_fields(lang["code"], os.environ.get("UMAMI_ID")))
    flat["img_prefix"] = rel_prefix_for(lang, page)
    flat["home_link"] = rel_prefix_for(lang, page) + (lang["slug"] + "/" if lang["slug"] else "") or "./"
    flat["privacy_link"] = ("/" + PRIVACY_SLUGS[lang["code"]] + "/" if page == "404" else
                            posixpath.relpath(PRIVACY_SLUGS[lang["code"]], page_slug(lang, page) or ".") + "/")
    flat["og_image_url"] = f"{base_url}portillo-images/og-{lang['code']}.jpg"
    flat["hreflang_tags"] = "" if page == "404" else build_hreflang_tags(lang, base_url, page)
    flat["lang_label"] = lang["label"]
    flat["font_preloads"] = font_preloads(lang["code"], flat["img_prefix"], page)
    # La 404 no es una página del sitio: sin canonical ni hreflang, y siempre noindex.
    flat["seo_tags"] = ('<meta name="robots" content="noindex">' if page == "404" else
                        metadata(lang, flat, base_url, page_path(lang, page), page, LANGS, ESTUDIO))

    def lang_links(text_key):
        return "\n".join(
            f'<a href="{link_to(l, lang, page)}" hreflang="{l["hreflang"]}" lang="{l["html_lang"]}"'
            + f' aria-label="{l["name"]}"'
            + (' class="is-current" aria-current="page"' if l["code"] == lang["code"] else "")
            + f'>{l[text_key]}</a>'
            for l in LANGS
        )

    flat["lang_links"] = lang_links("label")
    flat["lang_links_named"] = lang_links("name")

    # <!--si:clave-->…<!--/si:clave--> sólo se genera si la clave tiene un dato
    # cargado: vacío o pendiente, el bloque entero (título, separador) no existe.
    def si(m):
        if m.group(1) not in flat:
            raise KeyError(f"Falta la clave {m.group(1)} del bloque condicional en content.{lang['code']}.json")
        return "" if oculto(flat[m.group(1)]) else m.group(2)

    template = re.sub(r"<!--si:([\w.\-]+)-->(.*?)<!--/si:\1-->", si, template, flags=re.S)

    flagged_cards = set()

    # {{clave}} inserta el texto tal cual; {{url:clave}} lo codifica para usarlo en una URL
    def repl(m):
        as_url, key = m.group(1), m.group(2)
        if key not in flat:
            raise KeyError(f"Falta la clave {{{{{key}}}}} en content.{lang['code']}.json")
        value = str(flat[key])
        pending = value.startswith(PENDING)
        # La vista previa muestra el texto base; el marcador sólo frena --produccion.
        base = value.removeprefix(PENDING).lstrip() if pending else value
        if pending and pendientes is not None:
            pendientes.append(f"{lang['code']}: {key}")
        if as_url:
            return quote(base, safe="")
        if pending:
            before = template[:m.start()]
            # Atributos y <title> aceptan texto plano, nunca marcado.
            in_tag = before.rfind("<") > before.rfind(">")
            in_title = before.rfind("<title>") > before.rfind("</title>")
            if in_tag or in_title:
                return html_tools.escape(base, quote=True)
            # Sin etiqueta dentro de un botón o enlace (lo deformaría) ni repetida
            # en la misma tarjeta o lista: una aclaración por bloque alcanza.
            opened = lambda tag: max(before.rfind(f"<{tag} "), before.rfind(f"<{tag}>")) > before.rfind(f"</{tag}>")
            blocks = [before.rfind(f"<{tag}") for tag in ("article", "ol", "ul") if opened(tag)]
            block = max(blocks, default=-1)
            flag = ""
            if not (opened("a") or opened("button") or (block >= 0 and block in flagged_cards)):
                flagged_cards.add(block)
                flag = '<span class="pending-flag">pendiente</span>'
            return f'<span class="pending-content" data-pending="{key}">{base}</span>{flag}'
        return value

    html = re.sub(r"\{\{(url:)?([\w.\-]+)\}\}", repl, template)

    leftover = re.findall(r"\{\{[\w.:\-]+\}\}|\{reviews\}", html)
    if leftover:
        raise ValueError(f"Marcadores sin reemplazar en {lang['code']}: {', '.join(sorted(set(leftover)))}")
    html = render_images(html, image_assets or {})
    validate_analytics(html, lang["code"])
    return compactar(html)


def compactar(html):
    """Saca sangrías, líneas vacías y comentarios del CSS y el JS en línea.

    El HTML va entero antes del título del hero (el LCP): cada ~30 KB es un viaje
    de ida y vuelta más en móvil. No toca el texto: un salto de línea sigue
    separando palabras igual que la sangría que se quita.
    """
    def css(m):
        s = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
        s = re.sub(r"[ \t\r\n]+", " ", s).replace(": ", ":")
        return "<style>" + re.sub(r" ?([{};,>]) ?", r"\1", s).strip() + "</style>"

    def js(m):  # sólo comentarios de línea entera: en medio de una línea podrían ser una URL
        return "<script>" + re.sub(r"(?m)^[ \t]*//[^\n]*\n", "", m.group(1)) + "</script>"
    html = re.sub(r"<style>(.*?)</style>", css, html, flags=re.S)
    html = re.sub(r"<script>(.*?)</script>", js, html, flags=re.S)
    return re.sub(r"\n[ \t\r\n]+", "\n", html)


def privacy_template(home_template, name="privacy-template.html"):
    """Reuse the live home styles, logo and footer without duplicating their source."""
    source = (BASE / name).read_text(encoding="utf-8")
    style = re.search(r"<style>.*?</style>", home_template, re.S).group(0)
    # Keep the same font/resource declarations, including future local-font changes.
    head = home_template.split("<style>", 1)[0]
    resources = "\n".join(tag for tag in re.findall(r"<link\b[^>]*>|\{\{font_preloads\}\}", head)
                          if tag == "{{font_preloads}}" or re.search(r'rel="(?:stylesheet|preload|preconnect|dns-prefetch)"', tag))
    header = re.search(r'<header class="site-header".*?</header>', home_template, re.S).group(0)
    logo = re.search(r'<a [^>]*class="logo".*?</a>', header, re.S).group(0)
    logo = logo.replace('href="#top"', 'href="{{home_link}}"')
    selector = re.search(r'<details class="lang-menu".*?</details>', header, re.S).group(0)
    privacy_header = ('<header class="site-header is-scrolled" id="siteHeader"><div class="container header-inner">'
                      + logo + '<div class="header-actions">' + selector + '</div></div></header>')
    footer = re.search(r'<footer class="site-footer">.*?</footer>', home_template, re.S).group(0)
    for key, fragment in {"site_styles": style, "site_resources": resources,
                          "site_header": privacy_header, "site_footer": footer}.items():
        source = source.replace("{{" + key + "}}", fragment)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--produccion", action="store_true", help="Falla si algún valor [PENDIENTE] llega a una página.")
    parser.add_argument("--servir", action="store_true", help="Genera y sirve dist/ en http://localhost:8532/.")
    parser.add_argument("--base-url", help="Override opcional de SITE_URL, por compatibilidad.")
    args = parser.parse_args()
    base_url = (args.base_url or os.environ.get("SITE_URL") or SITE_URL).strip().rstrip("/") + "/"
    url = urlsplit(base_url)
    if url.scheme not in ("http", "https") or not url.netloc or url.query or url.fragment:
        parser.exit(1, "SITE_URL debe ser una URL http(s) sin query ni fragmento.\n")

    contents = {}
    try:
        for lang in LANGS:
            contents[lang["code"]] = {k: resolve_reviews(v) for k, v in flatten(json.loads(
                (BASE / f"content.{lang['code']}.json").read_text(encoding="utf-8")
            )).items()}
    except (OSError, ValueError) as error:
        parser.exit(1, f"No se pudo leer el contenido: {error}\n")
    reference = set(contents[DEFAULT_LANG])
    errors = []
    for code, flat in contents.items():
        missing, extra = reference - flat.keys(), flat.keys() - reference
        if missing:
            errors.append(f"{code}: faltan claves: {', '.join(sorted(missing))}")
        if extra:
            errors.append(f"{code}: sobran claves: {', '.join(sorted(extra))}")
    if errors:
        parser.exit(1, "Claves diferentes entre idiomas (referencia: es):\n" + "\n".join(errors) + "\n")

    # Lo que bloquea es un pendiente que llega a la página. Los que sólo viven en
    # bloques <!--si:…--> no se generan, así que no bloquean.
    pending = [f"build.py: {name}" for name in sorted(SIN_CONFIRMAR - {"reviews"})]

    template = (BASE / "template.html").read_text(encoding="utf-8")
    images = SITE_ROOT / "portillo-images"
    try:
        headers_source = (BASE / "_headers").read_text(encoding="utf-8")
        image_assets, image_files = prepare_images(images, template)
        privacy = privacy_template(template)
        pages = [(lang, page, build(lang, source, base_url, contents[lang["code"]], page, image_assets, pending))
                 for page, source in (("home", template), ("privacy", privacy)) for lang in LANGS]
        es = lang_by_code(DEFAULT_LANG)
        not_found = build(es, privacy_template(template, "404-template.html"), base_url,
                          contents[DEFAULT_LANG], "404", image_assets, pending)
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"No se pudo generar el sitio: {error}\n")
    if args.produccion and pending:
        parser.exit(1, "Producción bloqueada por pendientes:\n" + "\n".join(dict.fromkeys(pending)) + "\n")
    images = SITE_ROOT / "portillo-images"
    if not images.is_dir():
        parser.exit(1, "Falta portillo-images/.\n")
    digests = {f.name: hashlib.sha256(f.read_bytes()).hexdigest()[:10] for f in images.iterdir() if f.is_file()}
    digests.update({name: hashlib.sha256(data).hexdigest()[:10] for name, data in image_files.items()})
    pages = [(lang, page, version_images(html, digests)) for lang, page, html in pages]
    not_found = version_images(not_found, digests)
    # Rehacer únicamente la salida del proyecto evita publicar idiomas o archivos viejos.
    if DIST.is_symlink() or DIST.resolve().parent != SITE_ROOT:
        parser.exit(1, "dist/ debe estar dentro del proyecto y no ser un enlace.\n")
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(images, DIST / "portillo-images")
    # Sólo imágenes: ninguna nota o archivo de trabajo de la carpeta sale al sitio.
    for stray in (DIST / "portillo-images").iterdir():
        if stray.suffix.lower() not in IMAGE_SUFFIXES:
            stray.unlink()
    for filename, data in image_files.items():
        (DIST / "portillo-images" / filename).write_bytes(data)
    fonts = SITE_ROOT / "site-fonts"
    if fonts.is_dir():
        shutil.copytree(fonts, DIST / "fonts")
    print(f"Base URL: {base_url}")
    for lang, page, html in pages:
        out = out_path_for(lang, page)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"  {out.relative_to(SITE_ROOT)}  ({len(html.encode('utf-8'))/1024:.1f} KB)")
    (DIST / "404.html").write_text(not_found, encoding="utf-8")
    print(f"  dist/404.html  ({len(not_found.encode('utf-8'))/1024:.1f} KB)")
    write_seo_files(DIST, base_url, LANGS, page_path)
    write_edge_files(DIST, BASE / "icons")
    write_headers(DIST, headers_source, LANGS, page_path, [html for _, _, html in pages] + [not_found])
    if args.servir:
        handler = partial(SimpleHTTPRequestHandler, directory=str(DIST))
        with ThreadingHTTPServer(("127.0.0.1", 8532), handler) as server:
            print("Vista local: http://localhost:8532/ (Ctrl+C para cerrar)", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == "__main__":
    main()
