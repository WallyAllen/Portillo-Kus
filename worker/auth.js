// Contraseñas, sesiones, bloqueo por intentos y CSRF. Sólo usa Web Crypto y D1.
// scripts/crear-admin.mjs importa hashContrasena: el hash se calcula igual en Node.

export const ITERACIONES = 210000;
// workerd declara este tope para PBKDF2 (DEFAULT_MAX_PBKDF2_ITERATIONS) y `wrangler dev`
// no lo aplica: una sola llamada con 210000 pasa en local y puede fallar en producción.
// Por eso se encadenan tramos que suman ITERACIONES; hasta el tope es PBKDF2 estándar.
const TRAMO_MAXIMO = 100000;

const SESION_MS = 7 * 24 * 60 * 60 * 1000;
const VENTANA_MS = 15 * 60 * 1000;
const MAX_POR_USUARIO = 5;
// Evita probar muchos usuarios desde una IP. Más alto: una oficina comparte IP.
const MAX_POR_IP = 20;
const COOKIE = '__Host-panel_sesion';

const bytes = (texto) => new TextEncoder().encode(texto);
const aBase64 = (datos) => btoa(String.fromCharCode(...datos));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
const aHex = (datos) => [...datos].map((b) => b.toString(16).padStart(2, '0')).join('');
const azar = (largo) => crypto.getRandomValues(new Uint8Array(largo));

function igualesEnTiempoConstante(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

async function derivar(contrasena, sal, iteraciones) {
  let clave = bytes(contrasena);
  for (let restantes = iteraciones; restantes > 0; restantes -= TRAMO_MAXIMO) {
    const material = await crypto.subtle.importKey('raw', clave, 'PBKDF2', false, ['deriveBits']);
    clave = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: Math.min(restantes, TRAMO_MAXIMO) }, material, 256));
  }
  return clave;
}

// Las iteraciones van en el hash: cambiar ITERACIONES no invalida los usuarios existentes.
export async function hashContrasena(contrasena, iteraciones = ITERACIONES) {
  const sal = azar(16);
  return `pbkdf2-sha256$${iteraciones}$${aBase64(sal)}$${aBase64(await derivar(contrasena, sal, iteraciones))}`;
}

export async function verificarContrasena(contrasena, hash) {
  const [algoritmo, iteraciones, sal, esperado] = hash.split('$');
  if (algoritmo !== 'pbkdf2-sha256' || !(Number(iteraciones) > 0)) return false;
  return igualesEnTiempoConstante(await derivar(contrasena, deBase64(sal), Number(iteraciones)), deBase64(esperado));
}

// Para un usuario inexistente se hace el mismo cálculo: el tiempo de respuesta no lo delata.
const HASH_SENUELO = `pbkdf2-sha256$${ITERACIONES}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

const hashToken = async (token) => aHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(token))));

export const cookieDeSesion = (token) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESION_MS / 1000}`;
export const cookieVencida = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function tokenDeCookie(request) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const [nombre, valor] = parte.trim().split('=');
    if (nombre === COOKIE) return valor;
  }
  return null;
}

// Devuelve { estado: 'ok', usuario, token, csrf } | { estado: 'bloqueado' } | { estado: 'incorrecto' }.
export async function iniciarSesion(db, usuario, contrasena, ip) {
  const ahora = Date.now();
  const desde = ahora - VENTANA_MS;
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE creado < ?').bind(desde),
    db.prepare('DELETE FROM sessions WHERE expira < ?').bind(ahora),
  ]);
  // Contar e insertar en una sola sentencia: ni con pedidos en paralelo pasan más de 5.
  // Va antes de calcular el hash: un usuario bloqueado no gasta CPU.
  const intento = await db.prepare(
    `INSERT INTO login_attempts (usuario, ip, creado) SELECT ?1, ?2, ?3
     WHERE (SELECT COUNT(*) FROM login_attempts WHERE usuario = ?1 AND creado >= ?4) < ?5
       AND (SELECT COUNT(*) FROM login_attempts WHERE ip = ?2 AND creado >= ?4) < ?6`,
  ).bind(usuario, ip, ahora, desde, MAX_POR_USUARIO, MAX_POR_IP).run();
  if (intento.meta.changes === 0) return { estado: 'bloqueado' };

  const fila = await db.prepare(
    'SELECT id, usuario, nombre, hash, rol, activo FROM users WHERE usuario = ?',
  ).bind(usuario).first();
  const coincide = await verificarContrasena(contrasena, fila ? fila.hash : HASH_SENUELO);
  if (!fila || !coincide || fila.activo !== 1) return { estado: 'incorrecto' };

  const token = aBase64(azar(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const csrf = aHex(azar(32));
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE usuario = ?').bind(usuario),
    db.prepare('INSERT INTO sessions (token_hash, user_id, csrf, expira, creado) VALUES (?, ?, ?, ?, ?)')
      .bind(await hashToken(token), fila.id, csrf, ahora + SESION_MS, ahora),
  ]);
  return { estado: 'ok', token, csrf, usuario: { usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol } };
}

// Un usuario desactivado pierde el acceso en el pedido siguiente, aunque tenga sesión abierta.
export async function leerSesion(db, request) {
  const token = tokenDeCookie(request);
  if (!token) return null;
  const fila = await db.prepare(
    `SELECT s.csrf, u.usuario, u.nombre, u.rol FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expira > ? AND u.activo = 1`,
  ).bind(await hashToken(token), Date.now()).first();
  return fila && { csrf: fila.csrf, usuario: { usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol } };
}

export async function cerrarSesion(db, request) {
  const token = tokenDeCookie(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
}

// Primera defensa contra CSRF, también para el login: el pedido viene de este mismo sitio.
export function origenValido(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

// Segunda defensa, con sesión: el token que sólo conoce la página del panel.
export function csrfValido(request, sesion) {
  return igualesEnTiempoConstante(bytes(request.headers.get('X-CSRF-Token') || ''), bytes(sesion.csrf));
}
