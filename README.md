# Portillo Kus & Asociados — sitio del estudio

Estudio jurídico en CABA. Interlocutor: **Dr. Denis Portillo, Presidente
Ejecutivo**. Sitio de trámites de ciudadanía y otras áreas; idiomas de atención
pendientes de confirmar.

## Estado (10/10/2026)

- **Comercial:** seña de $300.000 recibida, según el plan del 08/10/2026.
- **Producto:** boceto v2.2 en cinco idiomas (ES / EN / PT / RU / 中文), con
  privacidad, mapa a pedido, SEO y medición opcional; revisión de traducciones
  EN/PT con glosario, fotos AVIF/WebP y tipografías locales. Salida en `dist/`.
- **Publicado en:** sin publicación de esta versión verificada. P07 está preparado;
  el usuario confirmó que todavía no existe la cuenta del estudio en Cloudflare.
- **Publicación bloqueada:** faltan datos confirmados del estudio y reseñas de Google; ver `PENDIENTES.md`.

### Orden de la página (v2.2)

Portada → Cifras → ¿Qué necesitás? → Ciudadanía → Opiniones → Otras áreas →
El estudio → Buenos Aires → Cómo trabajamos → Contacto (con mapa).

Criterio: primero la oferta y la prueba social (las reseñas son el mayor activo),
después los servicios secundarios, quiénes somos y dónde, y al final lo práctico
(pagos y contacto). El menú sigue ese mismo orden.

### Cambios v2.2

- Opiniones sube justo después de Ciudadanía; Buenos Aires baja junto a
  El estudio, y el mapa pasa a Contacto.
- La tarjeta de la segunda línea se sacó hasta confirmar su uso: mostraba un
  número pero sus botones llamaban a otro.
- Menú: "Opiniones" reemplaza a "Migraciones", que llevaba a una tarjeta y no a
  una sección. Los ítems siguen el orden de la página.
- Portada: el botón secundario es "Cómo es el trámite" y lleva a Ciudadanía.
- Áreas: el título ya no promete "12" cuando el carrusel muestra 9.
- Menos rojo: las tarjetas usan botón con borde bordó; en el carrusel solo la
  tarjeta del centro lo tiene relleno (de 21 botones rojos a 7).
- Una sola tipografía de títulos (Cormorant) en todos los dispositivos; se
  quitó Playfair.
- Los enlaces de WhatsApp se generan en el build (antes los armaba JavaScript y
  en el HTML eran `href="#"`). Número, teléfono, reseñas, calificación y
  expedientes están definidos una sola vez en `src/build.py`.
- Cifras con el formato de cada idioma (5,0 / 5.0; 1.200 / 1,200 / 1 200).
- Las anclas del menú ya no quedan debajo del header fijo.
- Rótulos de accesibilidad: el menú principal se anunciaba como "Cambiar idioma".

### Cambios v2.1

- Contraste: el título de la portada era blanco sobre el cielo casi blanco de la
  foto. El velo oscuro ahora cubre toda la altura del texto (y en escritorio se
  concentra a la izquierda, para que la foto siga luciendo clara a la derecha).
- Contraste: en "¿Qué necesitás?" el degradé quedaba pintado detrás de la foto y
  no oscurecía nada; ahora va encima. "CONTACTO" pasa a celeste claro sobre el
  fondo oscuro.
- Ruso y chino simplificado, pedidos por el Dr. Portillo, en `/ru` y `/zh`, con
  sus imágenes para compartir (`og-ru.jpg`, `og-zh.jpg`).
- Selector de idioma desplegable en escritorio (con 5 idiomas la fila no entraba).
- El menú completo aparece desde 1200 px; debajo, menú hamburguesa (antes se
  pisaba entre 900 y 1150 px).
- Mapa de Google con la ubicación del estudio y botón "Cómo llegar", pedido para
  destacar la ubicación.
- "¿Qué necesitás?": la foto queda despejada arriba y el texto va debajo, sobre
  blanco (antes el texto y el velo oscuro tapaban las fotos reales del estudio).
- Logo en PNG con fondo transparente (`logo.png`), sin el recuadro blanco que
  resaltaba sobre el crema. `logo.jpg` queda para los bocetos originales.
- "Cómo trabajamos": tres tarjetas con ícono (atención con horario, pagos en
  Argentina, pagos desde el exterior) y una franja para clientes en el exterior
  con botón de WhatsApp. Se sacó el bloque "English", redundante con el selector
  de idiomas.
- Carrusel de áreas tipo "coverflow": la tarjeta del centro a tamaño completo y
  las vecinas achicadas y desvanecidas a ambos lados, de borde a borde, para que
  se note que hay más áreas. Arranca en el medio ("Ciudadanías italiana y
  española", la más cercana al fuerte del estudio), con puntos para saltar a
  cualquier área. Una tarjeta lateral primero se centra y recién ahí su botón
  abre WhatsApp. Sin loop infinito a propósito (se traba en iPhone).
- Sin las etiquetas "Foto real del estudio" / "Foto ilustrativa" sobre las fotos.

## Cómo está armado

No es un HTML suelto: hay un generador chico en `src/`.

```
src/
  template.html      el molde, con marcadores
  content.es.json    el texto de cada idioma
  content.en.json
  content.pt.json
  content.ru.json
  content.zh.json
  build.py           genera las cinco portadas y las cinco páginas de privacidad
  privacy-template.html  privacidad; reutiliza los estilos y componentes del molde
  seo.py             metadatos, JSON-LD, sitemap.xml y robots.txt
  analytics.py       medición opcional y validación de contactos
  headers.py         genera _headers para Cloudflare Pages
  _headers           reglas base de seguridad y caché
  images.py          variantes responsivas AVIF/WebP de las fotos originales
```

```bash
python -m pip install -r requirements.txt
python src/build.py
```

Genera las portadas `/`, `/en/`, `/pt/`, `/ru/` y `/zh/`, y privacidad en
`/privacidad/`, `/en/privacy/`, `/pt/privacidade/`, `/ru/privacy/` y
`/zh/privacy/`, además de sitemap, robots y encabezados de Pages. Copia los
recursos dentro de `dist/`. La salida se regenera por completo y está ignorada
por Git. **El texto se edita en los JSON, nunca en los HTML generados**: el
próximo build los pisa.

`_referencia/portillo-portada.html` y `_referencia/portillo-portada-v1.html` son
el boceto original de una sola página, anterior al sistema multilingüe. Quedan
como referencia de lo que vio el cliente primero.

## Ver en local

```bash
python src/build.py --servir
# http://localhost:8532/
```

El comando genera y sirve únicamente `dist/` en el puerto 8532. Ctrl+C cierra
el servidor. Las fuentes y referencias HTML quedan fuera de la salida pública.

## Validaciones y URL

Pruebas del generador: `python -m unittest discover -s tests -v`. Trabajan sobre
copias temporales y no modifican el contenido del estudio.

- Los JSON deben tener las mismas claves, incluidas las anidadas. El build falla
  y lista las faltantes o sobrantes por idioma, tomando español como referencia.
- Un valor que empiece con `[PENDIENTE]` aparece resaltado en el build local.
- `python src/build.py --produccion` falla mientras exista cualquier pendiente;
  lista idioma y clave sin regenerar `dist/`.
- `SITE_URL` define canonical, hreflang, sitemap, JSON-LD e imágenes Open Graph.
  Por defecto: `https://portillokusestudio.com/`. En PowerShell:

```powershell
$env:SITE_URL = 'https://nombre-del-proyecto.pages.dev/'
python src/build.py
```

También se mantiene `--base-url URL` como override opcional. Para agregar un
idioma, crear `src/content.<idioma>.json` con todas las claves y añadirlo a
`LANGS` y `PRIVACY_SLUGS` en `src/build.py`; actualizar el selector en esa etapa.

`INDEXAR` vacío mantiene noindex y `Disallow: /`. Sólo `INDEXAR=1` con el dominio
final HTTPS permite indexación; `.pages.dev` sigue bloqueado aun con ese flag.
Ver [SEO](docs/seo.md), [privacidad](docs/privacidad.md), [mapa](docs/mapa.md),
[glosario](docs/glosario.md) y [correcciones de traducción](docs/cambios-traducciones.md).

## Recursos y velocidad (P05)

Pillow está fijado en `requirements.txt`; debe instalarse antes de generar fotos
AVIF/WebP. Los originales se conservan como fallback. `site-fonts/` contiene las
fuentes WOFF2 locales con sus licencias y procedencia; el build las copia a
`dist/fonts/`. No descarga recursos de Google Fonts durante la visita ni el build.
La descarga manual de fuentes y los runners de QA están en `scripts/`; estos
runners no son dependencias de producción. Ver mediciones, capturas y límites
de la revisión en [velocidad y accesibilidad](docs/velocidad.md).

## Medición opcional (P04)

`UMAMI_ID` vacío o ausente mantiene Umami desactivado: sin script, listener ni
requests al servicio. Un UUID real habilita Umami Cloud al regenerar; un formato
inválido bloquea el build. No hay un ID de cuenta configurado en el repositorio.
Todos los botones de WhatsApp, teléfono y mail se validan en cada idioma;
un contacto nuevo sin atributos completos bloquea el build antes de escribir.

Los clicks usan un solo listener delegado y categorías estáticas, sin mensajes
de WhatsApp ni datos personales. Ver [reporte de 30 días](docs/reporte-30-dias.md)
para activación, verificación, límites y plantilla con números ficticios.

## Cuando se publique

- **Hosting:** Cloudflare Pages, plan gratis, en una cuenta a nombre del
  estudio administrada por Felipe. **No Vercel Hobby** — no permite uso
  comercial. Cuenta del estudio todavía pendiente de crear. Salida: `dist`.
  Configuración y pasos de GitHub en [Cloudflare Pages](docs/cloudflare-pages.md).
  Build con dependencias: `python -m pip install -r requirements.txt && python src/build.py`.
  Para una salida final sin pendientes: `python src/build.py --produccion`.
- **DNS:** para servir el dominio sin `www`, los nameservers tienen que estar
  en Cloudflare.
- **Autogestión, sólo si se contrata:** Pages CMS (pagescms.org). El contenido vive en el repo y
  Cloudflare republica en cada cambio. Editable: fotos, reseñas, áreas, equipo,
  contacto. Fijo: diseño, colores, estructura.
- Lo que se cargue en español hay que cargarlo también en los otros cuatro idiomas.

## Pendiente del cliente

- [ ] Del proveedor actual: titular del dominio, desbloqueo y código de
      transferencia.
- [ ] Nombres y matrículas del CPACF de los socios.
- [ ] Fotos propias del estudio y de la fachada.
- [ ] Para qué usan la segunda línea telefónica (hoy oculta en la página).
- [ ] Un dato fuerte para reemplazar "7 medios de pago" en las cifras (por
      ejemplo, de cuántos países son sus clientes).
- [ ] En qué idiomas atienden. Las traducciones EN y PT tienen revisión propia
      (P06); RU y 中文 las armó una IA y falta revisarlas.
- [ ] En qué idioma responden las consultas que lleguen en ruso o en chino.
- [ ] Los pasos reales del trámite de ciudadanía.
- [ ] Con qué mails entran al panel.
- [ ] Acceso de administrador a la ficha de Google Business.

## Nota de diseño

El estudio tramita ciudadanías: la página **no puede parecer oficial**. Van
Obelisco, calle Florida, Diagonal Norte y el Edificio Bencich, celeste y blanco
como acento, y un sol de mayo estilizado propio. **No** van el Escudo Nacional,
la bandera oficial ni nada que se parezca a `argentina.gob.ar`.
