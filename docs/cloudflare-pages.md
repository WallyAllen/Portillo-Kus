# Cloudflare Pages — preparación de P07

Estado al 09/10/2026: **falta crear la cuenta a nombre del estudio**, según
confirmación del usuario. No hay proyecto Pages, URL pública de esta versión ni
tiempo de publicación medido. Este documento describe la configuración preparada.

## Cuenta y conexión

1. El estudio debe conservar la titularidad, recuperación y control de su cuenta.
   Crear la cuenta con el correo autorizado por Denis; ingresar credenciales y
   aceptar los términos directamente en Cloudflare. No guardarlas en el repo.
2. Invitar a Felipe como miembro con permisos para administrar Pages.
3. En **Workers & Pages → Create → Pages → Connect to Git**, elegir GitHub.
4. Si Cloudflare pide autorizar su aplicación de GitHub, hacerlo con el usuario
   que administra `WallyAllen/Portillo-Kus`, restringiendo el acceso a ese repo.
5. Elegir el repositorio y la rama de producción `main`, sin framework.

## Build y variables

- Salida: `dist`.
- Generador: `python src/build.py`.
- Comando completo recomendado para Pages:
  `python -m pip install -r requirements.txt && python src/build.py`.
  La instalación explícita de Pillow evita depender de la detección automática
  de dependencias; el generador de P05 necesita esa biblioteca para AVIF/WebP.
- Python: `3.13.3`, fijado en `.python-version`, compatible con Pillow de P05.
  Pages admite este archivo para elegir la versión del entorno de build.
- `SITE_URL`: copiar la URL `.pages.dev` que Cloudflare devuelva, con `/` al final.
  No inventar el nombre del proyecto ni usar una URL de otro deploy.
- `NOINDEX`: no hace falta en `.pages.dev` (cualquier URL distinta de la final ya
  sale con noindex). Usar `NOINDEX=1` sólo para una prueba en el dominio final.
- `UMAMI_ID`: vacío hasta que exista el sitio real en Umami Cloud.
- Verificar en el log de Pages que Pillow se instaló desde `requirements.txt`.

El build normal permite ver los datos `[PENDIENTE]` resaltados para revisión.
La publicación final exige `python src/build.py --produccion`, material confirmado
y los demás pasos del plan. Una URL de prueba no acredita el lanzamiento.

## Encabezados preparados

El generador copia `src/_headers` a `dist/_headers`, más las reglas de caché
corta de las páginas HTML. Incluye nosniff, Referrer-Policy, Permissions-Policy,
caché largo de imágenes/fuentes y X-Robots-Tag para `.pages.dev`.
No agrega una CSP que impida el mapa de Google a pedido.

El servidor `http.server` local **no aplica** `_headers`; comprobar estos
encabezados en respuestas reales de Pages después de publicar.

## Verificación que falta al crear la cuenta

- [ ] Primer deploy en la cuenta del estudio; copiar su URL real.
- [ ] Revisar `/`, `/en/`, `/pt/`, `/privacidad/`, `/en/privacy/`, `/pt/privacidade/`.
- [ ] Comprobar imágenes/fuentes, selector de idioma, contactos y mapa a pedido.
- [ ] En `.pages.dev`: comprobar `robots.txt` con `Disallow: /` y `noindex` en los seis HTML.
- [ ] Comprobar canonical/hreflang con la URL real `.pages.dev` y `sitemap.xml`.
- [ ] Comprobar Cache-Control y encabezados de seguridad en las respuestas.
- [ ] Hacer un push autorizado a `main`: anotar hora UTC del push, SHA remoto,
      hora del deploy exitoso y SHA publicado. Calcular segundos; objetivo <180.
- [ ] Registrar el resultado real aquí y entregar la URL para Denis.

P11 hará el dominio. No tocar DNS ni habilitar indexación como parte de esta preparación.

## Fuentes oficiales

- [Sitio HTML estático](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).
- [Integración con GitHub](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
- [Entorno de build](https://developers.cloudflare.com/pages/configuration/build-image/).
- [Encabezados de Pages](https://developers.cloudflare.com/pages/configuration/headers/).
