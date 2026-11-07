// Pedidos al Worker entero (worker/index.js) como los haría el navegador del panel.
import { env, exports } from 'cloudflare:workers';
import { hashContrasena } from '../../auth.js';

export const ORIGEN = 'https://panel.prueba';
export const CONTRASENA = 'contrasena-solo-de-prueba';
let ip = 0;

export async function crearUsuario(usuario, rol = 'admin', { activo = 1 } = {}) {
  await env.DB.prepare('INSERT INTO users (usuario, nombre, hash, rol, activo, creado) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(usuario, `Persona ${usuario}`, await hashContrasena(CONTRASENA), rol, activo, Date.now()).run();
}

export function pedir(ruta, { metodo = 'GET', cuerpo, cookie, csrf, origen = ORIGEN, tipo = 'application/json', ipCliente } = {}) {
  const encabezados = { 'CF-Connecting-IP': ipCliente ?? `10.0.0.${++ip % 250}` };
  if (metodo !== 'GET') {
    if (origen) encabezados.Origin = origen;
    if (tipo) encabezados['Content-Type'] = tipo;
  }
  if (cookie) encabezados.Cookie = cookie;
  if (csrf) encabezados['X-CSRF-Token'] = csrf;
  return exports.default.fetch(new Request(`${ORIGEN}${ruta}`, {
    method: metodo, headers: encabezados, body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  }));
}

// Devuelve { cookie, csrf } o lanza si el login falla.
export async function entrar(usuario, contrasena = CONTRASENA) {
  const r = await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario, contrasena } });
  if (r.status !== 200) throw new Error(`login de ${usuario}: ${r.status}`);
  const { csrf } = await r.json();
  return { cookie: r.headers.get('Set-Cookie').split(';')[0], csrf };
}

export const como = (sesion) => (ruta, opciones = {}) => pedir(ruta, { ...sesion, ...opciones });
