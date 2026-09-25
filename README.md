# Portillo Kus & Asociados — sitio del estudio

Estudio jurídico en CABA. Interlocutor: **Dr. Denis Portillo, Presidente
Ejecutivo**. Trámites de ciudadanía, con atención en varios idiomas.

## Estado (25/09/2026)

- **Comercial:** propuesta enviada. **Falta la seña** (50% para arrancar).
- **Producto:** boceto v2.2 en cinco idiomas (ES / EN / PT / RU / 中文), paleta
  clara, con mapa de ubicación en "Contacto".
- **Publicado en:** todavía no.

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
  build.py           combina molde + contenido y escribe una salida por idioma
```

```bash
python src/build.py
```

Genera `index.html` (español), `en/`, `pt/`, `ru/` y `zh/index.html`. **El texto
se edita en los JSON, nunca en los HTML generados**: el próximo build los pisa.

`portillo-portada.html` y `portillo-portada-v1.html` son el boceto original de
una sola página, anterior al sistema multilingüe. Quedan como referencia de lo
que vio el cliente primero.

## Ver en local

```bash
python -m http.server 8532
# http://localhost:8532/
```

## Cuando se publique

- **Hosting:** Cloudflare Pages, plan gratis, en una cuenta a nombre del
  estudio administrada por Felipe. **No Vercel Hobby** — no permite uso
  comercial.
- **DNS:** para servir el dominio sin `www`, los nameservers tienen que estar
  en Cloudflare.
- **Autogestión:** Pages CMS (pagescms.org). El contenido vive en el repo y
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
- [ ] En qué idiomas atienden y quién revisa cada traducción (EN, PT, RU y 中文
      las armó una IA: hay que revisarlas antes de publicar).
- [ ] En qué idioma responden las consultas que lleguen en ruso o en chino.
- [ ] Los pasos reales del trámite de ciudadanía.
- [ ] Con qué mails entran al panel.
- [ ] Acceso de administrador a la ficha de Google Business.

## Nota de diseño

El estudio tramita ciudadanías: la página **no puede parecer oficial**. Van
Obelisco, Plaza de Mayo, Diagonal Norte y el Edificio Bencich, celeste y blanco
como acento, y un sol de mayo estilizado propio. **No** van el Escudo Nacional,
la bandera oficial ni nada que se parezca a `argentina.gob.ar`.
