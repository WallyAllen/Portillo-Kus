# Datos para buscadores y para compartir — P03

Se generan seis URL: portada y privacidad en ES/EN/PT. Cada página tendrá canonical,
alternativas hreflang (incluido x-default), Open Graph, Twitter y JSON-LD.
Las tres imágenes `og-es/en/pt.jpg` existentes son 1200 × 630 px y pesan
menos de 104 KB; se conservan.

Los títulos y las descripciones usan servicios ya indicados en el boceto,
sin citar puntajes, cantidades de reseñas ni cifras pendientes. El generador
rechaza títulos de más de 60 caracteres y descripciones de más de 155.

`LegalService` conserva nombre, dirección, teléfono y horario de la fuente local.
Las áreas se obtienen de las nueve tarjetas del JSON. `WebSite.inLanguage`
describe las versiones de la web; no acredita los idiomas de atención.
`ContactPoint.availableLanguage` se agrega únicamente cuando
`seo.contact_languages` tenga idiomas confirmados, separados por coma.
Mientras ese dato empieza con `[PENDIENTE]`, se omite.

`aggregateRating` se omite si el puntaje (`stats.s2_value`) o la cantidad
(`hero.reviews_text`) empiezan con `[PENDIENTE]`. P09 debe unificar esos campos
al cargar las reseñas reales, manteniendo el mismo criterio de publicación.

## Indexación

Sin `INDEXAR=1`, `robots.txt` bloquea todo y cada página lleva `noindex, nofollow`.
Aunque se defina `INDEXAR=1`, una URL `.pages.dev` u otro dominio de pruebas
sigue bloqueada. Sólo se habilita en `https://portillokusestudio.com/` con la
variable explícita. Definir esa variable no sustituye la resolución de pendientes
ni la aprobación y la verificación del lanzamiento.

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
indexación en pruebas y estructura del sitemap: `tests/test_seo.py`.
