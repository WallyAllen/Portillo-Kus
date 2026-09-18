"""Arma index.html, en/index.html y pt/index.html desde template.html + content.<lang>.json.

Uso: python build.py [--base-url https://dominio/ruta/]
Para sumar un idioma nuevo (ru, zh): crear content.<lang>.json con las mismas
claves que content.es.json y agregar una entrada a LANGS.
"""
import json
import re
import sys
import pathlib

BASE = pathlib.Path(__file__).parent
SITE_ROOT = BASE.parent

# slug: carpeta de salida ("" = raíz) · html_lang: atributo lang · hreflang: código hreflang
LANGS = [
    {"code": "es", "slug": "", "html_lang": "es", "hreflang": "es", "label": "ES"},
    {"code": "en", "slug": "en", "html_lang": "en", "hreflang": "en", "label": "EN"},
    {"code": "pt", "slug": "pt", "html_lang": "pt-BR", "hreflang": "pt-BR", "label": "PT"},
    # Preparado para sumar más adelante:
    # {"code": "ru", "slug": "ru", "html_lang": "ru", "hreflang": "ru", "label": "RU"},
    # {"code": "zh", "slug": "zh", "html_lang": "zh", "hreflang": "zh", "label": "ZH"},
]
DEFAULT_LANG = "es"


def flatten(d, prefix=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(flatten(v, f"{prefix}{k}."))
    elif isinstance(d, list):
        for i, v in enumerate(d, 1):
            out.update(flatten(v, f"{prefix}{i}."))
    else:
        out[prefix.rstrip(".")] = d
    return out


def out_path_for(lang):
    if lang["slug"]:
        return SITE_ROOT / lang["slug"] / "index.html"
    return SITE_ROOT / "index.html"


def rel_prefix_for(lang):
    """Prefijo relativo hacia la raíz del sitio (donde vive portillo-images/)."""
    return "../" if lang["slug"] else ""


def link_to(target_lang, from_lang):
    """Href relativo desde la página de from_lang hacia la home de target_lang."""
    if from_lang["slug"] == target_lang["slug"]:
        return "#top"
    prefix = rel_prefix_for(from_lang)
    if target_lang["slug"]:
        return f"{prefix}{target_lang['slug']}/"
    return prefix or "./"


def build_hreflang_tags(lang, base_url):
    lines = []
    for l in LANGS:
        href = f"{base_url}{l['slug']}/" if l["slug"] else f"{base_url}"
        lines.append(f'<link rel="alternate" hreflang="{l["hreflang"]}" href="{href}">')
    default = next(l for l in LANGS if l["code"] == DEFAULT_LANG)
    href_default = f"{base_url}{default['slug']}/" if default["slug"] else f"{base_url}"
    lines.append(f'<link rel="alternate" hreflang="x-default" href="{href_default}">')
    return "\n".join(lines)


def build(lang, template, base_url):
    data = json.loads((BASE / f"content.{lang['code']}.json").read_text(encoding="utf-8"))
    flat = flatten(data)

    flat["html_lang"] = lang["html_lang"]
    flat["img_prefix"] = rel_prefix_for(lang)
    flat["og_image_url"] = f"{base_url}portillo-images/og-{lang['code']}.jpg"
    flat["hreflang_tags"] = build_hreflang_tags(lang, base_url)
    for l in LANGS:
        flat[f"lang_link_{l['code']}"] = link_to(l, lang)
        flat[f"lang_class_{l['code']}"] = "is-current" if l["code"] == lang["code"] else ""

    def repl(m):
        key = m.group(1)
        if key not in flat:
            raise KeyError(f"Falta la clave {{{{{key}}}}} en content.{lang['code']}.json")
        return str(flat[key])

    html = re.sub(r"\{\{([\w.\-]+)\}\}", repl, template)

    out = out_path_for(lang)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"  {out.relative_to(SITE_ROOT)}  ({len(html.encode('utf-8'))/1024:.1f} KB)")

    leftover = re.findall(r"\{\{[\w.\-]+\}\}", html)
    if leftover:
        print(f"  ADVERTENCIA: quedaron marcadores sin reemplazar en {lang['code']}:", set(leftover))


def main():
    base_url = "https://landing-page-mockup-gx22s9gro-landing-page-7035.vercel.app/nichos/abogados/landings/portillo-kus/"
    for arg in sys.argv[1:]:
        if arg.startswith("--base-url="):
            base_url = arg.split("=", 1)[1]
    if not base_url.endswith("/"):
        base_url += "/"

    template = (BASE / "template.html").read_text(encoding="utf-8")
    print(f"Base URL: {base_url}")
    for lang in LANGS:
        build(lang, template, base_url)


if __name__ == "__main__":
    main()
