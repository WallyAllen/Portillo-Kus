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

export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) {
    super(mensaje);
    this.estado = estado;
    this.datos = datos; // 409: datos.conflicto (archivos); 422: datos.errores (textos)
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
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
  if (respuesta.status === 401 && sesion) mostrarLogin();
  throw new ErrorApi(datos?.error || 'Hubo un problema. Probá de nuevo en un rato.', respuesta.status, datos);
}

// { base, descripcion, archivos: [{ ruta, texto } | { ruta, base64 }] }. base es el commit que
// devolvió /api/archivo al leer. Si otra persona tocó lo mismo, lanza ErrorApi con estado 409.
export async function guardar(cambios) {
  const resultado = await api('/api/guardar', { metodo: 'POST', cuerpo: cambios });
  seguirPublicacion(resultado.commit);
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

function mostrarPublicacion(estado, texto) {
  const aviso = $('publicacion');
  aviso.dataset.estado = estado;
  aviso.textContent = texto;
  aviso.hidden = false;
}

let temporizador = null;

export function seguirPublicacion(commit, inicio = Date.now()) {
  clearTimeout(temporizador);
  escribirSeguimiento({ commit, inicio });
  mostrarPublicacion('publicando', 'Publicando…');
  const revisar = async () => {
    let estado = null;
    try {
      ({ estado } = await api(`/api/publicacion?commit=${commit}`));
    } catch { /* un corte de red no decide: se sigue hasta los 5 minutos */ }
    if (estado === 'publicado') {
      escribirSeguimiento(null);
      mostrarPublicacion('publicado', 'Publicado');
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

function mostrarLogin() {
  sesion = null;
  clearTimeout(temporizador);
  $('menu').hidden = true;
  $('cuenta').hidden = true;
  $('publicacion').hidden = true;
  const contenido = $('contenido');
  contenido.replaceChildren($('plantilla-login').content.cloneNode(true));
  $('login').addEventListener('submit', enviarLogin);
  $('usuario').focus();
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

function mostrarPantalla() {
  if (!sesion) return;
  const visibles = pantallasVisibles();
  const id = location.hash.slice(2);
  const pantalla = visibles.find((p) => p.id === id) || visibles[0];
  for (const enlace of $('menu').children) {
    if (enlace.dataset.id === pantalla.id) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
  document.title = `${pantalla.titulo} · Panel`;
  const contenedor = document.createElement('div');
  $('contenido').replaceChildren(contenedor);
  pantalla.render(contenedor, { usuario: sesion.usuario, api, guardar, seguirPublicacion });
}

function entrar() {
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
  mostrarPantalla();
  const seguimiento = leerSeguimiento();
  if (seguimiento) seguirPublicacion(seguimiento.commit, seguimiento.inicio);
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
