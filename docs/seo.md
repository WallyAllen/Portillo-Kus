# Datos para buscadores y para compartir — P03

Se generan seis URL: portada y privacidad en ES/EN/PT. Cada página tiene canonical
a su propia URL (con barra final), alternativas hreflang de los idiomas publicados
más x-default a la versión en español, Open Graph (con `og:locale` y un
`og:locale:alternate` por cada otro idioma publicado), Twitter y JSON-LD.

Todas las URL absolutas salen de `SITE_URL` en `src/seo.py`
(`https://portillokusestudio.com`, sin barra final). Ruso y chino quedan para la
etapa 2: sus JSON e imágenes siguen en el repo, pero no están en
`IDIOMAS_PUBLICADOS` (`src/build.py`), así que no se generan ni aparecen en el
selector, hreflang, `og:locale:alternate` ni el sitemap. Publicarlos es sumarlos
a esa lista.

Las tres imágenes `og-es/en/pt.jpg` son 1200 × 630 px y pesan menos de 120 KB.
Desde el 30/10/2026 dicen "más de 400 reseñas" (antes 417), igual que la página.
`og-ru/zh.jpg` siguen con el 417: corregirlas antes de publicar esos idiomas.

Los títulos y las descripciones usan servicios ya indicados en el boceto,
sin citar puntajes, cantidades de reseñas ni cifras pendientes. El generador
rechaza títulos de más de 60 caracteres y descripciones de más de 155.

`LegalService` conserva nombre, dirección, teléfono y horario de la fuente local.
Las áreas se obtienen de las nueve tarjetas del JSON. `WebSite.inLanguage`
describe las versiones de la web; no acredita los idiomas de atención.
`ContactPoint.availableLanguage` se agrega únicamente cuando
`seo.contact_languages` tenga idiomas confirmados, separados por coma.
Mientras ese dato empieza con `[PENDIENTE]`, se omite.

`aggregateRating` no se publica: Google no lo acepta sobre el propio negocio
(ver `metadata()` en `src/seo.py`).

## Indexación

Producción es indexable por defecto: con la URL de `SITE_URL`, `robots.txt`
dice `Allow: /` y las páginas no llevan meta robots. Cualquier otra URL (una
`.pages.dev`, un dominio de pruebas, una subcarpeta) sale con `noindex, nofollow`
y `Disallow: /`, igual que un build con `NOINDEX=1`, que sirve para una vista de
prueba en el dominio final.

`sitemap.xml` incluye las seis páginas y cuatro alternativas por página.

## Fuentes y verificación

- [LegalService](https://schema.org/LegalService).
- [availableLanguage](https://schema.org/availableLanguage): la propiedad
  pertenece a ContactPoint/ServiceChannel, entre otros, y no directamente a LegalService.
- [Sitemaps y versiones localizadas](https://developers.google.com/search/docs/specialty/international/localized-versions).
- [Validador oficial](https://validator.schema.org/): se pegó el bloque JSON-LD
  generado de la portada en español el 09/10/2026. Resultado: WebPage con WebSite
  y LegalService anidados, **0 errores y 0 advertencias**. La sintaxis de los
  seis JSON-LD se comprueba además en la verificación local.

Pruebas de JSON, omisión de datos pendientes, límite de metadatos, bloqueo de
indexación en pruebas y estructura del sitemap: `tests/test_seo.py`. El head de
las seis páginas y la ausencia de ruso y chino: `tests/test_build.py`.
