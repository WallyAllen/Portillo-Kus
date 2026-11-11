// "Ver cómo queda": la portada publicada en español, en un iframe sin scripts, con los cambios
// sin publicar aplicados encima. Sólo se cambia texto con textContent y atributos de imagen: lo que
// escribió el estudio nunca se interpreta como HTML.
// cambios: { textos?: [{ clave, antes, ahora }], resenas?: [{ n, texto, autor, visible, eraVisible }],
//            fotos?: [{ archivo, url, alt }] }
const $ = (id) => document.getElementById(id);

// Dónde buscar cada texto: el pie y el menú del celular repiten algunos (los horarios).
const ZONAS = [['footer.', '.site-footer'], ['mobile.', '#mobilePanel']];
const zonaDe = (clave) => ZONAS.find(([prefijo]) => clave.startsWith(prefijo))?.[1];

function reemplazarTexto(doc, { clave, antes, ahora }) {
  if (!antes.trim()) return false;
  const zona = zonaDe(clave);
  const raiz = zona ? doc.querySelector(zona) : doc.body;
  if (!raiz) return false;
  const excluir = zona ? null : ZONAS.map(([, selector]) => doc.querySelector(selector)).filter(Boolean);
  const recorrido = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let encontrado = false;
  for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
    if (excluir?.some((otra) => otra.contains(nodo))) continue;
    if (nodo.data.includes(antes)) {
      nodo.data = nodo.data.split(antes).join(ahora);
      encontrado = true;
    }
  }
  return encontrado;
}

// La misma tarjeta que arma src/template.html, para cuando no hay ninguna publicada que copiar.
function tarjetaNueva(doc) {
  const tarjeta = doc.createElement('article');
  tarjeta.className = 'review-card reveal';
  for (const [clase, texto] of [['review-stars', '★★★★★'], ['review-text', ''], ['review-name', '']]) {
    const parte = doc.createElement(clase === 'review-stars' ? 'div' : 'p');
    parte.className = clase;
    parte.textContent = texto;
    tarjeta.append(parte);
  }
  return tarjeta;
}

// Las tarjetas visibles están en orden: la primera publicada es la primera tarjeta.
function aplicarResenas(doc, resenas) {
  const rejilla = doc.querySelector('#opiniones .reviews-grid');
  if (!rejilla) return resenas.every((r) => !r.visible);
  const actuales = [...rejilla.querySelectorAll('.review-card')];
  const porNumero = new Map(resenas.filter((r) => r.eraVisible).map((r, i) => [r.n, actuales[i]]));
  const nuevas = resenas.filter((r) => r.visible).map((r) => {
    const tarjeta = porNumero.get(r.n) ?? actuales[0]?.cloneNode(true) ?? tarjetaNueva(doc);
    tarjeta.querySelector('.review-text').textContent = r.texto;
    tarjeta.querySelector('.review-name').textContent = r.autor;
    return tarjeta;
  });
  rejilla.replaceChildren(...nuevas);
  return true;
}

function aplicarFoto(doc, { archivo, url, alt }) {
  let encontrada = false;
  for (const imagen of doc.querySelectorAll('img')) {
    const src = imagen.getAttribute('src') ?? '';
    if (!src.split('?')[0].endsWith(`/${archivo}`) && src.split('?')[0] !== `portillo-images/${archivo}`) continue;
    imagen.closest('picture')?.querySelectorAll('source').forEach((fuente) => fuente.remove());
    imagen.removeAttribute('srcset');
    imagen.removeAttribute('loading');
    imagen.src = url;
    if (alt) imagen.alt = alt;
    encontrada = true;
  }
  return encontrada;
}

function aplicar(doc, cambios) {
  let faltan = 0;
  for (const texto of cambios.textos ?? []) if (!reemplazarTexto(doc, texto)) faltan += 1;
  if (cambios.resenas && !aplicarResenas(doc, cambios.resenas)) faltan += 1;
  for (const foto of cambios.fotos ?? []) if (!aplicarFoto(doc, foto)) faltan += 1;
  // Es para mirar: ningún enlace ni formulario navega fuera de la vista previa.
  doc.addEventListener('click', (evento) => {
    if (evento.target.closest?.('a, button, form')) evento.preventDefault();
  }, true);
  doc.addEventListener('submit', (evento) => evento.preventDefault(), true);
  return faltan;
}

// Lleva la vista a lo que cambió: la primera foto, las reseñas o el primer texto.
function enfocarCambio(doc, cambios) {
  const destino = cambios.fotos?.length ? doc.querySelector(`img[src^="data:"]`)
    : cambios.resenas ? doc.querySelector('#opiniones')
      : null;
  destino?.scrollIntoView({ block: 'center' });
}

export async function abrirPrevia(cambios) {
  const dialogo = $('previa');
  const marco = $('previa-pagina');
  const nota = $('previa-nota');
  nota.textContent = 'Cargando la portada…';
  dialogo.showModal();
  await new Promise((listo) => {
    marco.addEventListener('load', listo, { once: true });
    marco.src = `/?panel-vista-previa=${Date.now()}`;
  });
  const doc = marco.contentDocument;
  if (!doc?.body) {
    nota.textContent = 'No se pudo cargar la portada. Probá de nuevo en un rato.';
    return;
  }
  const faltan = aplicar(doc, cambios);
  enfocarCambio(doc, cambios);
  nota.textContent = faltan
    ? 'Algún cambio no se puede mostrar acá, pero se publica igual. Es la portada en español con tus cambios: todavía no está publicada.'
    : 'Es la portada en español con tus cambios. Todavía no está publicada.';
}

export function iniciarPrevia() {
  const dialogo = $('previa');
  dialogo.addEventListener('close', () => {
    $('previa-pagina').removeAttribute('src');
    $('pie-previa').focus();
  });
}
