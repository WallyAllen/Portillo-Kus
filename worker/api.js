// Rutas /api/*. Para sumar una pantalla: una entrada en RUTAS. Las rutas con sesión ya
// tienen comprobados el origen y el CSRF cuando llega el pedido a su función.
import { cerrarSesion, cookieDeSesion, cookieVencida, csrfValido, iniciarSesion, leerSesion, origenValido } from './auth.js';
import { Conflicto, DatosInvalidos, guardarCambios, leerParaEditar, estadoPublicacion } from './guardado.js';
import { error, json } from './http.js';

const SHA = /^[0-9a-f]{40}$/;
const USUARIO = /^[a-z0-9._-]{1,40}$/;
const CUERPO_MAXIMO = 12 * 1024 * 1024;

async function login({ request, env }) {
  const datos = await request.json().catch(() => null);
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

async function archivo({ url, env }) {
  const ref = url.searchParams.get('ref');
  if (ref && !SHA.test(ref)) return error('Versión inválida.', 400);
  return json(await leerParaEditar(env, url.searchParams.get('ruta') || '', ref));
}

async function guardar({ request, env, sesion }) {
  const largo = Number(request.headers.get('Content-Length') || 0);
  if (largo > CUERPO_MAXIMO) return error('Los archivos son demasiado grandes.', 413);
  const datos = await request.json().catch(() => null);
  if (!datos || !SHA.test(datos.base || '') || !Array.isArray(datos.archivos)) return error('Pedido inválido.', 400);
  return json(await guardarCambios(env, { ...datos, autor: sesion.usuario }));
}

async function publicacion({ url, env }) {
  const commit = url.searchParams.get('commit') || '';
  if (!SHA.test(commit)) return error('Versión inválida.', 400);
  return json(await estadoPublicacion(env, commit, url.origin));
}

const RUTAS = {
  'POST /api/login': { fn: login, publica: true },
  'POST /api/logout': { fn: logout },
  'GET /api/sesion': { fn: sesionActual },
  'GET /api/archivo': { fn: archivo },
  'POST /api/guardar': { fn: guardar },
  'GET /api/publicacion': { fn: publicacion },
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
    }
    return await ruta.fn({ request, env, url, sesion });
  } catch (e) {
    if (e instanceof Conflicto) {
      return json({ error: e.message, conflicto: e.archivos }, 409);
    }
    if (e instanceof DatosInvalidos) return json({ error: e.message, errores: e.errores }, 422);
    console.error(`${request.method} ${url.pathname}:`, e?.message); // nunca el cuerpo: puede traer contraseñas
    return error('Hubo un problema. Probá de nuevo en un rato.', 500);
  }
}
