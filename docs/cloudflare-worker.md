# Cloudflare Worker (Static Assets) — publicación

El sitio se sirve desde un **Worker de Cloudflare con Static Assets**, conectado
a GitHub `WallyAllen/Portillo-Kus`, rama `main`, mediante Workers Builds. No es
un proyecto de Cloudflare Pages. La cuenta debe seguir a nombre del estudio
(titularidad, recuperación y control suyos; credenciales nunca en el repo).

## Qué se publica

`wrangler.jsonc` (raíz del repo) publica **`dist/`** y el código del panel:

- `assets.directory: ./dist`. El sitio son solo archivos: la capa de assets los
  responde sin ejecutar código.
- `main: worker/index.js` y `assets.run_worker_first`: el Worker sólo corre en
  `/panel`, `/panel/*` y `/api/*`. Ver [panel](panel.md), que además lista lo que hay
  que crear en Cloudflare antes de usarlo.
- `assets.not_found_handling: 404-page`: cualquier ruta inexistente devuelve
  `dist/404.html` con estado 404 real (la 404 lleva `noindex` propio).
- `assets.html_handling: auto-trailing-slash`: `/en` redirige a `/en/`; las
  páginas viven como `carpeta/index.html`.
- `name`: **provisorio (`portillo-kus`)**. Tiene que coincidir con el nombre del
  Worker en Cloudflare; si difiere, Workers Builds falla o crea otro Worker.

`/src`, `README.md`, `docs/` y demás archivos del repo dejan de ser públicos: no
están en `dist/`. `dist/portillo-images/` solo recibe imágenes (el build borra
cualquier otro archivo de esa carpeta).

## Workers Builds (dashboard → Worker → Settings → Build)

- **Build command:** `python -m pip install -r requirements.txt && python src/build.py --produccion`
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** `/`
- Python: `3.13.3` por `.python-version`. `requirements.txt` instala Pillow
  (AVIF/WebP). Verificar en el log que se instaló.
- `--produccion` falla si un valor `[PENDIENTE]` llega a una página: es a propósito.
  Los datos que esperan al estudio van en bloques condicionales y no se generan.
- Variables: `SITE_URL` no hace falta (el valor final está en `src/seo.py`);
  `NOINDEX=1` solo para una prueba en el dominio final; `UMAMI_ID` vacío hasta
  que exista el sitio en Umami Cloud.

## Archivos que genera el build para el Worker

- `_headers`: `src/_headers` (seguridad global, caché inmutable de `/fonts/*` y
  `/portillo-images/*`) más `Cache-Control: max-age=0, must-revalidate` para el
  HTML, sitemap, robots y manifest, y la `Content-Security-Policy` que arma
  `src/headers.py`: el script en línea se autoriza por hash (sin `'unsafe-inline'`
  en `script-src`) y Umami (`cloud.umami.is`, `api-gateway.umami.dev`) sólo
  entra si se construyó con `UMAMI_ID`. Las imágenes llevan `?v=<hash>` en toda
  referencia (HTML, srcset, og:image, JSON-LD), por eso pueden ser immutable.
  Sin HSTS: se activa desde Cloudflare. Hay una sola regla `/*` (en Workers no
  se combinan dos).
- `_redirects`: 301 del sitio viejo (Weebyaa): `/index.html`, `/home`, `/inicio`
  → `/`; `/contacto` → `/#contacto`; `/nosotros` → `/#estudio`;
  `/servicios` → `/#areas` (con y sin barra final). Lista en `src/edge.py`.
- `404.html`, `sitemap.xml` (una `<url>` por página, con `lastmod` de la fecha
  del build y `xhtml:link` de cada idioma más `x-default`), `robots.txt`
  (`Allow: /`, `Disallow` del panel + `Sitemap`; Cloudflare le antepone sus content signals).
- `version.json`: el commit publicado (`WORKERS_CI_COMMIT_SHA`, o `local` fuera de
  Workers Builds). Lo usa el panel para saber cuándo un guardado ya salió.
- Íconos y manifest: `favicon.ico` (32px), `favicon.svg`, `apple-touch-icon.png`
  (180px), `icon-192.png`, `icon-512.png`, `site.webmanifest`. Salen de
  `src/icons/`; se regeneran con `python scripts/generar-iconos.py` (iniciales PK
  en Cormorant Garamond, granate `#9B1C31` sobre `#F7F5F1`; el logo de
  `portillo-images` es 150×80 y no se lee a 32px).

## Prueba local sin login

```bash
python src/build.py
npx wrangler dev
```

Comprobado el 30/10/2026: `/no-existe` y `/en/no-existe` → 404 con la página
propia; `/index.html`, `/home`, `/inicio/` → 301 a `/`; `/contacto`, `/nosotros`,
`/servicios` → 301 con su ancla; `/src/...` y `/README.md` → 404.
`wrangler dev` crea `.wrangler/` (ignorado por Git).

## Verificación después del primer deploy

- [ ] Nombre del Worker confirmado; build y deploy command cargados en el dashboard.
- [ ] Revisar `/`, `/en/`, `/pt/`, `/privacidad/`, `/en/privacy/`, `/pt/privacidade/`.
- [ ] `/ruta-inexistente` devuelve 404 real; `/src/build.py` y `/README.md` también.
- [ ] Redirecciones 301 en las rutas del sitio viejo.
- [ ] `robots.txt` y `sitemap.xml` con la URL final; `X-Robots-Tag`/`noindex` solo donde corresponde.
- [ ] Cache-Control y encabezados de seguridad en respuestas reales (el servidor
      `http.server` local de `--servir` no aplica `_headers`).
- [ ] Push autorizado a `main`: anotar hora UTC del push, SHA y hora del deploy.

## Fuentes oficiales

- [Static Assets](https://developers.cloudflare.com/workers/static-assets/).
- [Routing y 404](https://developers.cloudflare.com/workers/static-assets/routing/).
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
- [Redirects](https://developers.cloudflare.com/workers/static-assets/redirects/) y [Headers](https://developers.cloudflare.com/workers/static-assets/headers/).
