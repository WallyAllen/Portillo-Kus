// Piezas que comparten las pantallas de contenido.
export const ESPANOL = 'src/content.es.json';
export const serializar = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

export function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

// Cada sección del menú: una línea que dice qué hay adentro y un ícono de trazo (24×24).
export const SECCIONES = {
  inicio: { resumen: 'Resumen y accesos', icono: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>' },
  textos: { resumen: 'Títulos, pasos y horarios', icono: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
  fotos: { resumen: 'Imágenes del sitio', icono: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>' },
  resenas: { resumen: 'Opiniones de clientes', icono: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>' },
  abogados: { resumen: 'Equipo, fotos y orden', icono: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>' },
  traducciones: { resumen: 'Inglés, portugués y más', icono: '<path d="M4 5h9M8.5 3v2M6 5c.5 3.5 2.6 6.3 6 8M11 5c-.6 3.6-3 6.6-6.5 8.5"/><path d="m13 21 4-9 4 9M14.5 18h5"/>' },
  usuarios: { resumen: 'Cuentas y contraseñas', icono: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>' },
};

export function icono(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icono');
  svg.innerHTML = SECCIONES[id]?.icono ?? '<circle cx="12" cy="12" r="8"/>';
  return svg;
}

export const leerClave = (datos, clave) => clave.split('.').reduce((nodo, parte) => nodo?.[parte], datos);

export function fijarClave(datos, clave, valor) {
  const partes = clave.split('.');
  const ultima = partes.pop();
  partes.reduce((nodo, parte) => nodo[parte], datos)[ultima] = valor;
}

let ultimoId = 0;

// Rótulo, entrada, contador y lugar para el aviso, unidos para lectores de pantalla.
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
  if (nota) nota.id = `${id}-ayuda`;
  const contador = largo ? crear('p', 'campo-contador') : null;
  if (contador) {
    contador.id = `${id}-contador`;
    const contar = () => {
      const usados = [...entrada.value].length;
      contador.textContent = `${usados} de ${largo} caracteres`;
      contador.classList.toggle('cerca', usados >= largo * 0.9);
    };
    entrada.addEventListener('input', contar);
    contar();
  }
  nodo.append(rotulo, ...(nota ? [nota] : []), entrada, aviso, ...(contador ? [contador] : []));
  let mensajeActual = null;
  const describir = () => {
    const descripciones = [nota?.id, mensajeActual && aviso.id, contador?.id].filter(Boolean).join(' ');
    if (descripciones) entrada.setAttribute('aria-describedby', descripciones);
    else entrada.removeAttribute('aria-describedby');
  };
  describir();
  const avisar = (mensaje) => {
    mensajeActual = mensaje || null;
    aviso.textContent = mensaje ?? '';
    aviso.hidden = !mensaje;
    describir();
    if (mensaje) entrada.setAttribute('aria-invalid', 'true');
    else entrada.removeAttribute('aria-invalid');
  };
  return { nodo, entrada, avisar };
}

// El punto junto al nombre de un campo que cambió. El texto oculto lo dice a un lector de pantalla.
export function marcarEditado(entrada, editado) {
  const contenedor = entrada.closest('.campo, .campo-check, .foto-tarjeta');
  if (!contenedor || contenedor.classList.contains('editado') === editado) return;
  contenedor.classList.toggle('editado', editado);
  const rotulo = contenedor.matches('.campo-check') ? contenedor : contenedor.querySelector('label, h3, .campo-rotulo');
  const marca = rotulo?.querySelector(':scope > .marca-editado');
  if (editado && rotulo && !marca) {
    const nueva = crear('span', 'marca-editado');
    nueva.append(crear('span', 'solo-lector', ' (cambiado)'));
    rotulo.append(nueva);
  } else if (!editado) {
    marca?.remove();
  }
}

// Mientras carga: la forma de la pantalla, sin texto que leer. El aviso es para lectores de pantalla.
export function cargando(contenedor) {
  const esqueleto = crear('div', 'esqueleto');
  esqueleto.setAttribute('aria-hidden', 'true');
  for (const clase of ['hueso-titulo', 'hueso-linea', 'hueso-etiqueta', 'hueso-campo', 'hueso-etiqueta', 'hueso-campo', 'hueso-etiqueta', 'hueso-area']) {
    esqueleto.append(crear('span', `hueso ${clase}`));
  }
  const estado = crear('p', 'solo-lector', 'Cargando…');
  estado.setAttribute('role', 'status');
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.replaceChildren(estado, esqueleto);
}

export const listo = (contenedor) => contenedor.removeAttribute('aria-busy');

export function fallaDeCarga(contenedor, e) {
  listo(contenedor);
  const nodo = crear('p', 'aviso-error', e.message);
  nodo.setAttribute('role', 'alert');
  contenedor.replaceChildren(nodo);
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
// Si quedó un borrador, el formulario espera en pausa hasta que se elija qué hacer con él.
// alCambiar(): avisa a la barra de publicación; cuenta() dice cuántos campos cambiaron.
export function borradorDeFormulario({ formulario, usuario, seccion, commit, campos, recargar, borradorAnterior, alCambiar = () => {} }) {
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

  ultimoId += 1;
  const region = crear('div', 'aviso-borrador');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-labelledby', `borrador-${ultimoId}`);
  const titulo = crear('h2', '');
  titulo.id = `borrador-${ultimoId}`;
  titulo.tabIndex = -1;
  const texto = crear('p', '');
  const botones = crear('div', 'acciones');
  region.append(titulo, texto, botones);
  region.hidden = true;

  let guardado = borradorAnterior ?? leer();
  let anterior = null;
  try { anterior = JSON.parse(guardado); } catch { /* Borrador ilegible. */ }
  if (!anterior?.campos || !Object.keys(anterior.campos).length) anterior = null;
  let pregunta = false; // hay un aviso que pide elegir antes de seguir
  let cargando = false;
  let ocupado = false;
  const fieldsets = [...formulario.querySelectorAll('fieldset')];
  const pausar = () => {
    for (const fieldset of fieldsets) fieldset.disabled = pregunta || cargando || ocupado;
    formulario.classList.toggle('en-espera', pregunta || cargando);
    for (const control of botones.children) control.disabled = cargando || ocupado;
  };
  const aplicar = (valores) => {
    for (const [nombre, entrada] of campos) {
      if (!Object.hasOwn(valores, nombre)) continue;
      if (entrada.type === 'checkbox') entrada.checked = valores[nombre] === true;
      else if (typeof valores[nombre] === 'string') entrada.value = valores[nombre];
      entrada.dispatchEvent(new Event('input')); // el contador de caracteres
    }
  };
  const cambiados = () => campos.filter(([, entrada], indice) => valor(entrada) !== inicial[indice][1]);

  function registrar() {
    const cambios = cambiados();
    if (!pregunta) {
      const siguiente = cambios.length ? JSON.stringify({
        commit,
        campos: Object.fromEntries(cambios.map(([nombre, entrada]) => [nombre, valor(entrada)])),
      }) : null;
      if (siguiente !== guardado) {
        escribir(siguiente);
        guardado = siguiente;
      }
    }
    campos.forEach(([, entrada], indice) => marcarEditado(entrada, valor(entrada) !== inicial[indice][1]));
    pausar();
    alCambiar();
  }

  const boton = (rotulo, accion, clase = 'boton boton-suave') => {
    const b = crear('button', clase, rotulo);
    b.type = 'button';
    b.addEventListener('click', accion);
    return b;
  };
  const mostrar = (tipo, encabezado, explicacion, acciones) => {
    region.dataset.tipo = tipo;
    titulo.textContent = encabezado;
    texto.textContent = explicacion;
    botones.replaceChildren(...acciones);
    region.hidden = false;
    pregunta = tipo !== 'conflicto';
    pausar();
  };
  const ocultar = () => {
    region.hidden = true;
    pregunta = false;
    pausar();
  };
  const seguir = () => {
    aplicar(anterior.campos);
    ocultar();
    registrar();
    (campos.find(([nombre]) => Object.hasOwn(anterior.campos, nombre)) ?? campos[0])?.[1].focus();
  };
  const deCero = () => {
    escribir(null);
    guardado = null;
    ocultar();
    registrar();
    campos[0]?.[1].focus();
  };

  if (anterior && anterior.commit === commit) {
    mostrar('pregunta', 'Tenés cambios sin publicar',
      'La última vez dejaste cambios en esta sección que todavía no se publicaron. Quedaron guardados en este navegador. ¿Seguís con esos cambios o empezás de cero con lo que está publicado?',
      [boton('Seguir con lo que estaba haciendo', seguir, 'boton'), boton('Empezar de cero', deCero)]);
  } else if (anterior) {
    mostrar('viejo', 'Tenés cambios de antes de la última publicación',
      'Quedaron cambios sin publicar en este navegador, pero después se publicó otra versión de esta sección. Podés recuperarlos y revisar campo por campo antes de publicar, o descartarlos.',
      [boton('Recuperar y revisar', seguir, 'boton'), boton('Descartar', deCero)]);
  }

  const cargarActual = async () => {
    cargando = true;
    pausar();
    try {
      await recargar(guardado);
    } catch {
      texto.textContent = 'No se pudo cargar la versión actual. El formulario sigue abierto: probá de nuevo en un rato.';
      cargando = false;
      pausar();
    }
  };

  formulario.addEventListener('input', registrar);
  formulario.addEventListener('change', registrar);
  formulario.prepend(region);
  registrar();
  return {
    cuenta: () => (pregunta ? 0 : cambiados().length),
    cambiados: () => cambiados().map(([nombre]) => nombre),
    pendiente: () => pregunta || cargando,
    mostrarConflicto: () => {
      mostrar('conflicto', 'Otra persona publicó cambios mientras editabas',
        'Tus cambios siguen acá y en este navegador. Cargá la versión actual: después te ofrecemos recuperar lo tuyo para revisarlo antes de publicar.',
        [boton('Cargar versión actual', cargarActual, 'boton')]);
      titulo.focus();
    },
    limpiar: () => { if (leer() === guardado) escribir(null); },
    editar: (permitido) => {
      ocupado = !permitido;
      pausar();
    },
  };
}

// Map.groupBy no existe en un iPhone con iOS anterior a 17.4.
export function agrupar(lista) {
  const grupos = new Map();
  for (const item of lista) grupos.set(item.grupo, [...(grupos.get(item.grupo) ?? []), item]);
  return grupos;
}
