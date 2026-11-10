// Armazón del panel: sesión, menú, pantallas y aviso de publicación.
// Una pantalla es { id, titulo, soloAdmin?, render(contenedor, ctx) }; ctx trae
// { usuario, api, guardar, seguirPublicacion }. Para sumar una: importarla, agregarla a
// PANTALLAS y servirla en worker/panel/rutas.js.
import abogados from './pantallas/abogados.js';
import fotos from './pantallas/fotos.js';
import inicio from './pantallas/inicio.js';
import resenas from './pantallas/resenas.js';
import textos from './pantallas/textos.js';
import traducciones from './pantallas/traducciones.js';
import usuarios from './pantallas/usuarios.js';

const PANTALLAS = [inicio, abogados, fotos, resenas, textos, traducciones, usuarios];

const CINCO_MINUTOS = 5 * 60 * 1000;
const CADA_CUANTO = 10 * 1000;
const CLAVE_PUBLICACION = 'panel-publicacion';

const $ = (id) => document.getElementById(id);
let sesion = null;
let reingreso = null;

export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos; // 409: datos.conflicto (archivos); 422: datos.errores (textos)
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const sesionAlEnviar = sesion;
  const encabezados = {};
  if (metodo !== 'GET') {
    encabezados['Content-Type'] = 'application/json';
    if (sesion) encabezados['X-CSRF-Token'] = sesion.csrf;
  }
  let respuesta;
  try {
    respuesta = await fetch(ruta, { method: metodo, headers: encabezados, body: cuerpo && JSON.stringify(cuerpo) });
  } catch {
    throw new ErrorApi('No hay conexión. Probá de nuevo.', 0);
  }
  const datos = await respuesta.json().catch(() => null); // Cloudflare puede responder una página de error
  if (respuesta.ok && datos) return datos;
  if (respuesta.status === 401 && sesionAlEnviar && sesion === sesionAlEnviar) mostrarLogin({ conservar: true });
  throw new ErrorApi(datos?.error || 'Hubo un problema. Probá de nuevo en un rato.', respuesta.status, datos);
}

// { base, descripcion, archivos: [{ ruta, texto } | { ruta, base64 }] }. base es el commit que
// devolvió /api/archivo al leer. Si otra persona tocó lo mismo, lanza ErrorApi con estado 409.
export async function guardar(cambios) {
  const sesionAlEnviar = sesion;
  const destino = enlaceAlSitio();
  const resultado = await api('/api/guardar', { metodo: 'POST', cuerpo: cambios });
  if (sesion && sesion.usuario.usuario === sesionAlEnviar?.usuario.usuario) {
    seguirPublicacion(resultado.commit, Date.now(), destino);
  }
  return resultado;
}

// ---- Publicación: "Publicando…" hasta que el sitio sirve ese commit, o 5 minutos.

function leerSeguimiento() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_PUBLICACION)); } catch { return null; }
}

function escribirSeguimiento(valor) {
  try {
    if (valor) sessionStorage.setItem(CLAVE_PUBLICACION, JSON.stringify(valor));
    else sessionStorage.removeItem(CLAVE_PUBLICACION);
  } catch { /* sin almacenamiento sólo se pierde el aviso al recargar */ }
}

const destinos = { abogados: '/#equipo', resenas: '/#opiniones' };
const enlaceAlSitio = () => destinos[location.hash.slice(2)] ?? '/';

function mostrarPublicacion(estado, texto, destino) {
  const aviso = $('publicacion');
  aviso.dataset.estado = estado;
  aviso.textContent = texto;
  if (destino) {
    const enlace = document.createElement('a');
    enlace.href = Object.values(destinos).includes(destino) ? destino : '/';
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = 'Ver el cambio';
    aviso.append(' ', enlace);
  }
  aviso.hidden = false;
}

let temporizador = null;
let revisionPublicacion = 0;

export function seguirPublicacion(commit, inicio = Date.now(), destino = enlaceAlSitio()) {
  clearTimeout(temporizador);
  const revision = ++revisionPublicacion;
  escribirSeguimiento({ commit, inicio, destino, usuario: sesion?.usuario.usuario });
  mostrarPublicacion('publicando', 'Cambios guardados. Publicando…');
  const revisar = async () => {
    let estado = null;
    try {
      ({ estado } = await api(`/api/publicacion?commit=${commit}`));
    } catch { /* un corte de red no decide: se sigue hasta los 5 minutos */ }
    if (revision !== revisionPublicacion) return;
    if (estado === 'publicado') {
      escribirSeguimiento(null);
      mostrarPublicacion('publicado', 'Cambios publicados.', destino);
    } else if (Date.now() - inicio >= CINCO_MINUTOS) {
      escribirSeguimiento(null);
      mostrarPublicacion('problema', 'Hubo un problema: el cambio quedó guardado, pero todavía no se ve en el sitio.');
    } else {
      temporizador = setTimeout(revisar, CADA_CUANTO);
    }
  };
  revisar();
}

// ---- Login

function mostrarLogin({ conservar = false } = {}) {
  const contenido = $('contenido');
  reingreso = conservar && sesion && contenido.firstElementChild ? {
    usuario: sesion.usuario.usuario,
    rol: sesion.usuario.rol,
    hash: location.hash,
    nodo: contenido.firstElementChild,
    foco: contenido.contains(document.activeElement) ? document.activeElement : null,
    etiqueta: contenido.getAttribute('aria-label'),
  } : null;
  sesion = null;
  clearTimeout(temporizador);
  revisionPublicacion += 1;
  $('menu').hidden = true;
  $('cuenta').hidden = true;
  $('menu-movil').hidden = true;
  abrirMenuMovil(false);
  document.body.classList.remove('sesion-activa');
  $('publicacion').hidden = true;
  contenido.removeAttribute('aria-label');
  contenido.replaceChildren($('plantilla-login').content.cloneNode(true));
  $('login').addEventListener('submit', enviarLogin);
  if (reingreso) {
    $('usuario').value = reingreso.usuario;
    $('login-error').textContent = 'Tu sesión venció. Volvé a entrar con esta cuenta para seguir donde estabas.';
    $('login-error').hidden = false;
  }
  $(reingreso ? 'contrasena' : 'usuario').focus();
}

async function enviarLogin(evento) {
  evento.preventDefault();
  const boton = evento.target.querySelector('button');
  const aviso = $('login-error');
  aviso.hidden = true;
  boton.disabled = true;
  try {
    sesion = await api('/api/login', {
      metodo: 'POST',
      cuerpo: { usuario: $('usuario').value, contrasena: $('contrasena').value },
    });
    entrar();
  } catch (e) {
    aviso.textContent = e.message;
    aviso.hidden = false;
    $('contrasena').value = '';
    boton.disabled = false;
  }
}

// ---- Pantallas

function pantallasVisibles() {
  return PANTALLAS.filter((p) => !p.soloAdmin || sesion.usuario.rol === 'admin');
}

function abrirMenuMovil(abierto) {
  const boton = $('menu-movil');
  boton.setAttribute('aria-expanded', String(abierto));
  boton.closest('.barra').classList.toggle('menu-abierto', abierto);
}

function mostrarPantalla() {
  if (!sesion || sesion.usuario.cambiarClave) return;
  const visibles = pantallasVisibles();
  const id = location.hash.slice(2);
  const pantalla = visibles.find((p) => p.id === id) || visibles[0];
  for (const enlace of $('menu').children) {
    if (enlace.dataset.id === pantalla.id) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
  document.title = `${pantalla.titulo} · Panel`;
  abrirMenuMovil(false);
  const contenedor = document.createElement('div');
  const contenido = $('contenido');
  contenido.setAttribute('aria-label', pantalla.titulo);
  contenido.replaceChildren(contenedor);
  pantalla.render(contenedor, { usuario: sesion.usuario, api, guardar, seguirPublicacion });
  contenido.focus();
}

function mostrarCambioClave() {
  reingreso = null;
  document.body.classList.remove('sesion-activa');
  abrirMenuMovil(false);
  $('menu').hidden = true;
  $('cuenta').hidden = true;
  $('menu-movil').hidden = true;
  $('publicacion').hidden = true;
  const contenido = $('contenido');
  contenido.removeAttribute('aria-label');
  contenido.replaceChildren($('plantilla-cambiar-clave').content.cloneNode(true));
  const form = contenido.querySelector('form');
  const nueva = $('clave-nueva');
  const confirmada = $('clave-confirmada');
  const aviso = form.querySelector('[role="alert"]');
  const boton = form.querySelector('[type="submit"]');
  form.querySelector('[data-salir]').addEventListener('click', salir);
  nueva.focus();
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    aviso.hidden = true;
    if (nueva.value !== confirmada.value) {
      aviso.textContent = 'Las contraseñas no coinciden.';
      aviso.hidden = false;
      confirmada.focus();
      return;
    }
    boton.disabled = true;
    try {
      const usuario = sesion.usuario.usuario;
      await api('/api/mi-contrasena', { metodo: 'POST', cuerpo: { contrasena: nueva.value } });
      mostrarLogin();
      $('usuario').value = usuario;
      $('contrasena').focus();
    } catch (error) {
      aviso.textContent = error.message;
      aviso.hidden = false;
      boton.disabled = false;
    }
  });
}

function entrar() {
  if (sesion.usuario.cambiarClave) {
    mostrarCambioClave();
    return;
  }
  document.body.classList.add('sesion-activa');
  $('menu-movil').hidden = false;
  $('cuenta-nombre').textContent = sesion.usuario.nombre;
  $('cuenta').hidden = false;
  const menu = $('menu');
  menu.replaceChildren(...pantallasVisibles().map((p) => {
    const enlace = document.createElement('a');
    enlace.href = `#/${p.id}`;
    enlace.textContent = p.titulo;
    enlace.dataset.id = p.id;
    return enlace;
  }));
  menu.hidden = false;
  if (reingreso && reingreso.usuario === sesion.usuario.usuario && reingreso.rol === sesion.usuario.rol &&
      reingreso.hash === location.hash) {
    const contenido = $('contenido');
    contenido.replaceChildren(reingreso.nodo);
    if (reingreso.etiqueta) contenido.setAttribute('aria-label', reingreso.etiqueta);
    const seleccionado = [...menu.children].find((enlace) => enlace.textContent === reingreso.etiqueta);
    seleccionado?.setAttribute('aria-current', 'page');
    (reingreso.foco && !reingreso.foco.disabled ? reingreso.foco : contenido).focus();
  } else {
    mostrarPantalla();
  }
  reingreso = null;
  const seguimiento = leerSeguimiento();
  if (seguimiento?.usuario === sesion.usuario.usuario) {
    seguirPublicacion(seguimiento.commit, seguimiento.inicio, seguimiento.destino);
  }
}

async function salir() {
  try {
    await api('/api/logout', { metodo: 'POST', cuerpo: {} });
  } finally {
    escribirSeguimiento(null);
    mostrarLogin();
  }
}

async function arrancar() {
  $('salir').addEventListener('click', salir);
  $('saltar-contenido').addEventListener('click', (evento) => {
    evento.preventDefault();
    $('contenido').focus();
  });
  const menuMovil = $('menu-movil');
  menuMovil.addEventListener('click', () => abrirMenuMovil(menuMovil.getAttribute('aria-expanded') !== 'true'));
  $('menu').addEventListener('click', (evento) => {
    if (evento.target.closest('[aria-current="page"]') && menuMovil.getAttribute('aria-expanded') === 'true') {
      abrirMenuMovil(false);
      $('contenido').focus();
    }
  });
  menuMovil.closest('.barra').addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && menuMovil.getAttribute('aria-expanded') === 'true' && menuMovil.getClientRects().length) {
      abrirMenuMovil(false);
      menuMovil.focus();
    }
  });
  window.addEventListener('hashchange', mostrarPantalla);
  try {
    sesion = await api('/api/sesion');
    entrar();
  } catch (e) {
    mostrarLogin();
    if (e.estado !== 401) {
      $('login-error').textContent = e.message;
      $('login-error').hidden = false;
    }
  }
}

arrancar();
