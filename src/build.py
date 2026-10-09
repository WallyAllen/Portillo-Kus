"""Genera dist/ desde template.html + content.<lang>.json.

Uso: python src/build.py [--produccion] [--servir]
SITE_URL define la URL pública (por defecto https://portillokusestudio.com/).
Para sumar un idioma nuevo: crear content.<lang>.json con las mismas claves que
content.es.json, agregar una entrada a LANGS y una imagen og-<lang>.jpg.
"""
import json
import re
import argparse
import html as html_tools
import os
import pathlib
import posixpath
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from urllib.parse import quote, urlsplit
from analytics import analytics_fields, validate_analytics

BASE = pathlib.Path(__file__).resolve().parent
SITE_ROOT = BASE.parent
DIST = SITE_ROOT / "dist"
PENDING = "[PENDIENTE]"

# Datos del estudio que se repiten en toda la página: se cambian solo acá.
# En los textos de los JSON, "{reviews}" se reemplaza por la cantidad de reseñas.
WA_NUMBER = "5491127111987"
TEL = "+5491127111987"
REVIEWS = 417
RATING = 5.0
CLIENTS = 1200
# Datos de arriba que el estudio todavía no confirmó: se muestran marcados y
# bloquean --produccion. Sacar el nombre cuando llegue el dato real.
SIN_CONFIRMAR = {"reviews", "rating", "clients"}

# slug: carpeta de salida ("" = raíz) · html_lang: atributo lang · hreflang: código hreflang
# thousands / decimal: separadores numéricos de cada idioma
LANGS = [
    {"code": "es", "slug": "", "html_lang": "es", "hreflang": "es", "label": "ES", "name": "Español", "thousands": ".", "decimal": ","},
    {"code": "en", "slug": "en", "html_lang": "en", "hreflang": "en", "label": "EN", "name": "English", "thousands": ",", "decimal": "."},
    {"code": "pt", "slug": "pt", "html_lang": "pt-BR", "hreflang": "pt-BR", "label": "PT", "name": "Português", "thousands": ".", "decimal": ","},
    {"code": "ru", "slug": "ru", "html_lang": "ru", "hreflang": "ru", "label": "RU", "name": "Русский", "thousands": " ", "decimal": ","},
    {"code": "zh", "slug": "zh", "html_lang": "zh-Hans", "hreflang": "zh-Hans", "label": "中文", "name": "中文", "thousands": ",", "decimal": "."},
]
DEFAULT_LANG = "es"
PRIVACY_SLUGS = {"es": "privacidad", "en": "en/privacy", "pt": "pt/privacidade",
                 "ru": "ru/privacy", "zh": "zh/privacy"}


def fmt_number(value, lang, decimals=0):
    s = f"{value:,.{decimals}f}"  # formato inglés: 1,200.0
    return s.replace(",", "\x00").replace(".", lang["decimal"]).replace("\x00", lang["thousands"])


def dato(nombre, texto):
    return f"{PENDING} {texto}" if nombre in SIN_CONFIRMAR else texto


def resolve_reviews(value):
    if not isinstance(value, str) or "{reviews}" not in value:
        return value
    value = value.replace("{reviews}", str(REVIEWS))
    return value if value.startswith(PENDING) else dato("reviews", value)


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


def out_path_for(lang, page="home"):
    return DIST / page_slug(lang, page) / "index.html"


def rel_prefix_for(lang, page="home"):
    """Prefijo relativo hacia la raíz del sitio (donde vive portillo-images/)."""
    slug = page_slug(lang, page)
    return "../" * len(slug.split("/")) if slug else ""


def link_to(target_lang, from_lang, page="home"):
    """Href relativo desde la página de from_lang hacia la home de target_lang."""
    if from_lang["code"] == target_lang["code"]:
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


def build(lang, template, base_url, flat, page="home"):
    flat = dict(flat)

    flat["wa_number"] = WA_NUMBER
    flat["tel"] = TEL
    flat["num.clients"] = dato("clients", fmt_number(CLIENTS, lang))
    flat["num.clients_raw"] = str(CLIENTS)
    flat["num.rating"] = dato("rating", fmt_number(RATING, lang, 1))
    flat["num.rating_raw"] = str(RATING)
    flat["html_lang"] = lang["html_lang"]
    flat.update(analytics_fields(lang["code"], os.environ.get("UMAMI_ID")))
    flat["img_prefix"] = rel_prefix_for(lang, page)
    flat["home_link"] = rel_prefix_for(lang, page) + (lang["slug"] + "/" if lang["slug"] else "") or "./"
    flat["privacy_link"] = posixpath.relpath(PRIVACY_SLUGS[lang["code"]], page_slug(lang, page) or ".") + "/"
    flat["og_image_url"] = f"{base_url}portillo-images/og-{lang['code']}.jpg"
    flat["hreflang_tags"] = build_hreflang_tags(lang, base_url, page)
    flat["lang_label"] = lang["label"]

    def lang_links(text_key):
        return "\n".join(
            f'<a href="{link_to(l, lang, page)}" hreflang="{l["hreflang"]}" lang="{l["html_lang"]}"'
            + (' class="is-current" aria-current="page"' if l["code"] == lang["code"] else "")
            + f'>{l[text_key]}</a>'
            for l in LANGS
        )

    flat["lang_links"] = lang_links("label")
    flat["lang_links_named"] = lang_links("name")

    # {{clave}} inserta el texto tal cual; {{url:clave}} lo codifica para usarlo en una URL
    def repl(m):
        as_url, key = m.group(1), m.group(2)
        if key not in flat:
            raise KeyError(f"Falta la clave {{{{{key}}}}} en content.{lang['code']}.json")
        value = str(flat[key])
        if as_url:
            return quote(value, safe="")
        if value.startswith(PENDING):
            # Attributes and <title> accept plain text, never highlighting markup.
            in_tag = template.rfind("<", 0, m.start()) > template.rfind(">", 0, m.start())
            in_title = template.rfind("<title>", 0, m.start()) > template.rfind("</title>", 0, m.start())
            if in_tag or in_title:
                return html_tools.escape(value, quote=True)
            return f'<span class="pending-content" data-pending="{key}">{value}</span>'
        return value

    html = re.sub(r"\{\{(url:)?([\w.\-]+)\}\}", repl, template)

    leftover = re.findall(r"\{\{[\w.:\-]+\}\}|\{reviews\}", html)
    if leftover:
        raise ValueError(f"Marcadores sin reemplazar en {lang['code']}: {', '.join(sorted(set(leftover)))}")
    validate_analytics(html, lang["code"])
    return html


def privacy_template(home_template):
    """Reuse the live home styles, logo and footer without duplicating their source."""
    source = (BASE / "privacy-template.html").read_text(encoding="utf-8")
    style = re.search(r"<style>.*?</style>", home_template, re.S).group(0)
    # Keep the same font/resource declarations, including future local-font changes.
    head = home_template.split("<style>", 1)[0]
    resources = "\n".join(tag for tag in re.findall(r"<link\b[^>]*>", head)
                          if re.search(r'rel="(?:stylesheet|preload|preconnect|dns-prefetch)"', tag))
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
    parser.add_argument("--produccion", action="store_true", help="Falla si quedan valores [PENDIENTE].")
    parser.add_argument("--servir", action="store_true", help="Genera y sirve dist/ en http://localhost:8532/.")
    parser.add_argument("--base-url", help="Override opcional de SITE_URL, por compatibilidad.")
    args = parser.parse_args()
    base_url = (args.base_url or os.environ.get("SITE_URL") or "https://portillokusestudio.com/").strip().rstrip("/") + "/"
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

    pending = [f"{code}: {key}" for code, flat in contents.items()
               for key, value in sorted(flat.items())
               if isinstance(value, str) and value.startswith(PENDING)]
    pending += [f"build.py: {name}" for name in sorted(SIN_CONFIRMAR - {"reviews"})]
    if args.produccion and pending:
        parser.exit(1, "Producción bloqueada por pendientes:\n" + "\n".join(pending) + "\n")

    template = (BASE / "template.html").read_text(encoding="utf-8")
    try:
        privacy = privacy_template(template)
        pages = [(lang, page, build(lang, source, base_url, contents[lang["code"]], page))
                 for page, source in (("home", template), ("privacy", privacy)) for lang in LANGS]
    except (OSError, KeyError, ValueError) as error:
        parser.exit(1, f"No se pudo generar el sitio: {error}\n")
    images = SITE_ROOT / "portillo-images"
    if not images.is_dir():
        parser.exit(1, "Falta portillo-images/.\n")
    # Rehacer únicamente la salida del proyecto evita publicar idiomas o archivos viejos.
    if DIST.is_symlink() or DIST.resolve().parent != SITE_ROOT:
        parser.exit(1, "dist/ debe estar dentro del proyecto y no ser un enlace.\n")
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(images, DIST / "portillo-images")
    print(f"Base URL: {base_url}")
    for lang, page, html in pages:
        out = out_path_for(lang, page)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        print(f"  {out.relative_to(SITE_ROOT)}  ({len(html.encode('utf-8'))/1024:.1f} KB)")
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
