# Portillo Kus & Asociados — sitio del estudio

Estudio jurídico en CABA. Interlocutor: **Dr. Denis Portillo, Presidente
Ejecutivo**. Trámites de ciudadanía, con atención en varios idiomas.

## Estado (18/09/2026)

- **Comercial:** propuesta enviada. **Falta la seña** (50% para arrancar).
- **Producto:** boceto v2 en tres idiomas (ES / EN / PT), paleta clara.
- **Publicado en:** todavía no.

## Cómo está armado

No es un HTML suelto: hay un generador chico en `src/`.

```
src/
  template.html      el molde, con marcadores
  content.es.json    el texto de cada idioma
  content.en.json
  content.pt.json
  build.py           combina molde + contenido y escribe las tres salidas
```

```bash
python src/build.py
```

Genera `index.html` (español), `en/index.html` y `pt/index.html`. **El texto se
edita en los JSON, nunca en los HTML generados**: el próximo build los pisa.

`portillo-portada.html` y `portillo-portada-v1.html` son el boceto original de
una sola página, anterior al sistema de tres idiomas. Quedan como referencia de
lo que vio el cliente primero.

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
- Lo que se cargue en español hay que cargarlo también en los otros dos idiomas.

## Pendiente del cliente

- [ ] Del proveedor actual: titular del dominio, desbloqueo y código de
      transferencia.
- [ ] Nombres y matrículas del CPACF de los socios.
- [ ] Fotos propias del estudio y de la fachada.
- [ ] Para qué usan la segunda línea telefónica.
- [ ] En qué idiomas atienden y quién revisa cada traducción.
- [ ] Los pasos reales del trámite de ciudadanía.
- [ ] Con qué mails entran al panel.
- [ ] Acceso de administrador a la ficha de Google Business.

## Nota de diseño

El estudio tramita ciudadanías: la página **no puede parecer oficial**. Van
Obelisco, Plaza de Mayo, Diagonal Norte y el Edificio Bencich, celeste y blanco
como acento, y un sol de mayo estilizado propio. **No** van el Escudo Nacional,
la bandera oficial ni nada que se parezca a `argentina.gob.ar`.
