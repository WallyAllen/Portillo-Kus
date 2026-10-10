# P10 parcial — preverificación local de la etapa 1

Fecha: 10/10/2026. Sitio servido desde dist/, sin publicación ni cambios remotos.
P09 se omitió porque el bloque de reseñas del adjunto estaba vacío. Las reseñas pendientes no se ampliaron, tradujeron ni reemplazaron por textos sin fuente.

## Pendientes, ordenados por gravedad

### Bloquean la salida final

1. **Material del estudio y reseñas:** 26 claves por idioma, 78 valores. El build --produccion sigue fallando deliberadamente; no se eliminó ningún marcador.
2. **Cuenta del estudio / P07:** falta el OK de Denis para crear Gmail y la cuenta del estudio en Cloudflare. Sin URL Pages no se puede validar producción.
3. **Dominio / P11 operativo:** inventario de solo lectura terminado; titular, desbloqueos y continuidad del correo requieren proveedor y estudio. Vence el 13/12/2026; decidir el plan hasta el 13/11/2026. Ver [dominio.md](dominio.md).

### Rendimiento — objetivo todavía no cumplido

La pasada móvil local dio LCP superior a 2,5 s en los tres idiomas. No se cambia el diseño en P10 para perseguir el puntaje. La variación ya observada en [velocidad.md](velocidad.md) exige medir el futuro despliegue y aislar el aporte de entrega, caché y cadena de fuentes antes de elegir otro ajuste.

| Idioma | Performance | Accessibility | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|
| ES | 96 | 100 | 2,640 s | 0 | 0 ms |
| EN | 97 | 100 | 2,627 s | 0,02537 | 0 ms |
| PT | 97 | 100 | 2,627 s | 0 | 0 ms |

Lighthouse 13.5.0, Chromium 1234, perfil móvil predeterminado (red y CPU simuladas), una ejecución por idioma en http://127.0.0.1:8554/. No son medianas ni mediciones desde el exterior. La pasada se hizo antes de la corrección final de transiciones con movimiento reducido. Ese ajuste no cambia las fotos, las fuentes ni los estilos con movimiento normal que mide el perfil Lighthouse; no se atribuye a esta corrección una mejora de rendimiento.

El servidor local no aplica _headers; el aviso de caché de Lighthouse no prueba un error en la configuración preparada de Cloudflare. Los avisos de CSS/JS sin minificar, imágenes y cadena de dependencias quedan como diagnósticos de rendimiento, sin introducir un pipeline nuevo en esta fase.

### Verificaciones pendientes de producción / externas

- TLS, caché y encabezados reales de Pages; duración de publicación y rendimiento exterior.
- Disponibilidad de WhatsApp, llamada y entrega de correo: se revisaron URLs, números y mensajes, sin iniciar llamadas ni mandar consultas.
- Iframe real de Google Maps: el recorrido local intercepta el iframe con una respuesta controlada para probar activación, tamaño y foco. No acredita disponibilidad del servicio remoto.
- Umami y reporte de 30 días: sin cuenta ni UMAMI_ID, no se validó el dashboard.
- Vista previa real al compartir por WhatsApp y Search Console.
- Revisión con tecnologías de asistencia reales: los checks automáticos no certifican conformidad WCAG integral.

## Errores claros corregidos

- Menú móvil: fondo inerte, foco inicial en Cerrar, ciclo de Tab/Shift+Tab dentro del diálogo y retorno al botón de apertura con Escape.
- Selector de idioma: conserva la sección visible (incluido #contacto) con movimiento normal o reducido; respeta Ctrl/Cmd/Shift/Alt y el abrir otra pestaña.
- Idioma activo anunciado por aria-current; las navegaciones de secciones dejan de anunciarse como selector de idioma. Etiquetas agregadas en ES/EN/PT.
- Foto de Casa Rosada sustituida por calle Florida, sin edificio gubernamental; alt, leyenda y atribución visible en los tres idiomas. Optimización AVIF/WebP P05. Fuente y licencia en PENDIENTES.md.

## Resultados verificados

- Build normal: seis páginas generadas, sin advertencias ni marcadores del template sin resolver.
- Suite del generador: 28 pruebas aprobadas.
- Recorrido: seis rutas × 390/768/1440 = **18 vistas**, HTTP 200, sin overflow, errores JavaScript/consola, recursos HTTP fallidos ni enlaces internos rotos.
- Privacidad: nueve vistas sin violaciones de axe ni fallos informativos de contraste.
- Aviso de estudio privado: presente en las seis páginas ES/EN/PT.
- Interacciones y créditos: **32 checks aprobados**, incluidos foco inicial, Tab, Shift+Tab, Escape, idiomas y licencia.
- Antes de activar el mapa, cero requests a Google; sin UMAMI_ID, cero requests a Umami.
- El selector de privacidad lleva a la página de privacidad correspondiente.

## Contactos

[inventario_contactos.py](../scripts/inventario_contactos.py) extrae wa.me, tel:, mailto: y materializa los contactos data-wa del HTML generado con la misma codificación de encodeURIComponent. No ejecuta código del sitio ni envía mensajes. El navegador verifica además las URLs resultantes.

**81 contactos:** por idioma 20 WhatsApp, 3 teléfonos y 4 emails, sumando portada y privacidad. WhatsApp: 5491127111987; teléfono: +5491127111987; email: portillokusyasociados@gmail.com. Los 60 mensajes WA están completos; cero atributos de medición faltantes/inconsistentes y cero mensajes vacíos. La segunda tarjeta sigue derivando a la línea principal hasta confirmar su uso.

Cada botón, número, mensaje y URL queda en [contactos-etapa-1.md](contactos-etapa-1.md).

    python -X utf8 scripts/inventario_contactos.py --format markdown --output docs/contactos-etapa-1.md
    python -X utf8 scripts/inventario_contactos.py --format json --output contactos.json
    python src/build.py --produccion

## Claves que bloquean --produccion

Son las mismas en ES, EN y PT:

- ciudadania.step1
- ciudadania.step2
- ciudadania.step3
- ciudadania.step4
- ciudadania.text
- contacto.card2_pending
- estudio.tag_matricula
- estudio.team_note
- hero.rating
- hero.reviews_text
- hero.sub
- opiniones.cta
- opiniones.r1_name
- opiniones.r1_text
- opiniones.r2_name
- opiniones.r2_text
- opiniones.r3_name
- opiniones.r3_text
- opiniones.r4_name
- opiniones.r4_text
- seo.contact_languages
- stats.s1_label
- stats.s1_value
- stats.s2_label
- stats.s2_value
- trabajamos.g4_text

## Evidencia y repetición

Artefactos de Codex del 10/10/2026:
C:/Users/fjbor/.codex/visualizations/2026/10/10/01a1268b-3625-7b30-b498-b1a9338a190f.

- photo-qa/report.json: primer recorrido de 18 vistas tras reemplazar la foto.
- focused-baseline/focused.json: reproducción de defectos de teclado e idioma.
- focused-complete/focused.json: interacciones definitivas, sin fallos.
- complete-qa/report.json: recorrido general del build final.
- lighthouse-release/: JSON/HTML y resumen de las métricas de la tabla.
- focused-complete/: capturas de la franja Buenos Aires y tarjetas a 390/1440.
- Evidencias DNS/RDAP y borrador de mensaje para Denis, **no enviado**.

Los runners requieren Playwright, axe y Lighthouse como herramientas separadas; no se incorporan dependencias al sitio. El nuevo [audit-interactions.cjs](../scripts/audit-interactions.cjs) acepta --playwright=<directorio de paquetes Node>, --chrome=<ejecutable>, --dist=<carpeta>, --output=<evidencias> y --port=8553. Devuelve exit 1 si hay checks fallidos.

El recorrido general reutiliza el runner local de la sesión P01–P06, actualizado a tres anchos; para auditorías de página completa se mantienen los comandos de scripts/audit-browser.cjs de [velocidad.md](velocidad.md).

