# Reporte de los primeros 30 días

Estado al 09/10/2026: integración preparada, **medición sin activar**. No hay
cuenta, ID, visitas ni conversiones reales verificados por esta implementación.
El período empieza el día en que el sitio publicado tenga medición confirmada.

## Activación y verificación

1. El estudio crea y conserva la titularidad de su cuenta de Umami Cloud y añade
   el dominio real. Invita al administrador con su propio usuario; no comparte
   contraseña. El ID del sitio se obtiene del código de seguimiento de esa cuenta.
2. Configurar `UMAMI_ID` con ese UUID en las variables de build del entorno de
   producción de Cloudflare Pages. Regenerar el sitio. No configurar un ID de
   ejemplo ni copiar el fixture de las pruebas.
3. Revisar en el navegador publicado que se carga `cloud.umami.is/script.js`,
   aparece una visita de prueba y se registra exactamente un evento por click.
   Repetir en ES, EN y PT, incluida la página de privacidad. Revisar una activación
   por teclado, WhatsApp, teléfono, mail, mapa y Cómo llegar.
4. Revisar el payload de los eventos: datos propios exclusivamente `idioma`,
   `boton` y, cuando corresponde, `tema`. No incluir mensaje de WhatsApp, texto
   libre, números, emails, nombres, documentación ni detalles de un caso.
5. Sin `UMAMI_ID` o con valor blanco, el build no agrega script externo ni listener
   de Umami y el sitio no hace requests a ese servicio. Un ID con formato inválido
   bloquea el build. Verificar este modo también en el navegador.

El tracker mantiene las visitas automáticas de Umami. Los clicks se envían con
una sola delegación y `umami.track(nombre, datos)`; no usar atributos
`data-umami-event` en paralelo. Se omiten query y hash de la URL y se respeta Do
Not Track. No hay identificación de usuarios ni seguimiento con cookies. Estas
opciones no reemplazan la revisión del texto de privacidad ni la verificación
del servicio real antes de activar.

## Qué mirar

- **Visitas y páginas vistas:** evolución por semana, fuente de llegada y
  dispositivos. Señalar si hubo difusión, campañas o interrupciones que expliquen
  una variación. Excluir las pruebas internas al interpretar los números.
- **Idioma:** rutas `/`, `/en/`, `/pt/` para las visitas y propiedad `idioma`
  (`es`, `en`, `pt`) para los eventos. El idioma del navegador no equivale al
  idioma de la página elegida.
- **Consultas:** eventos `whatsapp_click`, `telefono_click` y `mail_click`.
  Comparar sus propiedades `boton` para portada, necesidad, área, contacto y
  barra móvil. `tema` es una categoría estática del botón, no el contenido de
  la consulta. Los mails de privacidad tienen `boton=privacidad`: reportarlos
  separados de las consultas comerciales.
- **Ubicación:** eventos `mapa_click` y `como_llegar_click` en contacto. Abrir el
  mapa es una señal de interés; no prueba que la persona haya ido al estudio.
- **Fricción:** muchas visitas y pocos clicks en un idioma o dispositivo ameritan
  revisar el CTA, su visibilidad y el texto. Antes de cambiar diseño o copy,
  confirmar que la medición está funcionando y que el volumen es suficiente.

Un click es una intención: no prueba envío de un mensaje, llamada contestada,
contratación o consulta recibida. Puede haber varios clicks de la misma persona.
`Clicks / visitas` es una relación descriptiva y puede superar 100%; no llamarla
tasa de clientes. El estudio puede contrastar por separado sus consultas reales
agregadas, sin subir identidades o contenido de casos a Umami.

## Plantilla de entrega

**Ejemplo con números ficticios para mostrar el formato. No son datos del estudio.**

Período: día 1 a día 30 desde la activación. Comparación anterior: no aplica en
el primer mes. Acciones de difusión: completar con hechos confirmados.

| Métrica | Total ficticio | Lectura que debe contrastarse |
| --- | ---: | --- |
| Visitas | 300 | Base de comparación del período |
| Páginas vistas | 420 | Incluye navegación entre idiomas y privacidad |
| Clicks WhatsApp | 24 | Intenciones, no mensajes enviados |
| Clicks teléfono | 5 | Intenciones, no llamadas contestadas |
| Clicks mail comercial | 3 | Excluye `boton=privacidad` |
| Clicks mail privacidad | 1 | Solicitud posible de privacidad, no consulta comercial |
| Clicks mapa | 7 | Apertura voluntaria |
| Clicks Cómo llegar | 4 | Apertura de indicaciones |

| Idioma de página | Visitas ficticias | Clicks de contacto ficticios |
| --- | ---: | ---: |
| ES | 220 | 23 |
| EN | 50 | 6 |
| PT | 30 | 3 |

| Botón WhatsApp | Clicks ficticios |
| --- | ---: |
| `portada` | 8 |
| `necesidad-ciudadania` | 6 |
| `area-laboral` | 2 |
| `contacto-oficina-1` | 4 |
| `barra-movil` | 4 |

**Hallazgo:** describir una diferencia sustentada en los números reales.
**Limitación:** indicar pruebas internas, bloqueadores o volumen escaso.
**Próxima acción:** proponer un solo ajuste concreto y cómo compararlo durante
el período siguiente. No atribuir éxito comercial a clicks sin evidencia.

## Contrato de integración

`src/analytics.py` provee `analytics_fields(codigo_idioma, UMAMI_ID)` y
`validate_analytics(html, codigo_idioma)`. El build actualiza los campos antes de
resolver marcadores y valida cada HTML generado antes de escribir `dist/`.
La privacidad y cualquier página futura deben recibir los mismos campos y
pasar la misma validación:

- `{{analytics_script}}`: dentro de `<head>`.
- `{{analytics_listener}}`: una sola vez, al final de `<body>`.
- `{{analytics_lang}}`: en `data-lang`; PT utiliza `pt` en eventos aunque HTML
  utilice `pt-BR`.

Todo `[data-wa]` o enlace a `wa.me`, `tel:` y `mailto:` necesita un evento
coherente con su canal, un `data-button` de `BUTTONS` y el idioma de la página.
Los mapas usan los eventos y botones previstos por P02. Para un CTA nuevo,
añadir un identificador estático descriptivo a la allowlist, nunca un dato de
usuario. Los atributos extra de un elemento no se envían automáticamente.

## Fuentes oficiales consultadas

Consultadas el 09/10/2026:

- [Introducción: medición sin cookies](https://docs.umami.is/docs).
- [Configuración del tracker y exclusión de query/hash](https://docs.umami.is/docs/tracker-configuration).
- [Eventos manuales y atributos automáticos](https://docs.umami.is/docs/track-events).
- [API `umami.track(nombre, datos)`](https://docs.umami.is/docs/tracker-functions).
- [Código de seguimiento y verificación en el navegador](https://docs.umami.is/docs/collect-data).
