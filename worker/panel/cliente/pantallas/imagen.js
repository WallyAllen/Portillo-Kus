// Elegir una foto y recortarla en el navegador. Siempre se recodifica a JPEG: nunca sube el
// archivo original, así no llega al repo una imagen cortada que frene el build, ni datos EXIF.
import { crear } from './comun.js';

const LADO_MAXIMO = 1200;
const CALIDAD = 0.85;
const ZOOM_MAXIMO = 3;
const ANCHO_VISTA = 640;
const ANCHO_CHICO = 480; // el build no genera variantes por debajo de esto

// aspecto: [ancho, alto]. alCambiar(): la imagen cambió. Devuelve { nodo, hayFoto(), url(), base64() }.
export function selectorDeFoto({ aspecto, etiqueta = 'Elegir foto', alCambiar = () => {} }) {
  const nodo = crear('div', 'foto-selector');
  const rotulo = crear('label', 'boton boton-suave foto-elegir', etiqueta);
  const archivo = crear('input');
  archivo.type = 'file';
  archivo.accept = 'image/jpeg,image/png,image/webp';
  archivo.className = 'foto-archivo';
  rotulo.append(archivo);

  const lienzo = crear('canvas', 'foto-lienzo');
  lienzo.width = ANCHO_VISTA;
  lienzo.height = Math.round(ANCHO_VISTA * aspecto[1] / aspecto[0]);
  lienzo.hidden = true;
  lienzo.setAttribute('role', 'img');
  lienzo.setAttribute('aria-label', 'Vista del recorte');
  const ayuda = crear('p', 'campo-ayuda', 'Arrastrá la foto o usá las flechas para encuadrarla.');
  ayuda.hidden = true;
  const zoomRotulo = crear('label', 'foto-zoom', 'Acercar');
  const zoom = crear('input');
  zoom.type = 'range';
  zoom.min = '1';
  zoom.max = String(ZOOM_MAXIMO);
  zoom.step = '0.01';
  zoom.value = '1';
  zoomRotulo.append(zoom);
  zoomRotulo.hidden = true;
  const controles = crear('div', 'foto-desplazar');
  controles.setAttribute('role', 'group');
  controles.setAttribute('aria-label', 'Encuadre de la foto');
  controles.hidden = true;
  for (const [flecha, direccion, x, y] of [
    ['←', 'a la izquierda', -1, 0], ['→', 'a la derecha', 1, 0],
    ['↑', 'hacia arriba', 0, -1], ['↓', 'hacia abajo', 0, 1],
  ]) {
    const boton = crear('button', 'boton boton-suave', flecha);
    boton.type = 'button';
    boton.setAttribute('aria-label', `Mover la foto ${direccion}`);
    boton.addEventListener('click', () => {
      const { ancho, alto } = recorte();
      desplazar(x * ancho / 12, y * alto / 12, ancho, alto);
    });
    controles.append(boton);
  }
  const mensaje = crear('p', 'campo-error');
  mensaje.setAttribute('role', 'alert');
  mensaje.hidden = true;
  nodo.append(rotulo, mensaje, lienzo, ayuda, zoomRotulo, controles);

  let imagen = null;
  let centroX = 0.5;
  let centroY = 0.5;

  // La parte de la foto original que entra en el recorte.
  function recorte() {
    const proporcion = lienzo.width / lienzo.height;
    const cubre = Math.min(imagen.width / proporcion, imagen.height);
    const alto = cubre / Number(zoom.value);
    const ancho = alto * proporcion;
    const x = Math.min(Math.max(centroX * imagen.width - ancho / 2, 0), imagen.width - ancho);
    const y = Math.min(Math.max(centroY * imagen.height - alto / 2, 0), imagen.height - alto);
    return { x, y, ancho, alto };
  }

  function dibujar(destino) {
    const r = recorte();
    const contexto = destino.getContext('2d');
    contexto.fillStyle = '#fff'; // un PNG con transparencia no queda en negro
    contexto.fillRect(0, 0, destino.width, destino.height);
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(imagen, r.x, r.y, r.ancho, r.alto, 0, 0, destino.width, destino.height);
  }

  function actualizar() {
    dibujar(lienzo);
    alCambiar();
  }

  function desplazar(x, y, ancho, alto) {
    const mitadX = ancho / 2 / imagen.width;
    const mitadY = alto / 2 / imagen.height;
    centroX = Math.min(Math.max(centroX - x / imagen.width, mitadX), 1 - mitadX);
    centroY = Math.min(Math.max(centroY - y / imagen.height, mitadY), 1 - mitadY);
    actualizar();
  }

  archivo.addEventListener('change', async () => {
    const elegido = archivo.files[0];
    if (!elegido) return;
    mensaje.hidden = true;
    try {
      const nueva = await createImageBitmap(elegido); // respeta la orientación de la cámara
      if (archivo.files[0] !== elegido) {
        nueva.close();
        return;
      }
      imagen?.close();
      imagen = nueva;
    } catch {
      if (archivo.files[0] !== elegido) return;
      imagen?.close();
      imagen = null;
      lienzo.hidden = true;
      ayuda.hidden = true;
      zoomRotulo.hidden = true;
      controles.hidden = true;
      mensaje.textContent = 'No se pudo abrir esa foto. Probá con una JPG, PNG o WebP.';
      mensaje.hidden = false;
      alCambiar();
      return;
    }
    centroX = 0.5;
    centroY = 0.5;
    zoom.value = '1';
    lienzo.hidden = false;
    ayuda.hidden = false;
    zoomRotulo.hidden = false;
    controles.hidden = false;
    if (recorte().ancho < ANCHO_CHICO) {
      mensaje.textContent = 'La foto es chica y puede verse borrosa. Si podés, usá una más grande.';
      mensaje.hidden = false;
    }
    actualizar();
  });

  zoom.addEventListener('input', actualizar);

  let arrastre = null;
  lienzo.addEventListener('pointerdown', (evento) => {
    lienzo.setPointerCapture(evento.pointerId);
    arrastre = { x: evento.clientX, y: evento.clientY };
  });
  lienzo.addEventListener('pointermove', (evento) => {
    if (!arrastre || !imagen) return;
    const { ancho, alto } = recorte();
    const escala = ancho / lienzo.getBoundingClientRect().width;
    desplazar((evento.clientX - arrastre.x) * escala, (evento.clientY - arrastre.y) * escala, ancho, alto);
    arrastre = { x: evento.clientX, y: evento.clientY };
  });
  const soltar = () => { arrastre = null; };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  return {
    nodo,
    hayFoto: () => imagen !== null,
    url: () => lienzo.toDataURL('image/jpeg', 0.8),
    // El JPEG final, sin agrandar una foto chica y con 1200 px como máximo del lado mayor.
    async base64() {
      const r = recorte();
      const escala = Math.min(1, LADO_MAXIMO / Math.max(r.ancho, r.alto));
      const salida = crear('canvas');
      salida.width = Math.round(r.ancho * escala);
      salida.height = Math.round(r.alto * escala);
      dibujar(salida);
      const blob = await new Promise((listo) => { salida.toBlob(listo, 'image/jpeg', CALIDAD); });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binario = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binario);
    },
  };
}
