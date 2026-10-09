# Pendientes antes de publicar

Actualizado: 10/10/2026 · P00, reconciliado con el rediseño v2.2.

Los valores de contenido que empiezan con `[PENDIENTE]` se resaltan en la vista
local. `python src/build.py --produccion` falla y lista idioma y clave. Para
resolverlos, reemplazar el valor completo con el dato confirmado en los cinco
JSON. No quitar el marcador para permitir publicar un dato sin evidencia.

## Campos que bloquean producción

- Matrícula del Dr. Portillo y nombres/matrículas de socios: `estudio.tag_matricula`, `estudio.team_note`.
- Cantidad de ciudadanías y año de inicio: `clients` en `SIN_CONFIRMAR` de `src/build.py`, `hero.sub`, `stats.s1_label`, `ciudadania.text`.
- Pasos reales del trámite: `ciudadania.step1` a `ciudadania.step4`.
- Reseñas completas y autores tal como figuran en Google: `opiniones.r1_text`/`r1_name` a `r4_text`/`r4_name`.
- Puntaje y cantidad de reseñas: `rating` y `reviews` en `SIN_CONFIRMAR` de `src/build.py`. Mientras sigan ahí, todo texto con `{reviews}` se marca pendiente (`meta.description`, `meta.og_description`, `hero.reviews_text`, `stats.s2_label`, `opiniones.cta`). Las imágenes `og-*.jpg` tienen el 417 escrito: regenerarlas si cambia.

El uso de la segunda línea y los idiomas de atención ya no bloquean: el
rediseño v2.2 sacó de la página la tarjeta de la segunda línea y la franja
"English". Siguen como preguntas para el estudio.

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
    - ba-casarosada.jpg: "2019 Buenos Aires - Fachada de la Casa Rosada.jpg",
      CC BY-SA 4.0.
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
