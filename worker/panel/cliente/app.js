// Armazón del panel: sesión, barra lateral, encabezado, pantallas y publicación.
// Una pantalla es { id, titulo, volanta?, bajada?, soloAdmin?, render(contenedor, ctx) }; ctx trae
// { usuario, api, guardar, seguirPublicacion, barra, previa, encabezado }. Para sumar una:
// importarla, agregarla a PANTALLAS y servirla en worker/panel/rutas.js.
import { iniciarGuia, iniciarRecorrido } from './ayuda.js';
import { avisarCambios, estadoPublicacion, hayCambios, iniciarBarra, ocupada, paraPantalla } from './barra.js';
import { iniciarHistorial, permitirHistorial } from './historial.js';
import { abrirPrevia, iniciarPrevia } from './previa.js';
import abogados from './pantallas/abogados.js';
import fotos from './pantallas/fotos.js';
import inicio from './pantallas/inicio.js';
import resenas from './pantallas/resenas.js';
import textos from './pantallas/textos.js';
import traducciones from './pantallas/traducciones.js';
import usuarios from './pantallas/usuarios.js';
import { SECCIONES, icono } from './pantallas/comun.js';

const PANTALLAS = [inicio, textos, fotos, resenas, abogados, traducciones, usuarios];
const ROLES = { admin: 'Administración', editor: 'Edición de textos' };

const CINCO_MINUTOS = 5 * 60 * 1000;
const CADA_CUANTO = 10 * 1000;
const CLAVE_PUBLICACION = 'panel-publicacion';

const $ = (id) => document.getElementById(id);
let sesion = null;
let reingreso = null; // promesa mientras el diálogo de reingreso está abierto

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
  if (respuesta.status === 401 && sesionAlEnviar && sesion === sesionAlEnviar) {
    pedirReingreso();
    throw new ErrorApi('Tu sesión venció. Volvé a entrar y probá de nuevo: lo que escribiste sigue acá.', 401, datos);
  }
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

const destinos = { abogados: '/#equipo', resenas: '/#opiniones', fotos: '/#areas' };
const enlaceAlSitio = () => destinos[location.hash.slice(2)] ?? '/';
const destinoSeguro = (destino) => (Object.values(destinos).includes(destino) ? destino : '/');

let temporizador = null;
let revisionPublicacion = 0;

export function seguirPublicacion(commit, inicio = Date.now(), destino = enlaceAlSitio()) {
  clearTimeout(temporizador);
  const revision = ++revisionPublicacion;
  escribirSeguimiento({ commit, inicio, destino, usuario: sesion?.usuario.usuario });
  estadoPublicacion('publicando', destinoSeguro(destino));
  const revisar = async () => {
    let estado = null;
    try {
      ({ estado } = await api(`/api/publicacion?commit=${commit}`));
    } catch { /* un corte de red no decide: se sigue hasta los 5 minutos */ }
    if (revision !== revisionPublicacion) return;
    if (estado === 'publicado') {
      escribirSeguimiento(null);
      estadoPublicacion('publicado', destinoSeguro(destino));
    } else if (Date.now() - inicio >= CINCO_MINUTOS) {
      escribirSeguimiento(null);
      estadoPublicacion('problema');
    } else {
      temporizador = setTimeout(revisar, CADA_CUANTO);
    }
  };
  revisar();
}

function frenarSeguimiento() {
  clearTimeout(temporizador);
  revisionPublicacion += 1;
  estadoPublicacion(null);
}

// ---- Encabezado de cada pantalla

function encabezado({ volanta = 'PANEL DEL ESTUDIO', titulo, bajada = '' }) {
  $('encabezado-volanta').textContent = volanta;
  $('encabezado-titulo').textContent = titulo;
  $('encabezado-bajada').textContent = bajada;
  $('encabezado-bajada').hidden = !bajada;
}

// ---- Login y reingreso

function mostrarLogin() {
  sesion = null;
  frenarSeguimiento();
  paraPantalla();
  document.body.classList.remove('sesion-activa');
  abrirMenuMovil(false);
  $('lateral-menu').hidden = true;
  $('menu-movil').hidden = true;
  $('encabezado-acciones').hidden = true;
  encabezado({ titulo: 'Entrar al panel', bajada: 'Ingresá con tu cuenta para editar el sitio de Portillo Kus & Asociados.' });
  document.title = 'Entrar · Panel';
  $('pantalla').replaceChildren($('plantilla-login').content.cloneNode(true));
  $('login').addEventListener('submit', enviarLogin);
  const mostrar = $('mostrar-clave');
  mostrar.addEventListener('click', () => {
    const visible = $('contrasena').type === 'password';
    $('contrasena').type = visible ? 'text' : 'password';
    mostrar.setAttribute('aria-pressed', String(visible));
    mostrar.textContent = visible ? 'Ocultar' : 'Mostrar';
  });
  $('usuario').focus();
}

async function enviarLogin(evento) {
  evento.preventDefault();
  const boton = evento.target.querySelector('[type="submit"]');
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

// La sesión venció con la pantalla abierta: se vuelve a entrar encima, sin perder el formulario.
function pedirReingreso() {
  if (reingreso || !sesion) return reingreso;
  const dialogo = $('reingreso');
  const foco = document.activeElement;
  const usuario = sesion.usuario;
  $('reingreso-usuario').value = usuario.usuario;
  $('reingreso-contrasena').value = '';
  $('reingreso-error').hidden = true;
  reingreso = new Promise((resolver) => {
    const enviar = async (evento) => {
      evento.preventDefault();
      const boton = evento.target.querySelector('[type="submit"]');
      boton.disabled = true;
      $('reingreso-error').hidden = true;
      try {
        const nueva = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: usuario.usuario, contrasena: $('reingreso-contrasena').value }),
        });
        const datos = await nueva.json().catch(() => null);
        if (!nueva.ok || !datos) throw new Error(datos?.error || 'No se pudo entrar. Probá de nuevo.');
        if (datos.usuario.usuario !== usuario.usuario || datos.usuario.rol !== usuario.rol || datos.usuario.cambiarClave) {
          location.reload(); // otra cuenta u otro permiso: mejor empezar de cero
          return;
        }
        sesion = datos;
        terminar();
        (foco?.isConnected ? foco : $('encabezado-titulo')).focus();
      } catch (e) {
        $('reingreso-error').textContent = e.message;
        $('reingreso-error').hidden = false;
        $('reingreso-contrasena').value = '';
        $('reingreso-contrasena').focus();
      } finally {
        boton.disabled = false;
      }
    };
    const noCerrar = (evento) => evento.preventDefault(); // Escape no la saltea: hay "Salir del panel"
    const irse = () => {
      terminar();
      salir();
    };
    function terminar() {
      $('reingreso-form').removeEventListener('submit', enviar);
      dialogo.removeEventListener('cancel', noCerrar);
      $('reingreso-salir').removeEventListener('click', irse);
      dialogo.close();
      reingreso = null;
      resolver();
    }
    $('reingreso-form').addEventListener('submit', enviar);
    dialogo.addEventListener('cancel', noCerrar);
    $('reingreso-salir').addEventListener('click', irse);
  });
  for (const abierto of document.querySelectorAll('dialog[open]')) if (abierto !== dialogo) abierto.close();
  dialogo.showModal();
  $('reingreso-contrasena').focus();
  return reingreso;
}

// ---- Pantallas

function pantallasVisibles() {
  return PANTALLAS.filter((p) => !p.soloAdmin || sesion.usuario.rol === 'admin');
}

function abrirMenuMovil(abierto) {
  const boton = $('menu-movil');
  boton.setAttribute('aria-expanded', String(abierto));
  document.body.classList.toggle('menu-abierto', abierto);
}

async function mostrarPantalla() {
  if (!sesion || sesion.usuario.cambiarClave) return;
  const visibles = pantallasVisibles();
  const id = location.hash.slice(2);
  const pantalla = visibles.find((p) => p.id === id) || visibles[0];
  for (const enlace of $('menu').querySelectorAll('a')) {
    if (enlace.dataset.id === pantalla.id) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  }
  document.title = `${pantalla.titulo} · Panel`;
  abrirMenuMovil(false);
  // Lo que se abrió en la pantalla anterior no sigue encima de la nueva. El reingreso sí.
  for (const dialogo of document.querySelectorAll('dialog[open]')) if (dialogo.id !== 'reingreso') dialogo.close();
  const propio = { volanta: pantalla.volanta, titulo: pantalla.encabezado ?? pantalla.titulo, bajada: pantalla.bajada };
  encabezado(propio);
  const contenedor = document.createElement('div');
  $('pantalla').replaceChildren(contenedor);
  const barra = paraPantalla();
  $('encabezado-titulo').focus();
  window.scrollTo(0, 0);
  await pantalla.render(contenedor, {
    usuario: sesion.usuario,
    api,
    guardar,
    seguirPublicacion,
    barra,
    previa: abrirPrevia,
    pantallas: visibles,
    // Sin argumentos vuelve al encabezado de la pantalla.
    encabezado: (titulo, bajada) => encabezado(titulo ? { ...propio, titulo, bajada } : propio),
  });
  if (contenedor.isConnected && !$('pie').hidden) iniciarRecorrido();
}

function mostrarCambioClave() {
  document.body.classList.remove('sesion-activa');
  abrirMenuMovil(false);
  $('lateral-menu').hidden = true;
  $('menu-movil').hidden = true;
  $('encabezado-acciones').hidden = true;
  paraPantalla();
  frenarSeguimiento();
  encabezado({ volanta: 'PRIMER INGRESO', titulo: 'Elegí tu contraseña' });
  const pantalla = $('pantalla');
  pantalla.replaceChildren($('plantilla-cambiar-clave').content.cloneNode(true));
  const form = pantalla.querySelector('form');
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
  const { nombre, rol } = sesion.usuario;
  document.body.classList.add('sesion-activa');
  $('menu-movil').hidden = false;
  $('cuenta-nombre').textContent = nombre;
  $('cuenta-rol').textContent = ROLES[rol] ?? rol;
  $('cuenta-inicial').textContent = [...nombre.trim()][0]?.toUpperCase() ?? '·';
  $('lateral-menu').hidden = false;
  $('encabezado-acciones').hidden = false;
  $('menu').replaceChildren(...pantallasVisibles().map((p) => {
    const enlace = document.createElement('a');
    enlace.href = `#/${p.id}`;
    enlace.dataset.id = p.id;
    const textos = document.createElement('span');
    const titulo = document.createElement('strong');
    titulo.textContent = p.titulo;
    textos.append(titulo);
    if (SECCIONES[p.id]?.resumen) {
      const resumen = document.createElement('small');
      resumen.textContent = SECCIONES[p.id].resumen;
      textos.append(resumen);
    }
    enlace.append(icono(p.id), textos);
    return enlace;
  }));
  mostrarPantalla();
  const seguimiento = leerSeguimiento();
  if (seguimiento?.usuario === sesion.usuario.usuario) {
    seguirPublicacion(seguimiento.commit, seguimiento.inicio, seguimiento.destino);
  }
}

async function salir() {
  try {
    await api('/api/logout', { metodo: 'POST', cuerpo: {} });
  } catch { /* la sesión ya podía estar vencida */ } finally {
    escribirSeguimiento(null);
    mostrarLogin();
  }
}

async function arrancar() {
  iniciarBarra();
  iniciarGuia();
  iniciarPrevia();
  iniciarHistorial({
    api,
    // Volver atrás publica: se sigue como cualquier guardado y se vuelve a leer la pantalla.
    alRestaurar: (commit) => {
      seguirPublicacion(commit, Date.now(), '/');
      mostrarPantalla();
    },
  });
  avisarCambios((n) => permitirHistorial(!n && !ocupada()));
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
      $('encabezado-titulo').focus();
    }
  });
  document.querySelector('.lateral').addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && menuMovil.getAttribute('aria-expanded') === 'true' && menuMovil.getClientRects().length) {
      abrirMenuMovil(false);
      menuMovil.focus();
    }
  });
  // Las fotos elegidas y lo que se edita de un abogado no quedan como borrador.
  addEventListener('beforeunload', (evento) => {
    if (sesion && hayCambios() && /^#\/(fotos|abogados)/.test(location.hash)) evento.preventDefault();
  });
  addEventListener('hashchange', () => {
    $('aviso-panel').textContent = '';
    mostrarPantalla();
  });
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
