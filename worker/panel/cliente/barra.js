// Barra fija de publicación, abajo de cada pantalla de contenido. Una pantalla la usa con
// ctx.barra.usar({ contar, publicar, previa?, etiqueta? }):
//   contar(): cuántos cambios sin publicar hay ahora.
//   publicar(): guarda; devuelve true si salió. Los avisos de error los muestra la pantalla.
//   previa(): opcional, abre "Ver cómo queda".
//   etiqueta(): opcional, el texto del botón principal ("Publicar" si no está).
//   enPausa(): opcional, true mientras la pantalla espera que se elija qué hacer con un borrador.
// Devuelve { actualizar() }, que la pantalla llama cada vez que cambia algo.
// La publicación (guardado → "Publicando…" → listo) la informa app.js con estadoPublicacion().
const $ = (id) => document.getElementById(id);

let pantalla = null; // lo que registró la pantalla visible
let turno = 0; // cada pantalla nueva invalida lo que registró la anterior
let publicacion = null; // null | 'publicando' | 'publicado' | 'problema'
let destino = '/';
let guardando = false;
let fallo = '';
let alCambiarCambios = () => {};

const cantidad = () => (pantalla ? pantalla.contar() : 0);

function pintar() {
  const pie = $('pie');
  const n = cantidad();
  const modo = guardando ? 'guardando'
    : fallo && n ? 'error'
      : n ? 'cambios'
        : publicacion === 'publicando' ? 'publicando'
          : publicacion === 'publicado' ? 'listo'
            : publicacion === 'problema' ? 'problema'
              : 'tranquilo';
  const texto = {
    guardando: 'Guardando tus cambios…',
    error: fallo,
    cambios: `${n} ${n === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}`,
    publicando: 'Publicando en el sitio…',
    listo: 'Listo, ya se ve en el sitio',
    problema: 'El cambio quedó guardado, pero todavía no se ve en el sitio. Si en un rato sigue así, avisale a Felipe.',
    tranquilo: 'Todo publicado',
  }[modo];
  pie.hidden = (!pantalla && !publicacion) || Boolean(pantalla?.enPausa?.() && !publicacion);
  const anterior = pie.dataset.modo;
  pie.dataset.modo = modo;
  $('pie-texto').textContent = texto;
  $('pie-progreso').hidden = !(guardando || (modo === 'publicando'));
  const ver = $('pie-ver');
  ver.hidden = modo !== 'listo';
  ver.href = destino;
  const publicar = $('pie-publicar');
  publicar.disabled = guardando;
  $('pie-publicar-texto').textContent = guardando ? 'Guardando…' : (pantalla?.etiqueta?.() ?? 'Publicar');
  $('pie-previa').hidden = !pantalla?.previa;
  $('pie-previa').disabled = guardando;
  if (anterior !== modo && ['cambios', 'error'].includes(modo) && !['cambios', 'error', 'guardando'].includes(anterior)) {
    animarEntrada(pie);
  }
  alCambiarCambios(n);
}

function animarEntrada(nodo) {
  if (!nodo.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  nodo.animate([{ transform: 'translateY(110%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 420, easing: 'cubic-bezier(.34,1.45,.64,1)' });
}

// Para cada pantalla nueva. Lo que registre una pantalla que ya no se ve no hace nada.
export function paraPantalla() {
  const mio = ++turno;
  pantalla = null;
  fallo = '';
  if (publicacion !== 'publicando') publicacion = null;
  pintar();
  return {
    usar(opciones) {
      if (mio !== turno) return { actualizar() {} };
      pantalla = opciones;
      fallo = '';
      pintar();
      return {
        actualizar() {
          if (mio !== turno) return;
          if (!cantidad()) fallo = '';
          pintar();
        },
      };
    },
  };
}

export function estadoPublicacion(estado, enlace = '/') {
  publicacion = estado;
  destino = enlace;
  pintar();
}

export const hayCambios = () => cantidad() > 0;
export const ocupada = () => guardando;
export function avisarCambios(fn) { alCambiarCambios = fn; }

export function iniciarBarra() {
  $('pie-publicar').addEventListener('click', async () => {
    if (!pantalla || guardando) return;
    if (!cantidad()) {
      fallo = '';
      pintar();
      return;
    }
    const actual = pantalla;
    const mio = turno;
    guardando = true;
    fallo = '';
    pintar();
    let salio = false;
    try {
      salio = await actual.publicar();
    } finally {
      guardando = false;
      if (mio === turno && !salio && cantidad()) fallo = 'No se publicó. Revisá lo que quedó marcado.';
      pintar();
    }
  });
  $('pie-previa').addEventListener('click', () => pantalla?.previa?.());
}
