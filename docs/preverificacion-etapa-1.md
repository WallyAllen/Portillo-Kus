# P10 parcial — preverificación local de la etapa 1

Fecha: 10/10/2026, rehecha sobre la rama `reconciliacion` (rediseño v2.2 de
GitHub + P00–P06 y las tareas del 10/10). Sitio servido desde `dist/` en
http://localhost:8532/, sin publicación ni cambios remotos. P09 sigue sin hacer:
no hay reseñas reales adjuntas.

## Por qué se rehizo

El main local y GitHub se habían separado el 18/09. El 25/09 se subieron a
GitHub seis commits (rediseño v2.2, ruso, chino, mapa, carrusel) que el main
local nunca bajó, y P00–P06 se hicieron sobre la base vieja. La reconciliación
toma GitHub como base y reaplica encima cada commit local. Los resultados de la
primera pasada (18 vistas, 32 checks, LCP 2,63 s) correspondían al template
viejo y quedan reemplazados por los de abajo.

Decisiones de la reconciliación:

- **Cinco idiomas en la etapa 1.** RU y 中文 los pidió el Dr. Portillo y ya
  estaban en el rediseño. Las claves nuevas de P01–P06 salen del borrador de
  etapa 2. La rama `etapa2-borrador` queda superada.
- **Datos únicos en `build.py`** (WhatsApp, reseñas, puntaje, expedientes),
  como en el rediseño. Los que el estudio no confirmó están en `SIN_CONFIRMAR`
  y bloquean `--produccion` igual que un `[PENDIENTE]` del JSON.
- **Mapa a pedido** en la columna de Contacto del rediseño: el iframe de Google
  se pide recién al tocar "Ver mapa" (el rediseño lo cargaba solo).
- **Tipografías locales** sin Playfair (el rediseño la sacó), con el subset
  cirílico de Cormorant para los títulos en ruso. Karla no tiene cirílico: /ru
  usa fuentes del sistema en el texto, como en el rediseño.
- **Pendientes discretos:** la vista previa muestra el texto base con una
  etiqueta chica "pendiente"; el marcador `[PENDIENTE]` ya no aparece en la
  página.

## Pendientes, por gravedad

### Bloquean la salida final

1. **Material del estudio y reseñas:** 21 claves por idioma (105 valores) más
   `clients` y `rating` en `SIN_CONFIRMAR`. Lista abajo.
2. **Cuenta del estudio / P07:** falta el OK de Denis para el Gmail y la cuenta
   de Cloudflare.
3. **Dominio / P11:** decidir el plan antes del 13/11/2026; vence el 13/12/2026.
   Ver [dominio.md](dominio.md).

### Rendimiento: objetivo todavía no cumplido

| Idioma | Performance | Accessibility | Best practices | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|
| ES | 95 | 100 | 100 | 2,71 s | 0 | 26 ms |
| EN | 95 | 100 | 100 | 2,70 s | 0 | 0 ms |
| PT | 95 | 100 | 100 | 2,71 s | 0 | 17 ms |
| RU | 94 | 100 | 100 | 2,85 s | 0 | 0 ms |
| 中文 | 97 | 100 | 100 | 2,41 s | 0 | 0 ms |

Lighthouse 12.8.2, perfil móvil predeterminado, una ejecución por idioma contra
el servidor local. El LCP es el título del hero: casi todo es demora de
render esperando la tipografía (2,25 s en ES). RU suma el subset cirílico.
SEO da 69 sólo por `noindex`, que es intencional en la vista previa. Las
mediciones locales no reemplazan las del despliegue real.

### Menores

- Las tarjetas laterales del carrusel coverflow quedan achicadas (botones de
  29 px de alto) y los puntos miden 28 px. Superan el mínimo de 24 px de
  WCAG 2.2 AA; la tarjeta central tiene el tamaño completo.
- `docs/velocidad.md` y `docs/privacidad.md` describen la medición y las rutas
  de P05/P01 en tres idiomas; son históricos, no se reescribieron.

### Verificaciones externas pendientes

TLS, caché y `_headers` reales de Pages; el iframe real de Google Maps (en el
recorrido se intercepta); Umami sin UMAMI_ID; la vista previa al compartir por
WhatsApp; revisión con tecnologías de asistencia reales.

## Errores claros corregidos en esta pasada

- **"Ver mapa" no abría el mapa con el mouse.** El botón se centraba con
  `transform`, y `.btn:active` lo reemplazaba al apretar: el botón se corría
  antes de soltar y el clic caía sobre el dibujo. Ahora se centra con márgenes.
- Las correcciones de teclado de la primera pasada (foco atrapado en el menú
  móvil, idioma que conserva la sección, movimiento reducido) se reaplicaron
  sobre el rediseño.

## Resultados verificados

- Build: 10 páginas (5 portadas + 5 de privacidad), sitemap, robots y `_headers`.
- Suite del generador: 28 pruebas aprobadas.
- Recorrido: 10 rutas × 390/768/1440 = **30 vistas**, HTTP 200, sin violaciones
  de axe (WCAG 2.2 AA), sin desborde horizontal, sin errores de consola ni
  recursos fallidos.
- Interacciones: **56 checks aprobados**: idioma activo anunciado, rótulos de
  navegación, menú móvil (foco inicial, Tab, Shift+Tab, Escape) en los cinco
  idiomas, cambio de idioma ES→EN→PT→RU→ZH conservando `#contacto` con y sin
  movimiento reducido, Ctrl+clic, mapa sin pedidos a Google antes del clic y
  con foco después, y el foco del crédito de la foto.
- Aviso de estudio privado al pie en las 10 páginas.
- Antes de activar el mapa, cero pedidos a Google; sin UMAMI_ID, cero a Umami.
- Contactos: 120 en 10 HTML, cero filas con problemas. Ver
  [contactos-etapa-1.md](contactos-etapa-1.md).

## Claves que bloquean --produccion

Las mismas en ES, EN, PT, RU y ZH:

- `ciudadania.step1` a `ciudadania.step4`, `ciudadania.text`
- `estudio.tag_matricula`, `estudio.team_note`
- `hero.reviews_text`, `hero.sub`
- `opiniones.cta`, `opiniones.r1_name` a `opiniones.r4_name`, `opiniones.r1_text` a `opiniones.r4_text`
- `seo.contact_languages`
- `stats.s1_label`, `stats.s2_label`

Y en `src/build.py`, `SIN_CONFIRMAR`: `clients` (cifra de ciudadanías) y
`rating` (puntaje). `reviews` (cantidad de reseñas) también está ahí y es la
que marca los textos con `{reviews}`.

## Cómo repetirlo

    python src/build.py --servir
    node scripts/audit-browser.cjs --tools=<axe-core> --playwright=<playwright> --url=http://localhost:8532/ --langs=es,en,pt,ru,zh --widths=390,768,1440 --chrome=<chrome> --output=<carpeta>
    node scripts/audit-browser.cjs ... --privacy=true
    node scripts/audit-interactions.cjs --playwright=<playwright> --chrome=<chrome> --url=http://localhost:8532/ --output=<carpeta>
    python -X utf8 scripts/inventario_contactos.py --format markdown --output docs/contactos-etapa-1.md
    python src/build.py --produccion
