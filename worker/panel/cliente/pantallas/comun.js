// Piezas que comparten las pantallas de contenido.
export const ESPANOL = 'src/content.es.json';
export const serializar = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

export function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

export const leerClave = (datos, clave) => clave.split('.').reduce((nodo, parte) => nodo?.[parte], datos);

export function fijarClave(datos, clave, valor) {
  const partes = clave.split('.');
  const ultima = partes.pop();
  partes.reduce((nodo, parte) => nodo[parte], datos)[ultima] = valor;
}

let ultimoId = 0;

// Rótulo, entrada y lugar para el aviso, unidos para lectores de pantalla.
export function campo({ etiqueta, valor = '', largo, multilinea = false, ayuda, tipo = 'text' }) {
  ultimoId += 1;
  const id = `campo-${ultimoId}`;
  const nodo = crear('div', 'campo');
  const rotulo = crear('label', '', etiqueta);
  rotulo.htmlFor = id;
  const entrada = crear(multilinea ? 'textarea' : 'input');
  entrada.id = id;
  if (multilinea) entrada.rows = 4;
  else entrada.type = tipo;
  entrada.value = valor;
  if (largo) entrada.maxLength = largo;
  const aviso = crear('p', 'campo-error');
  aviso.id = `${id}-error`;
  aviso.hidden = true;
  nodo.append(rotulo);
  if (ayuda) nodo.append(crear('p', 'campo-ayuda', ayuda));
  nodo.append(entrada, aviso);
  const avisar = (mensaje) => {
    aviso.textContent = mensaje ?? '';
    aviso.hidden = !mensaje;
    if (mensaje) entrada.setAttribute('aria-describedby', aviso.id);
    else entrada.removeAttribute('aria-describedby');
    entrada.toggleAttribute('aria-invalid', Boolean(mensaje));
  };
  return { nodo, entrada, avisar };
}

export function aviso() {
  const nodo = crear('p', 'aviso-error');
  nodo.setAttribute('role', 'alert');
  nodo.hidden = true;
  return {
    nodo,
    mostrar(mensaje) {
      nodo.textContent = mensaje ?? '';
      nodo.hidden = !mensaje;
    },
  };
}

export const mensajeDeError = (e) => [e.message, ...(e.datos?.errores ?? [])].join(' ');

// Un guardado que vuelve a leer lo último, con o sin error. Con un 409 avisa que otra persona guardó.
export async function guardarYRecargar({ guardar, cambios, recargar, alFallar }) {
  try {
    await guardar(cambios);
  } catch (e) {
    if (e.estado === 409) await recargar();
    alFallar(mensajeDeError(e));
    return false;
  }
  await recargar();
  return true;
}

// Map.groupBy no existe en un iPhone con iOS anterior a 17.4.
export function agrupar(lista) {
  const grupos = new Map();
  for (const item of lista) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item]);
  return grupos;
}
