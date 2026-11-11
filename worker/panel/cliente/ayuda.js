// Guía lateral ("?") y recorrido de tres pasos la primera vez que se abre una pantalla de contenido.
// Lo visto se recuerda en este navegador; sin almacenamiento, el recorrido no se ofrece.
const $ = (id) => document.getElementById(id);
const CLAVE = 'portillo-panel:recorrido-visto';
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function visible(selector) {
  for (const nodo of document.querySelectorAll(selector)) {
    if (nodo.getClientRects().length && getComputedStyle(nodo).visibility !== 'hidden') return nodo;
  }
  return null;
}

const PASOS = [
  {
    objetivo: () => visible('#menu') ?? visible('#menu-movil'),
    titulo: 'Elegí qué querés cambiar',
    texto: () => (visible('#menu')
      ? 'Acá están las partes del sitio que podés editar: textos, fotos, reseñas y abogados.'
      : 'Tocá «Secciones» para elegir qué querés editar: textos, fotos, reseñas o abogados.'),
  },
  {
    objetivo: () => visible('#pantalla .tarjeta'),
    titulo: 'Cambiá lo que necesites',
    texto: () => 'Escribí sobre lo que está publicado. Un punto junto al nombre del campo te marca lo que tocaste, y queda guardado en este navegador.',
  },
  {
    objetivo: () => visible('#pie'),
    titulo: 'Publicá cuando termines',
    texto: () => 'Acá ves cuántos cambios tenés. «Ver cómo queda» te muestra la portada antes, y «Publicar» los manda al sitio: en unos minutos se ven.',
  },
];

function ubicar(dialogo, objetivo) {
  const foco = dialogo.querySelector('.recorrido-foco');
  const tarjeta = dialogo.querySelector('.recorrido-tarjeta');
  if (!objetivo) {
    foco.hidden = true;
    tarjeta.style.top = '';
    tarjeta.style.left = '';
    return;
  }
  foco.hidden = false;
  const r = objetivo.getBoundingClientRect();
  const margen = 8;
  foco.style.left = `${r.left - margen}px`;
  foco.style.top = `${Math.max(4, r.top - margen)}px`;
  foco.style.width = `${r.width + margen * 2}px`;
  foco.style.height = `${Math.min(r.height + margen * 2, innerHeight - 8)}px`;
  const alto = tarjeta.offsetHeight;
  const ancho = tarjeta.offsetWidth;
  const abajo = innerHeight - r.bottom;
  const top = abajo >= alto + 24 ? r.bottom + 20 : r.top >= alto + 24 ? r.top - alto - 20 : Math.max(16, innerHeight - alto - 16);
  tarjeta.style.top = `${top}px`;
  tarjeta.style.left = `${Math.min(Math.max(16, r.left), innerWidth - ancho - 16)}px`;
}

const visto = () => {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return true; }
};

export function iniciarRecorrido(forzar = false) {
  if (!forzar && visto()) return;
  const dialogo = $('recorrido');
  if (dialogo.open || document.querySelector('dialog[open]')) return;
  let indice = 0;
  const seguir = $('recorrido-seguir');
  const mostrar = () => {
    const paso = PASOS[indice];
    const objetivo = paso.objetivo();
    objetivo?.scrollIntoView({ block: 'center', behavior: 'instant' });
    $('recorrido-paso').textContent = `PASO ${indice + 1} DE ${PASOS.length}`;
    $('recorrido-titulo').textContent = paso.titulo;
    $('recorrido-texto').textContent = paso.texto();
    seguir.textContent = indice === PASOS.length - 1 ? 'Entendido' : 'Siguiente';
    requestAnimationFrame(() => ubicar(dialogo, objetivo));
    if (!quieto()) {
      dialogo.querySelector('.recorrido-tarjeta').animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    }
    seguir.focus();
  };
  const reubicar = () => ubicar(dialogo, PASOS[indice].objetivo());
  const avanzar = () => {
    indice += 1;
    if (indice >= PASOS.length) dialogo.close();
    else mostrar();
  };
  const saltar = () => dialogo.close();
  seguir.addEventListener('click', avanzar);
  $('recorrido-saltar').addEventListener('click', saltar);
  addEventListener('resize', reubicar);
  dialogo.addEventListener('close', () => {
    seguir.removeEventListener('click', avanzar);
    $('recorrido-saltar').removeEventListener('click', saltar);
    removeEventListener('resize', reubicar);
    try { localStorage.setItem(CLAVE, '1'); } catch { /* se vuelve a ofrecer la próxima vez */ }
    window.scrollTo(0, 0);
    $('abrir-guia').focus();
  }, { once: true });
  dialogo.showModal();
  mostrar();
}

export function iniciarGuia() {
  const guia = $('guia');
  const abrir = $('abrir-guia');
  abrir.addEventListener('click', () => {
    guia.showModal();
    abrir.setAttribute('aria-expanded', 'true');
  });
  guia.addEventListener('close', () => {
    abrir.setAttribute('aria-expanded', 'false');
    if (guia.returnValue !== 'recorrido') abrir.focus();
  });
  // Un toque afuera del panel lo cierra.
  guia.addEventListener('click', (evento) => { if (evento.target === guia) guia.close(); });
  $('repetir-recorrido').addEventListener('click', () => {
    guia.close('recorrido');
    if (visible('#pie')) {
      iniciarRecorrido(true);
      return;
    }
    // Fuera de una pantalla de contenido: se abre Textos y el recorrido arranca al terminar de cargar.
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento no hay recorrido */ }
    location.hash = '#/textos';
  });
}
