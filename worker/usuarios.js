// Usuarios del panel. Sólo para admin: lo comprueba api.js (soloAdmin) antes de llegar acá.
// La contraseña provisoria se genera acá, viaja una sola vez en la respuesta y no se registra.
import { hashContrasena } from './auth.js';

export const USUARIO_NUEVO = /^[a-z0-9._-]{3,40}$/;
const ROLES = ['admin', 'editor'];
// Sin letras que se confunden al dictarla o copiarla a mano (l, 1, o, 0, i).
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';

export class ErrorUsuario extends Error {
  constructor(mensaje, estado = 422) {
    super(mensaje);
    this.estado = estado;
  }
}

// 16 caracteres al azar de 31 posibles (unos 79 bits), en grupos de 4 para leerla.
export function contrasenaProvisoria() {
  const elegidos = [];
  while (elegidos.length < 16) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      // 248 = 31 × 8: descartar lo que sobra evita que unas letras salgan más que otras.
      if (byte < 248 && elegidos.length < 16) elegidos.push(LETRAS[byte % LETRAS.length]);
    }
  }
  return elegidos.join('').match(/.{4}/g).join('-');
}

export async function listarUsuarios(db) {
  const { results } = await db.prepare('SELECT usuario, nombre, rol, activo, creado FROM users ORDER BY nombre COLLATE NOCASE').all();
  return results.map((u) => ({ ...u, activo: u.activo === 1 }));
}

export async function crearUsuario(db, datos) {
  const usuario = String(datos?.usuario ?? '').trim().toLowerCase();
  const nombre = String(datos?.nombre ?? '').trim();
  const rol = datos?.rol;
  if (!USUARIO_NUEVO.test(usuario)) throw new ErrorUsuario('El usuario lleva de 3 a 40 letras minúsculas, números, punto, guion o guion bajo.');
  if (!nombre || nombre.length > 80) throw new ErrorUsuario('Escribí el nombre, de hasta 80 caracteres.');
  if (!ROLES.includes(rol)) throw new ErrorUsuario('Elegí si puede editar todo o sólo los textos en español.');
  const contrasena = contrasenaProvisoria();
  const resultado = await db.prepare(
    'INSERT INTO users (usuario, nombre, hash, rol, activo, creado) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT (usuario) DO NOTHING',
  ).bind(usuario, nombre, await hashContrasena(contrasena), rol, Date.now()).run();
  if (resultado.meta.changes === 0) throw new ErrorUsuario('Ya existe un usuario con ese nombre de usuario.', 409);
  return { usuario, contrasena };
}

// Desactivar cierra sus sesiones. La condición va en la misma sentencia, así dos admins que se
// desactivan a la vez no dejan el panel sin ninguno.
export async function cambiarActivo(db, datos) {
  const usuario = String(datos?.usuario ?? '');
  if (typeof datos?.activo !== 'boolean') throw new ErrorUsuario('Pedido inválido.', 400);
  if (datos.activo) {
    const r = await db.prepare('UPDATE users SET activo = 1 WHERE usuario = ?').bind(usuario).run();
    if (r.meta.changes === 0) throw new ErrorUsuario('Ese usuario no existe.', 404);
    return { usuario, activo: true };
  }
  const [r] = await db.batch([
    db.prepare(
      `UPDATE users SET activo = 0 WHERE usuario = ?1 AND (rol <> 'admin' OR activo = 0
         OR (SELECT COUNT(*) FROM users WHERE rol = 'admin' AND activo = 1 AND usuario <> ?1) > 0)`,
    ).bind(usuario),
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE usuario = ? AND activo = 0)').bind(usuario),
  ]);
  if (r.meta.changes === 0) {
    const existe = await db.prepare('SELECT 1 FROM users WHERE usuario = ?').bind(usuario).first();
    if (!existe) throw new ErrorUsuario('Ese usuario no existe.', 404);
    throw new ErrorUsuario('Es el último administrador activo: no se puede desactivar. Creá otro primero.');
  }
  return { usuario, activo: false };
}

// Una contraseña nueva cierra todas sus sesiones y borra sus intentos fallidos, para que pueda
// entrar enseguida con la provisoria.
export async function resetearContrasena(db, datos) {
  const usuario = String(datos?.usuario ?? '');
  const contrasena = contrasenaProvisoria();
  const [r] = await db.batch([
    db.prepare('UPDATE users SET hash = ? WHERE usuario = ?').bind(await hashContrasena(contrasena), usuario),
    db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE usuario = ?)').bind(usuario),
    db.prepare('DELETE FROM login_attempts WHERE usuario = ?').bind(usuario),
  ]);
  if (r.meta.changes === 0) throw new ErrorUsuario('Ese usuario no existe.', 404);
  return { usuario, contrasena };
}
