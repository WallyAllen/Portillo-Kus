"""Archivos que el Worker de Cloudflare (Static Assets) lee de dist/: íconos,
manifest y redirecciones del sitio viejo."""
import json
import shutil

# Rutas del sitio anterior (Weebyaa) → destino actual. Con y sin barra final:
# html_handling no redirige rutas que no existen como archivo.
REDIRECTS = {
    "/index.html": "/",
    "/home": "/",
    "/inicio": "/",
    "/contacto": "/#contacto",
    "/nosotros": "/#estudio",
    "/servicios": "/#areas",
}

MANIFEST = {
    "name": "Portillo Kus & Asociados",
    "short_name": "Portillo Kus",
    "start_url": "/",
    "display": "browser",
    "background_color": "#F7F5F1",
    "theme_color": "#F7F5F1",
    "icons": [
        {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
    ],
}


def write_files(dist, icons_dir):
    for icon in icons_dir.iterdir():
        shutil.copy2(icon, dist / icon.name)
    (dist / "site.webmanifest").write_text(
        json.dumps(MANIFEST, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rules = []
    for source, target in REDIRECTS.items():
        rules.append(f"{source} {target} 301")
        if source.endswith(".html"):
            continue
        rules.append(f"{source}/ {target} 301")
    (dist / "_redirects").write_text("\n".join(rules) + "\n", encoding="utf-8")
