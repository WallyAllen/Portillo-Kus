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
  const nota = ayuda ? crear('p', 'campo-ayuda', ayuda) : null;
  nodo.append(rotulo);
  if (nota) {
    nota.id = `${id}-ayuda`;
    entrada.setAttribute('aria-describedby', nota.id);
    nodo.append(nota);
  }
  nodo.append(entrada, aviso);
  const avisar = (mensaje) => {
    aviso.textContent = mensaje ?? '';
    aviso.hidden = !mensaje;
    const descripciones = [nota?.id, mensaje && aviso.id].filter(Boolean).join(' ');
    if (descripciones) entrada.setAttribute('aria-describedby', descripciones);
    else entrada.removeAttribute('aria-describedby');
    if (mensaje) entrada.setAttribute('aria-invalid', 'true');
    else entrada.removeAttribute('aria-invalid');
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

// Un conflicto deja el formulario intacto. Quien edita decide cuándo cargar la versión nueva.
export async function guardarYRecargar({ guardar, cambios, recargar, alFallar }) {
  let resultado;
  try {
    resultado = await guardar(cambios);
  } catch (e) {
    alFallar(mensajeDeError(e), e.estado);
    return false;
  }
  try {
    await recargar(resultado);
  } catch {
    alFallar('El cambio se guardó. Volvé a abrir esta sección para cargar la versión actual.');
  }
  return true;
}

// Sólo se guardan campos editados, por cuenta y sección. La versión actual siempre se lee del servidor.
export function borradorDeFormulario({ formulario, usuario, seccion, commit, campos, recargar, borradorAnterior }) {
  const clave = `portillo-borrador:${usuario}:${seccion}`;
  const leer = () => {
    try { return localStorage.getItem(clave); } catch { return null; }
  };
  const escribir = (valor) => {
    try {
      if (valor) localStorage.setItem(clave, valor);
      else localStorage.removeItem(clave);
    } catch { /* El formulario conserva lo escrito mientras siga abierto. */ }
  };
  const valor = (entrada) => entrada.type === 'checkbox' ? entrada.checked : entrada.value;
  const inicial = campos.map(([nombre, entrada]) => [nombre, valor(entrada)]);
  const estado = crear('p', 'campo-ayuda');
  estado.setAttribute('role', 'status');
  const acciones = crear('div', 'acciones');
  const recuperar = crear('button', 'boton boton-borde', 'Recuperar borrador');
  const descartar = crear('button', 'boton boton-borde', 'Descartar borrador');
  const actualizar = crear('button', 'boton boton-borde', 'Cargar versión actual');
  recuperar.type = descartar.type = actualizar.type = 'button';
  actualizar.hidden = true;
  acciones.append(recuperar, descartar, actualizar);

  let guardado = borradorAnterior ?? leer();
  let anterior;
  try { anterior = JSON.parse(guardado); } catch { /* Borrador ilegible. */ }
  let pendiente = Boolean(anterior?.campos && anterior.commit !== commit);
  let cargando = false;
  const fieldsets = [...formulario.querySelectorAll('fieldset')];
  const editar = (permitido) => {
    for (const control of acciones.children) control.disabled = !permitido;
    for (const fieldset of fieldsets) fieldset.disabled = !permitido || pendiente;
  };
  function aplicar(valores) {
    for (const [nombre, entrada] of campos) {
      if (!Object.hasOwn(valores, nombre)) continue;
      if (entrada.type === 'checkbox') entrada.checked = valores[nombre] === true;
      else if (typeof valores[nombre] === 'string') entrada.value = valores[nombre];
    }
  }
  if (anterior?.campos && !pendiente) aplicar(anterior.campos);

  function registrar() {
    const cambios = campos.filter(([, entrada], indice) => valor(entrada) !== inicial[indice][1]);
    if (!pendiente) {
      const siguiente = cambios.length ? JSON.stringify({
        commit,
        campos: Object.fromEntries(cambios.map(([nombre, entrada]) => [nombre, valor(entrada)])),
      }) : null;
      if (siguiente !== guardado) {
        escribir(siguiente);
        guardado = siguiente;
      }
    }
    estado.textContent = pendiente
      ? 'Hay un borrador de una versión anterior. Recuperalo y revisá los campos antes de publicar, o descartalo.'
      : cambios.length
        ? `${cambios.length} ${cambios.length === 1 ? 'campo sin publicar' : 'campos sin publicar'}${leer() === guardado ? ' · Borrador en este navegador' : ''}`
        : 'Sin cambios en esta sección.';
    recuperar.hidden = !pendiente;
    descartar.hidden = !pendiente && !cambios.length;
    for (const fieldset of fieldsets) fieldset.disabled = pendiente || cargando;
  }

  formulario.addEventListener('input', registrar);
  recuperar.addEventListener('click', () => {
    aplicar(anterior.campos);
    pendiente = false;
    registrar();
    campos.find(([nombre]) => Object.hasOwn(anterior.campos, nombre))?.[1].focus();
  });
  descartar.addEventListener('click', () => {
    aplicar(Object.fromEntries(inicial));
    pendiente = false;
    registrar();
    campos[0]?.[1].focus();
  });
  actualizar.addEventListener('click', async () => {
    cargando = true;
    editar(false);
    try {
      await recargar(guardado);
    } catch {
      estado.textContent = 'No se pudo cargar la versión actual. El formulario sigue abierto.';
      editar(true);
    } finally {
      cargando = false;
    }
  });
  formulario.prepend(estado, acciones);
  registrar();
  return {
    pendiente: () => pendiente || cargando,
    mostrarConflicto: () => { actualizar.hidden = false; },
    limpiar: () => { if (leer() === guardado) escribir(null); },
    editar,
  };
}

// Map.groupBy no existe en un iPhone con iOS anterior a 17.4.
export function agrupar(lista) {
  const grupos = new Map();
  for (const item of lista) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item]);
  return grupos;
}
