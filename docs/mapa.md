# P02 — mapa de contacto

Verificado el 09/10/2026 sobre la copia local de P00. El recuadro inicial es un
SVG propio y estático, rotulado como ilustración sin escala ni precisión de
calles. Reutiliza los tokens existentes. No usa imágenes ni logos de Google.

## Ficha confirmada

Fuente primaria: [Portillo Kus & Asociados. Estudio Jurídico en Google Maps](https://www.google.com/maps/place/Portillo+Kus+%26+Asociados.+Estudio+Jur%C3%ADdico/@-34.6071757,-58.3752813,17z/data=!3m1!4b1!4m6!3m5!1s0x95bccba3e8bdb1fb:0x680786357004fb40!8m2!3d-34.6071757!4d-58.3752813!16s%2Fg%2F11v014vn49).
La ficha mostró el nombre del estudio y Edificio Miguel Bencich, Av. Pte. R.
Sáenz Peña 616, piso 4, oficina 403, C1035 CABA. La oficina coincide con la
[web actual del estudio](https://www.portillokusestudio.com/). No se modificaron
domicilio, teléfonos, horarios, reseñas ni valoración en este paso.

`google_maps_url` es la única clave de cada JSON para los enlaces a la ficha;
se usa en portada, opiniones y contacto. Un valor pendiente, vacío, malformado
o ajeno a Google Maps genera un enlace con `role="link" aria-disabled="true"`,
sin `href` ni `tabindex`: no navega con mouse, teclado ni con JavaScript ausente.

El iframe usa el embed obtenido de la propia ficha mediante **Compartir →
Insertar un mapa**, con identificador `0x680786357004fb40`. Se verificó su carga
real en el navegador y muestra el nombre y pin del estudio. Buscar solamente
la dirección abre resultados ambiguos; por eso se usa el embed de la ficha.
**Cómo llegar** mantiene el destino literal del plan:
`Av. Pres. Roque Sáenz Peña 616, C1035 CABA`, con `api=1`.

## Comportamiento y comprobaciones

El HTML inicial no contiene iframe ni recurso de `google.com`. El botón nativo
**Ver mapa** crea un único iframe al activarse, con título localizado y foco
en el iframe. Se mantiene el recuadro de altura fija: 240 px a 390 px y 320 px
a 1440 px. El rótulo informa que abrir el mapa carga contenido de Google.

- Ocho pruebas unitarias aprobadas (cinco del generador y tres de mapa).
- ES, EN y PT verificados con Chromium a 390 y 1440 px: seis combinaciones.
- Cero solicitudes a `google.com` antes de activar el mapa; una solicitud
  inicial de embed después de Enter, con el identificador confirmado.
- Sin overflow ni errores JavaScript. Títulos en los tres idiomas y foco de
  teclado verificados. Dimensiones constantes y posición en el documento
  estable, con tolerancia de 1 px, después de la animación existente de entrada.
- `mapa_click` y `como_llegar_click` incluyen los botones
  `contacto-mapa` / `contacto-como-llegar` y `data-lang` ES/EN/PT para P04.

La prueba automática intercepta la respuesta del iframe para medir la creación
de la solicitud y el layout sin depender de Google. La carga de contenido real
se comprobó además manualmente en el navegador integrado. Google Fonts aún
hace solicitudes a `googleapis.com` y `gstatic.com` en la base P00; P05 trata
ese punto. Las capturas y JSON detallado de la validación quedan como artefactos
locales de la sesión, fuera del repo. No hubo push ni despliegue en P02.

Pruebas repetibles: `python -m unittest discover -s tests -v`.
