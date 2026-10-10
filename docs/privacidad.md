# P01 — Privacidad

Revisado el 09/10/2026. Copy original en `src/content.es.json`, `src/content.en.json`
y `src/content.pt.json`; el contacto y domicilio se reutilizan del footer.

`src/privacy-template.html` es corto y toma los estilos, recursos de fuentes,
logo y pie de la plantilla principal mediante `privacy_template()` en `src/build.py`.
No duplica el CSS del sitio ni depende del menú o carruseles de la home.
El selector permanece dentro de privacidad. Salidas:
`/privacidad/`, `/en/privacy/`, `/pt/privacidade/`.

## Fuentes primarias consultadas

- [Ley 25.326, texto actualizado](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion):
  artículos 14, 16 y 19; derechos, gratuidad y plazos legales de respuesta.
- [AAIP: derechos sobre datos personales](https://www.argentina.gob.ar/aaip/datospersonales/derechos):
  orientación oficial y vías de denuncia. La política enlaza esta página; no usa
  el antiguo `/reclama`, que actualmente muestra un buscador de bases de datos.
- [Umami: identificadores](https://docs.umami.is/docs/distinct-ids) y
  [configuración del tracker](https://docs.umami.is/docs/tracker-configuration):
  Umami no utiliza cookies. Esto no acredita ausencia total de información técnica,
  de identificadores derivados ni de registros en la infraestructura.
- [Umami: datos recopilados](https://docs.umami.is/docs/collect-data): visitas y eventos.
  No se deduce que no pueda recibir datos personales si la implementación los enviara.
- [Google Maps Embed](https://developers.google.com/maps/documentation/embed/get-started):
  el recurso integrado hace una petición HTTP mediante iframe.
- [Política de privacidad de Google](https://policies.google.com/privacy): los servicios
  de Google pueden tratar IP, información del navegador y utilizar cookies.

## Límites y revisión antes de publicar

- Umami y Google Maps se describen de forma condicional. Esta etapa no configura
  cuentas ni prueba servicios activos en producción. P04 integra Umami; P02 integra
  el mapa con carga a pedido. Verificar que el iframe se cree al click; `loading=lazy`
  por sí solo no satisface la promesa de carga a pedido.
- El responsable, domicilio y email provienen del contenido existente del estudio;
  no se añadió una razón social diferente ni se aseguró inscripción ante la AAIP.
- No hay formularios web en este entregable. El sitio usa canales externos de
  WhatsApp, telefonía y email; la política distingue estos contactos de la analítica.
- Las conexiones de alojamiento y, cuando existan, fuentes externas se explican sin
  atribuir un proveedor activo ni un plazo de conservación que no haya sido confirmado.
- Los plazos del párrafo de derechos corresponden a la ley, no a una promesa sobre
  tiempos de atención comercial. La supresión se limita a los casos en que procede.
- Antes del lanzamiento, el estudio debe revisar si sus procesos de contacto,
  conservación, destinatarios y transferencias internacionales requieren información
  adicional. Este texto no verifica sus bases de datos ni prácticas internas.
- La política no garantiza ausencia de registros de IP, anonimato absoluto ni
  cumplimiento general de otras jurisdicciones. No afirma que no se necesite
  consentimiento solo porque Umami no use cookies.

## Validación

`python -m unittest discover -s tests -v` verifica seis salidas, selector, enlaces
relativos, hreflang/x-default de privacidad, reutilización del pie/CSS, contacto
compartido y ausencia de formularios o iframe en estas páginas.
