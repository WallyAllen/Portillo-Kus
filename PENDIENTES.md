# Pendientes antes de publicar

Actualizado: 30/10/2026 · P4 de la entrega: el sitio publica sin placeholders.
`python src/build.py --produccion` pasa.

Criterio: si el texto base es correcto sin el dato faltante, se publica tal cual.
Si depende de un dato que sólo el estudio puede dar, el elemento no se genera:
va en un bloque `<!--si:clave-->…<!--/si:clave-->` de `src/template.html` y
vuelve solo cuando la clave tiene un valor sin `[PENDIENTE]`. Un `[PENDIENTE]`
fuera de esos bloques se ve en la vista previa con la etiqueta "pendiente" y
hace fallar `--produccion`. No quitar el marcador para publicar un dato sin evidencia.

## Oculto hasta que el estudio pase el dato

| Qué | Dónde se carga | Qué aparece al cargarlo |
|---|---|---|
| Matrícula CPACF del Dr. Portillo | `ESTUDIO["matricula"]` en `src/build.py` (p. ej. `"T° 100 F° 200"`) | Línea "Matrícula CPACF …" bajo su cargo en "El estudio", en los cinco idiomas |
| Socios y sus matrículas | `estudio.team_note` en los cinco JSON, reemplazando el valor completo | Nota bajo la firma en "El estudio" |
| Reseñas de Google, texto completo y autor tal como figuran | `opiniones.r1_text`/`r1_name` a `r4_text`/`r4_name` en los cinco JSON | Cada tarjeta aparece sola cuando su `rN_text` está cargado; sin ninguna, "Opiniones" muestra sólo el puntaje y el botón a Google |
| Abogados: foto, nombre, cargo, matrícula, idiomas, biografía y LinkedIn | `src/equipo.json` (foto en `portillo-images/abogado-*`), reemplazando `[Abogado 1]` y demás, en los cinco idiomas, con `"publicado": true` | Sección "Nuestros abogados" con tarjeta y perfil |
| Idiomas de atención | `seo.contact_languages` (códigos separados por coma, p. ej. `es,en,pt-BR`) | `ContactPoint.availableLanguage` en el JSON-LD |

Si el `rN_text` se carga y el `rN_name` no, el nombre sale marcado y
`--produccion` falla: es a propósito.

## Publicado con el texto base

- `hero.sub`, `stats.s1_label`, `ciudadania.text`: "+1.200 expedientes desde 2020"
  se mantiene por decisión del 30/10/2026 (dato propio del estudio).
- `ciudadania.step1` a `step4`: pasos genéricos (consulta, documentación,
  presentación y seguimiento, jura). Siguen siendo una reconstrucción a partir del
  brief: conviene que el estudio los revise, pero no afirman nada falso.
- Reseñas y calificación: la ficha de Google mostraba 5,0 con 448 reseñas el
  30/10/2026. La página dice "más de 400" (`REVIEWS = 400` en `src/build.py`, un
  solo lugar); `og-es/en/pt.jpg` también. `og-ru/zh.jpg` siguen con el 417.
- Imágenes og: no llevan el título de la portada, así que el cambio a «Tu
  Ciudadanía Argentina» (31/10/2026) no las tocó. Su bajada dice "Ciudadanía y
  migraciones" y equivalentes. `og-ru/zh.jpg` además tienen otro encuadre y otra
  tipografía: rehacerlas al estilo de las otras tres antes de publicar esos idiomas.

## Cookies (revisado 30/10/2026)

No hace falta aviso de cookies. El sitio no escribe cookies ni `localStorage`,
no tiene formularios ni scripts de terceros al cargar: fuentes e imágenes son
locales. Umami sólo se agrega si el build corre con `UMAMI_ID` (hoy no está en
el repo; en Cloudflare, revisar que la variable siga vacía o sea el UUID real) y
Umami Cloud no usa cookies. Lo único de terceros es el mapa de Google, que se
carga recién al tocar "Ver mapa": desde ahí Google puede poner sus cookies, y
la página de privacidad ya lo explica. Si se suma un embed, un píxel o un
formulario, revisar esto de nuevo.

## Para confirmar con el estudio (publicado 31/10/2026)

- Instagram: el pie y el `sameAs` del JSON-LD llevan dos cuentas
  (abogadoenargentina y soyabogadoenargentina). Confirmar cuál es la oficial o
  si van las dos; se cambia en `ESTUDIO` de `src/build.py`.
- Ficha de Google: el 07/11/2026 su sitio web figura como instagram.com, no
  como portillokusestudio.com. Lo cambia el estudio desde su perfil de Google.

- Logo en vector (SVG o AI) o, si no existe, PNG de al menos 600 px de ancho con
  fondo transparente: el encabezado ya muestra el logo (07/11/2026), pero el único
  archivo mide 150×80 y en un celular de alta densidad se ve algo blando. No se
  vectorizó ni se redibujó para no inventar una marca. Al llegar, reemplazar
  `portillo-images/logo.png` y ajustar el tamaño en `.logo img` de `src/template.html`.

- Foto de la clienta con la Carta (tarjeta "Ciudadanía Argentina"): confirmar que
  autoriza publicar su imagen y los datos de la Carta (nombre, filiación, firma), que se
  publican sin difuminar por decisión de Felipe del 07/11/2026.
- Foto del pasaporte y DNI (tarjeta "Residencia y visas"): la pasó Felipe; el `alt` la
  declara ilustrativa.

El uso de la segunda línea ya no bloquea: el rediseño v2.2 sacó de la página
su tarjeta. Sigue como pregunta para el estudio.

## Antecedentes del boceto v2.2

Este registro proviene del comentario final de `src/template.html` en la v2.2 (25/09). Conserva
los antecedentes; sus referencias al deploy viejo describen el boceto anterior
al P00. Ahora la URL se configura con `SITE_URL`; por defecto se usa el dominio
previsto, sin acreditar su publicación. La revisión de traducciones la hace
Felipe según el plan del 08/10, sin aprobación del estudio.

PENDIENTE / CONFIRMAR con el estudio antes de pasar esto a producción (boceto v2):

[PENDIENTE] Nombres y matrículas del CPACF de los demás socios ("Kus" y el resto
  del equipo). Hoy solo se muestra al Dr. Denis Portillo, Presidente Ejecutivo,
  con la etiqueta "Socios y matrículas: a completar".
[PENDIENTE] Matrícula del Dr. Portillo (CPACF): el nombre "Denis" ya está
  confirmado por las reseñas y por la placa de escritorio (foto real, sección
  "El estudio"); falta el número de matrícula.
[CONFIRMAR] Uso de la segunda línea (+54 9 11 3511-1987, portillokuslegal@gmail.com):
  su tarjeta se sacó de "Contacto" hasta que el estudio confirme para qué se usa
  (mostraba ese número pero sus botones iban a la línea principal). Su lugar lo
  ocupa el mapa.
[CONFIRMAR] En qué idiomas atiende el estudio además de español. La franja de
  idiomas de "Cómo trabajamos" se sacó (con el selector de 5 idiomas era
  redundante); si el estudio confirma idiomas de atención, sumarlo como ítem.
  Ojo: el JSON-LD de la portada ya declara `knowsLanguage` con los idiomas
  publicados (es, en, pt-BR, sale de `IDIOMAS_PUBLICADOS`). Si el estudio no
  atiende en alguno, sacar `knowsLanguage` de `business()` en `src/seo.py`.
[CONFIRMAR] Expedientes de ciudadanía resueltos: se usó "+1.200" (dato propio del
  estudio); un directorio externo menciona "más de 1.000".
[CONFIRMAR] Los 4 pasos del proceso de ciudadanía son una reconstrucción razonable
  a partir del brief, no un texto provisto por el estudio — revisar con ellos.
[PENDIENTE] Textos completos de las reseñas de Google: los fragmentos de la
  sección "Opiniones" están republicados tal como los tomó un directorio externo
  — copiar el texto completo directamente desde Google Maps antes de publicar.
[PENDIENTE] Logo en alta resolución o vector: el archivo disponible (onbizz.com)
  es de baja resolución (150×80).
[PENDIENTE] Fotos propias del estudio y de la fachada del Edificio Bencich desde
  la vereda del estudio (hoy la foto del edificio en la franja "Buenos Aires" es
  una foto aérea de stock/Wikimedia, no una foto propia del cliente).
[INFO] Fotos de Buenos Aires (franja nueva) — todas de Wikimedia Commons, licencia
  Creative Commons con atribución, uso comercial permitido:
    - hero-diagonal.jpg / ba-obelisco.jpg: "Avenida Roque Sáenz Peña (Diagonal
      Norte)..." y "Vista del Obelisco desde la Plaza de Mayo...", Roberto
      Fiadone y Mr. Tickle, CC BY-SA / CC BY.
    - ba-florida.jpg (reemplazo del 10/10/2026): "Calle Florida, Buenos Aires
      (Argentina).jpg", Horacio Cambeiro (Tubby3), CC BY-SA 4.0.
      Fuente: https://commons.wikimedia.org/wiki/File:Calle_Florida,_Buenos_Aires_(Argentina).jpg
      Licencia: https://creativecommons.org/licenses/by-sa/4.0/
      Original 4000×3000; JPEG local 1200×900, redimensionado y comprimido.
      AVIF/WebP responsivos generados con el proceso P05. La atribución y la
      licencia se enlazan también en las tres portadas. Derivados bajo CC BY-SA 4.0.
      Se retiró la foto de Casa Rosada para evitar apariencia oficial.
    - ba-bencich.jpg: "Edificio Miguel Bencich 616.jpg", Avalosinteriorismo,
      CC BY-SA 4.0. Es el edificio real del estudio (Av. Roque Sáenz Peña 616).
  Las fotos ya no llevan la etiqueta visible "Foto real del estudio" / "Foto
  ilustrativa" (decisión de diseño); el texto alternativo sigue indicándolo.
[PENDIENTE] Dominio definitivo para "og:image" — hoy usa el deploy de Vercel
  vigente; actualizar si el estudio pasa a un dominio propio.
[CONFIRMAR] Si la ficha de Google Maps del estudio va a apuntar a esta página.
[PENDIENTE] Traducciones: el inglés, el portugués, el ruso y el chino simplificado
  los armó un modelo de IA con criterio de registro formal y neutro. Alguien que
  hable cada idioma tiene que revisarlas antes de publicar, en particular los
  mensajes de WhatsApp, los términos jurídicos (ciudadanía, residencia, expulsión)
  y los nombres de las áreas de práctica.
[CONFIRMAR] Ruso y chino: en qué idioma responde el estudio cuando llega una
  consulta en esos idiomas (los botones de WhatsApp de /ru y /zh escriben el
  mensaje en ese idioma).
[INFO] Mapa en "Contacto": embed de Google Maps sin API key (output=embed), con
  loading="lazy" para no demorar la carga inicial.
[INFO] Número de WhatsApp, teléfono, cantidad de reseñas, calificación y
  expedientes resueltos se definen una sola vez en src/build.py. En los JSON,
  la palabra reviews entre llaves se reemplaza por la cantidad de reseñas. Las imágenes og-*.jpg
  tienen el 417 escrito en la imagen: regenerarlas si cambia.
[PENDIENTE] Cifra "7 medios de pago" (4.ª de la franja de cifras): es la más floja;
  reemplazarla por un dato real del estudio (p. ej., países de origen de sus
  clientes) cuando lo pasen.
