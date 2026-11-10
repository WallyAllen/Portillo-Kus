// Rutas /api/*. Para sumar una pantalla: una entrada en RUTAS. Las rutas con sesión ya
// tienen comprobados el origen y el CSRF cuando llega el pedido a su función.
import { cerrarSesion, cookieDeSesion, cookieVencida, csrfValido, iniciarSesion, leerSesion, origenValido } from './auth.js';
import {
  Conflicto, DatosInvalidos, estadoPublicacion, guardarCambios, guardarTraducciones, leerParaEditar, listarTraducciones, Prohibido,
} from './guardado.js';
import { definicion } from './campos.js';
import { error, json } from './http.js';
import reglas from './reglas.json' with { type: 'json' };
import { cambiarActivo, crearUsuario, elegirContrasena, ErrorUsuario, listarUsuarios, resetearContrasena } from './usuarios.js';

const SHA = /^[0-9a-f]{40}$/;
const USUARIO = /^[a-z0-9._-]{1,40}$/;
const CUERPO_MAXIMO = 12 * 1024 * 1024;
const CUERPO_CHICO = 16 * 1024;

async function leerJson(request, maximo) {
  if (Number(request.headers.get('Content-Length')) > maximo) {
    throw new ErrorUsuario('El pedido es demasiado grande.', 413);
  }
  if (!request.body) return null;
  const lector = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let texto = '';
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximo) {
        await lector.cancel().catch(() => {});
        throw new ErrorUsuario('El pedido es demasiado grande.', 413);
      }
      texto += decoder.decode(value, { stream: true });
    }
    return JSON.parse(texto + decoder.decode());
  } catch (e) {
    if (e instanceof ErrorUsuario) throw e;
    return null;
  } finally {
    lector.releaseLock();
  }
}

async function login({ request, env }) {
  const datos = await leerJson(request, CUERPO_CHICO);
  const usuario = String(datos?.usuario ?? '').trim().toLowerCase();
  const contrasena = datos?.contrasena;
  if (!USUARIO.test(usuario) || typeof contrasena !== 'string' || !contrasena || contrasena.length > 200) {
    return error('Completá usuario y contraseña.', 400);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'desconocida';
  const resultado = await iniciarSesion(env.DB, usuario, contrasena, ip);
  if (resultado.estado === 'bloqueado') {
    return error('Demasiados intentos. Probá de nuevo en 15 minutos.', 429, { 'Retry-After': '900' });
  }
  if (resultado.estado !== 'ok') return error('Usuario o contraseña incorrectos.', 401);
  return json({ usuario: resultado.usuario, csrf: resultado.csrf }, 200, { 'Set-Cookie': cookieDeSesion(resultado.token) });
}

async function logout({ request, env }) {
  await cerrarSesion(env.DB, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieVencida() });
}

const sesionActual = ({ sesion }) => json({ usuario: sesion.usuario, csrf: sesion.csrf });

async function archivo({ url, env, sesion }) {
  const ref = url.searchParams.get('ref');
  if (ref && !SHA.test(ref)) return error('Versión inválida.', 400);
  return json(await leerParaEditar(env, url.searchParams.get('ruta') || '', ref, sesion.usuario.rol));
}

// Lo que necesita una pantalla para armar sus campos.
const campos = () => json({ ...definicion, idiomas: reglas.idiomasTodos, pendiente: reglas.pendiente });

const traducciones = async ({ env }) => json(await listarTraducciones(env));

async function guardarTraduccion({ request, env, sesion }) {
  const datos = await leerJson(request, CUERPO_MAXIMO);
  if (!datos || !SHA.test(datos.base || '')) return error('Pedido inválido.', 400);
  return json(await guardarTraducciones(env, { base: datos.base, textos: datos.textos, autor: sesion.usuario }));
}

async function guardar({ request, env, sesion }) {
  const datos = await leerJson(request, CUERPO_MAXIMO);
  if (!datos || !SHA.test(datos.base || '') || !Array.isArray(datos.archivos)) return error('Pedido inválido.', 400);
  // Campo por campo: comprobar y confirmados no pueden venir del pedido.
  const { base, archivos, descripcion } = datos;
  return json(await guardarCambios(env, { base, archivos, descripcion, autor: sesion.usuario }));
}

async function publicacion({ url, env }) {
  const commit = url.searchParams.get('commit') || '';
  if (!SHA.test(commit)) return error('Versión inválida.', 400);
  return json(await estadoPublicacion(env, commit, url.origin));
}

const usuarios = async ({ env }) => json({ usuarios: await listarUsuarios(env.DB) });
const conDatos = (fn) => async ({ request, env }) => json(await fn(env.DB, await leerJson(request, CUERPO_CHICO)));

async function cambiarClave({ request, env, sesion }) {
  await elegirContrasena(env.DB, sesion, await leerJson(request, CUERPO_CHICO));
  return json({ ok: true }, 200, { 'Set-Cookie': cookieVencida() });
}

const RUTAS = {
  'POST /api/login': { fn: login, publica: true },
  'POST /api/logout': { fn: logout, clavePendiente: true },
  'GET /api/sesion': { fn: sesionActual, clavePendiente: true },
  'POST /api/mi-contrasena': { fn: cambiarClave, clavePendiente: true },
  'GET /api/archivo': { fn: archivo },
  'POST /api/guardar': { fn: guardar },
  'GET /api/publicacion': { fn: publicacion },
  'GET /api/campos': { fn: campos },
  'GET /api/traducciones': { fn: traducciones, soloAdmin: true },
  'POST /api/traducciones': { fn: guardarTraduccion, soloAdmin: true },
  'GET /api/usuarios': { fn: usuarios, soloAdmin: true },
  'POST /api/usuarios': { fn: conDatos(crearUsuario), soloAdmin: true },
  'POST /api/usuarios/activo': { fn: conDatos(cambiarActivo), soloAdmin: true },
  'POST /api/usuarios/contrasena': { fn: conDatos(resetearContrasena), soloAdmin: true },
};

export async function manejarApi(request, env) {
  const url = new URL(request.url);
  const ruta = RUTAS[`${request.method} ${url.pathname}`];
  if (!ruta) return error('No existe.', 404);
  if (!env.DB) return error('El panel todavía no está configurado.', 503);

  const escribe = request.method !== 'GET';
  if (escribe && !origenValido(request)) return error('Pedido rechazado.', 403);
  if (escribe && !(request.headers.get('Content-Type') || '').startsWith('application/json')) {
    return error('Pedido rechazado.', 415);
  }
  try {
    let sesion = null;
    if (!ruta.publica) {
      sesion = await leerSesion(env.DB, request);
      if (!sesion) return error('Tenés que iniciar sesión.', 401);
      if (escribe && !csrfValido(request, sesion)) return error('Pedido rechazado.', 403);
      if (sesion.usuario.cambiarClave && !ruta.clavePendiente) return error('Cambiá la contraseña provisoria para continuar.', 403);
      if (ruta.soloAdmin && sesion.usuario.rol !== 'admin') return error(new Prohibido().message, 403);
    }
    return await ruta.fn({ request, env, url, sesion });
  } catch (e) {
    if (e instanceof Conflicto) {
      return json({ error: e.message, conflicto: e.archivos }, 409);
    }
    if (e instanceof DatosInvalidos) return json({ error: e.message, errores: e.errores }, 422);
    if (e instanceof Prohibido) return error(e.message, 403);
    if (e instanceof ErrorUsuario) return error(e.message, e.estado);
    console.error(`${request.method} ${url.pathname}:`, e?.message); // nunca el cuerpo: puede traer contraseñas
    return error('Hubo un problema. Probá de nuevo en un rato.', 500);
  }
}
