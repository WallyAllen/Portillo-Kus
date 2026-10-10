# Velocidad y accesibilidad — P05

La optimización conserva las tres familias tipográficas y las fotografías del sitio. El build produce imágenes adaptables y entrega las fuentes desde el mismo alojamiento. La medición corresponde a localhost con Lighthouse; todavía no demuestra el rendimiento de un despliegue público ni de una conexión móvil real.

## Cambios y dependencias

- Las fotos referenciadas en el template generan AVIF y WebP, más el JPEG original como alternativa. El hero usa anchos 480, 960 y el ancho original; las demás fotos usan 320, 640 y el original. Se descartan anchos duplicados y nunca se amplía la imagen. El logo pequeño conserva su formato y tamaño.
- Cada imagen recibe sus dimensiones reales, `decoding="async"`, `srcset` y `sizes`. El hero conserva `loading="eager"` y `fetchpriority="high"`. Las imágenes restantes mantienen su carga diferida. El AVIF de hero de 960 px pesa 46.910 bytes frente a 206.262 bytes del JPEG original.
- Cuatro archivos WOFF2 cubren Cormorant Garamond normal e itálica (rango 500–700), Karla normal (400–700) y Playfair Display normal (700). Playfair se utiliza en los títulos de la vista móvil; se conserva para mantener la dirección de arte. Karla itálica conserva la síntesis que ya utilizaba el diseño anterior. El encabezado, las etiquetas y los títulos usan pesos cubiertos por las fuentes entregadas.
- Las fuentes tienen `font-display: swap`; se precargan Cormorant normal y Karla, y Playfair en móvil. Los nombres públicos incluyen ocho caracteres de su SHA-256 para permitir caché inmutable de `/fonts/*`. `site-fonts/sources.json` registra los orígenes, pesos, tamaños y hashes; las tres licencias OFL acompañan los archivos.
- La etiqueta sobre fondo oscuro de Contacto utiliza el token celeste existente. Los enlaces del logo, idiomas, navegación, ficha de Google, privacidad y contenido de la página de privacidad reciben objetivos de al menos 44 px. El título del hero aparece inmediatamente en móvil, evitando que su animación retrase el LCP; su aspecto final se conserva.
- La revisión de contraste sobre las fotos detectó zonas de cielo claras debajo del H1 y su etiqueta, y una capa de gradiente de las tarjetas de necesidades que quedaba detrás de la foto. Se oscureció el gradiente del hero con los colores existentes y se corrigió el orden de capas de las necesidades. Se reforzó además el gradiente de necesidades a opacidades 0,72 arriba, 0,78 al 78%, 0,88 al 45% y 0,96 abajo, manteniendo el color existente `rgb(8,14,19)`. Las fotografías se ven más oscuras para sostener la legibilidad del texto superpuesto. El header usa la superficie clara estable `--bg`; el enlace de privacidad también tiene un ancho mínimo de 44 px.

El build requiere Pillow 12.3.0. La instalación es explícita y no descarga fuentes ni paquetes por sí misma:

```sh
python -m pip install -r requirements.txt
python src/build.py
python -m unittest discover -s tests -v
```

La distribución oficial de Pillow 12.3.0 incluye una rueda CPython 3.13 para Linux x86-64 (`manylinux_2_27`/`manylinux_2_28`). Su disponibilidad se verificó en [PyPI](https://pypi.org/project/pillow/12.3.0/); esto comprueba la compatibilidad de la dependencia, y no sustituye ejecutar el build en Cloudflare. La versión de Python y el comando de instalación de Pages se documentan en la preparación de P07.

`scripts/fetch-fonts.py` permite volver a obtener los recursos desde Google Fonts y sus licencias desde el [repositorio oficial google/fonts](https://github.com/google/fonts). Es una tarea de mantenimiento manual. Las cuatro fuentes de producción ya están incluidas y el build funciona sin ese paso. El subconjunto latino cubre los idiomas actuales ES, EN y PT.

## Método y mediciones

Se utilizó Lighthouse 13.5.0 con Chromium 1234, perfiles temporales nuevos y el perfil móvil predeterminado: viewport 412 × 823, escala 1,75, red simulada con RTT de 150 ms y rendimiento de 1.638,4 Kbps, CPU ralentizada por factor 4. La comparación utiliza `http://localhost:8537/` y sus rutas de idioma, el mismo servidor y URL de la base. También se ejecutó un diagnóstico independiente en `http://127.0.0.1:8538/`, servido desde la copia integrada: en ese momento se comprobó que ambas copias tenían HTML idéntico. Ese diagnóstico precede al último refuerzo del gradiente de necesidades; la pasada final comparable sí utiliza el CSS definitivo. Los puntajes son resultados de laboratorio, no percentiles de usuarios reales. El [objetivo de LCP](https://web.dev/articles/lcp) es inferior a 2,5 s según la tarea.

| Estado | Idioma | Performance | Accessibility | LCP (ms) | FCP (ms) | CLS | TBT (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Antes | ES | 75 | 100 | 4.978 | 3.235 | 0 | 0 |
| Antes | EN | 74 | 100 | 5.042 | 3.436 | 0 | 0 |
| Final comparable, localhost:8537 | ES | 97 | 100 | 2.460 | 1.410 | 0,00073 | 0 |
| Final comparable, localhost:8537 | EN | 97 | 100 | 2.460 | 1.410 | 0,02537 | 0 |
| Final comparable, localhost:8537 | PT | 97 | 100 | 2.460 | 1.410 | 0,00073 | 0 |
| Diagnóstico previo, 127.0.0.1:8538 | ES | 96 | 100 | 2.641 | 1.366 | 0 | 0 |
| Diagnóstico previo, 127.0.0.1:8538 | EN | 97 | 100 | 2.627 | 1.352 | 0,02537 | 0 |
| Diagnóstico previo, 127.0.0.1:8538 | PT | 97 | 100 | 2.626 | 1.351 | 0 | 0 |

El antes consta de una ejecución por idioma, realizada el 9 de octubre de 2026. La primera optimización dio LCP entre 2.626 y 2.640 ms. Al precargar Cormorant y evitar la animación inicial del título móvil, ES llegó a 1.410 ms y EN/PT a 2.460 ms; una réplica de EN/PT confirmó esos valores. Tras todos los ajustes de contraste, la última pasada con CSS definitivo dio 2.460 ms en los tres idiomas y conservó Accessibility 100. Cada pasada final de la tabla contiene una ejecución por idioma; no se presentan como una mediana.

La pasada comparable cumple el objetivo por un margen de sólo 40 ms. El diagnóstico previo con otra URL y servidor superó los 2,5 s en los tres idiomas, pese a tener entonces HTML idéntico. Se registran ambos resultados como variación observada de laboratorio, sin atribuirla a una causa que no se verificó. Por lo tanto, el objetivo se cumplió en la comparación local y todavía no puede garantizarse de forma robusta ni en producción. La tabla redondea milisegundos; los reportes conservan los valores originales.

La base anterior incluye P01–P04. Las mediciones posteriores incorporan las correcciones de traducción de P06, por lo que la comparación incluye ese cambio de contenido. La mejora no se atribuye exclusivamente a una única modificación de recursos.

Las capturas anteriores de 390 px se tomaron tras `document.fonts.ready` y confirmaron las fuentes de Google efectivamente cargadas, sin errores de JavaScript ni overflow horizontal en ES y EN. Por ello el aspecto anterior no procede de una sustitución accidental por fallos de red. Se conservan los tres tipos de letra en la versión posterior.

Los reportes JSON y HTML, capturas y extracciones están fuera del código publicable, en la carpeta de artefactos de la tarea. El antes está en `p05-artifacts/before`; la primera optimización en `p05-artifacts/after`; las pasadas de título inmediato en `p05-final-title-lighthouse` y `p05-final-repeat-lighthouse`; la revisión de contraste en `p05-final-contrast-lighthouse` y el diagnóstico en `p05-final-integrated-lighthouse`. La última pasada con CSS definitivo está en **`p05-final-release-lighthouse`**. Se deben trasladar únicamente las evidencias elegidas para la entrega.

## Accesibilidad y alcance de la revisión

Lighthouse devolvió Accessibility 100 antes y después, pero la auditoría con desplazamiento completo y axe-core 4.14.0 encontró contraste insuficiente en la etiqueta de Contacto sobre fondo oscuro. También se identificaron tres objetivos menores a 44 px: el logo del header, el enlace de la ficha de Google en el hero y el enlace de privacidad del footer. Estos casos motivaron los cambios de CSS descritos arriba. El puntaje de Lighthouse por sí solo no demuestra conformidad WCAG.

`scripts/audit-browser.cjs` espera las fuentes, recorre toda la página, ejecuta axe, registra títulos, dimensiones y alt de imágenes, objetivos, overflow, solicitudes y errores, además del foco real al avanzar con Tab. Captura una versión sin texto para contrastar el texto con el fondo renderizado. También extrae por separado las nueve tarjetas de áreas, incluidas las que están fuera del viewport horizontal inicial.

`scripts/contrast.py` evalúa todos los colores de píxel de cada rectángulo de texto, incluyendo fotografías y gradientes. Combina el alfa del texto y la opacidad heredada, y exige 4,5:1 para texto normal o 3:1 para texto grande según [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum). Genera JSON por nodo y CSV con las combinaciones de texto/fondo. El rectángulo incluye zonas entre letras y se inspecciona de forma conservadora: los resultados requieren revisar los elementos decorativos o inactivos, sin descartar fallos de texto informativo. Este cálculo no reemplaza la inspección del foco, la navegación por teclado o el contenido alternativo.

La auditoría de las seis vistas de portada (ES, EN y PT en 390 y 1.440 px) terminó con cero violaciones de axe, cero errores de JavaScript y sin overflow horizontal. Detectó un único objetivo estrecho: Privacy en EN móvil, de 41,797 × 44 px; se corrigió su ancho mínimo. Sin embargo, el cálculo contra los fondos renderizados encontró contraste insuficiente en el hero y las necesidades, aunque axe no lo señalaba. Las 54 extracciones individuales de tarjetas de áreas (nueve por vista) no presentaron fallos. Esos resultados justificaron la corrección de gradientes y capas.

Una segunda revisión detectó dos fallos informativos en las tarjetas de necesidades de PT a 1.440 px: un H3 de 2,556:1 y un párrafo de 4,193:1, asociados al texto portugués más largo sobre la zona superior de la foto. Se reforzó el piso del gradiente con el mismo color y se repitió la comprobación.

La fuente final confirmó cero violaciones de axe, cero objetivos menores a 44 px, cero errores de JavaScript y ausencia de overflow en las seis vistas de portada. Se contrastaron 60 reportes con **1.156 nodos de texto y cero fallos informativos**. Las **54 extracciones de tarjetas de áreas** pasaron. Los dos fallos de necesidades en PT quedaron corregidos.

El cálculo conserva **cuatro excepciones explícitas**: la estrella aislada `★` del bloque de confianza en cuatro vistas, con ratios de 4,359:1 a 4,371:1. Es decoración redundante que acompaña el valor numérico de la reseña; supera 3:1 y no aporta información independiente. El punto separador también es decorativo, pero ya no produjo fallos en la corrida final. El valor numérico y los textos marcados `[PENDIENTE]` sí se contrastaron y pasaron. No se excluye texto informativo por estar pendiente.

La revisión funcional final abarcó **12 vistas: seis rutas en 390 y 1.440 px**, con HTTP 200 y ninguna comprobación fallida. En las seis vistas de portada, el mapa permaneció sin iframe hasta la activación; Enter generó exactamente un iframe y transfirió el foco según lo previsto. Sin `UMAMI_ID` se registraron cero solicitudes de Umami. Las seis vistas de privacidad tuvieron cero violaciones e incompletos de axe y un contraste mínimo calculado de **6,368:1**.

La inspección de los reportes de portada comprobó que no hay saltos de nivel en los encabezados ni imágenes sin atributo alt. El recorrido real de Tab registró indicador de foco en todos los controles alcanzados (38 pasos móviles y 45 de escritorio en la extracción inicial). Las imágenes diferidas del carrusel pueden aparecer incompletas en el snapshot previo a su desplazamiento; sus fondos se capturaron por separado al recorrer las nueve tarjetas. Estos resultados describen los criterios probados y no equivalen por sí solos a una certificación integral WCAG.

## Herramientas reproducibles

Las herramientas de auditoría son dependencias separadas del sitio: [Lighthouse](https://github.com/GoogleChrome/lighthouse), [axe-core](https://github.com/dequelabs/axe-core) y Playwright. El runner recibe sus rutas, por lo que no exige incorporarlas al build de Pages. Lighthouse requiere Node.js 22 o posterior.

```sh
node scripts/audit-lighthouse.mjs --tools=/ruta/qa-tools --output=/ruta/evidencia/lighthouse --url=http://localhost:8537/ --langs=es,en,pt --runs=1 --chrome=/ruta/chrome
node scripts/audit-browser.cjs --tools=/ruta/qa-tools --playwright=/ruta/runtime-node --output=/ruta/evidencia/browser --url=http://localhost:8537/ --langs=es,en,pt --widths=390,1440 --chrome=/ruta/chrome
node scripts/audit-browser.cjs --tools=/ruta/qa-tools --playwright=/ruta/runtime-node --output=/ruta/evidencia/privacy --url=http://localhost:8537/ --langs=es,en,pt --widths=390,1440 --privacy=true --chrome=/ruta/chrome
python -X utf8 scripts/contrast.py /ruta/evidencia/browser/es-390.json
```

Los cuatro tests de `tests/test_images.py` verifican que los formatos generados se pueden decodificar, tienen dimensiones correctas, no amplían el original, conservan el logo pequeño y los fixtures ajenos, detectan corrupción en fotos referenciadas y producen las seis rutas con fuentes locales existentes. La fixture de privacidad también utiliza un JPEG real y las fuentes locales para comprobar que sus enlaces se resuelven.

La suite completa de esta copia terminó con **27 tests aprobados en 6,354 s**. La ejecución se realizó fuera del sandbox de Windows porque los directorios temporales eran bloqueados con `WinError5`; no se cambiaron permisos del sistema. Ambos runners de Node pasaron `node --check`. El agente integrador confirmó la suite final de P01–P06 más la preparación de P07: **28 tests aprobados en 8,396 s**, incluida la comprobación de cabeceras de P07.

La cuenta de Cloudflare del estudio todavía no existe. Quedan pendientes la medición exterior tras desplegar, la comprobación de cabeceras/caché en la entrega real y, cuando exista tráfico suficiente, los datos de experiencia de usuarios. No hay métricas públicas de producción en este informe.
