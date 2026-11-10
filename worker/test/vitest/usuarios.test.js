// Pantalla de usuarios: crear, desactivar, reactivar y contraseña nueva, sólo para admin.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { contrasenaProvisoria } from '../../usuarios.js';
import { como, crearUsuario, entrar, pedir } from './ayuda.js';

let admin;
beforeAll(async () => {
  await crearUsuario('jefa', 'admin');
  admin = como(await entrar('jefa'));
});

const crear = (cuerpo) => admin('/api/usuarios', { metodo: 'POST', cuerpo });
const sesionesDe = async (usuario) => (await env.DB.prepare(
  'SELECT COUNT(*) AS n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.usuario = ?',
).bind(usuario).first()).n;

describe('contraseña provisoria', () => {
  it('16 caracteres sin letras confusas, en grupos de 4, distinta cada vez', () => {
    const vistas = new Set(Array.from({ length: 50 }, contrasenaProvisoria));
    expect(vistas.size).toBe(50);
    for (const c of vistas) expect(c).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
  });

  it('sólo habilita edición después del cambio y revoca las sesiones provisorias', async () => {
    const { usuario, contrasena } = await (await crear({
      usuario: 'clave.temporal', nombre: 'Clave temporal', rol: 'editor',
    })).json();
    const primera = como(await entrar(usuario, contrasena));
    const segunda = como(await entrar(usuario, contrasena));
    expect((await (await primera('/api/sesion')).json()).usuario.cambiarClave).toBe(true);
    expect((await primera('/api/campos')).status).toBe(403);
    const cambiar = (contrasena) => primera('/api/mi-contrasena', { metodo: 'POST', cuerpo: { contrasena } });
    expect((await cambiar(contrasena)).status).toBe(422);
    const nueva = 'otra-clave-larga-para-prueba';
    expect((await cambiar(nueva)).status).toBe(200);
    expect((await segunda('/api/sesion')).status).toBe(401);
    await expect(entrar(usuario, contrasena)).rejects.toThrow(/401/);
    expect((await como(await entrar(usuario, nueva))('/api/campos')).status).toBe(200);
  });
});

describe('crear', () => {
  it('genera la contraseña en el servidor, la devuelve una vez y sirve para entrar', async () => {
    const r = await crear({ usuario: 'Nueva.Persona', nombre: '  Nueva Persona ', rol: 'editor' });
    expect(r.status).toBe(200);
    const { usuario, contrasena } = await r.json();
    expect(usuario).toBe('nueva.persona');
    const fila = await env.DB.prepare("SELECT nombre, rol, activo, hash FROM users WHERE usuario = 'nueva.persona'").first();
    expect(fila).toMatchObject({ nombre: 'Nueva Persona', rol: 'editor', activo: 1 });
    expect(fila.hash).toMatch(/^pbkdf2-sha256\$210000\$/);
    expect(fila.hash).not.toContain(contrasena);
    await expect(entrar('nueva.persona', contrasena)).resolves.toBeTruthy();
    const lista = await (await admin('/api/usuarios')).json();
    expect(JSON.stringify(lista)).not.toMatch(/hash|pbkdf2/);
  });

  it('la contraseña no queda en los registros', async () => {
    const registros = [];
    const espias = ['log', 'info', 'warn', 'error'].map((m) => vi.spyOn(console, m).mockImplementation((...a) => registros.push(a.join(' '))));
    try {
      const { contrasena } = await (await crear({ usuario: 'sin.rastro', nombre: 'Sin rastro', rol: 'editor' })).json();
      await crear({ usuario: 'sin.rastro', nombre: 'Repetido', rol: 'editor' });
      expect(registros.join('\n')).not.toContain(contrasena);
    } finally {
      espias.forEach((e) => e.mockRestore());
    }
  });

  it('datos inválidos, rol inventado o usuario repetido: no se crea', async () => {
    expect((await crear({ usuario: 'ab', nombre: 'Corto', rol: 'editor' })).status).toBe(422);
    expect((await crear({ usuario: 'con espacio', nombre: 'X', rol: 'editor' })).status).toBe(422);
    expect((await crear({ usuario: 'sin.nombre', nombre: ' ', rol: 'editor' })).status).toBe(422);
    expect((await crear({ usuario: 'superusuario', nombre: 'X', rol: 'root' })).status).toBe(422);
    expect((await crear({ usuario: 'jefa', nombre: 'Otra', rol: 'admin' })).status).toBe(409);
  });
});

describe('desactivar y reactivar', () => {
  it('desactivar cierra sus sesiones abiertas y no la deja entrar', async () => {
    await crearUsuario('saliente', 'editor');
    const suya = como(await entrar('saliente'));
    expect(await sesionesDe('saliente')).toBe(1);
    expect((await admin('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'saliente', activo: false } })).status).toBe(200);
    expect(await sesionesDe('saliente')).toBe(0);
    expect((await suya('/api/sesion')).status).toBe(401);
    await expect(entrar('saliente')).rejects.toThrow(/401/);
    expect((await admin('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'saliente', activo: true } })).status).toBe(200);
    await expect(entrar('saliente')).resolves.toBeTruthy();
  });

  it('el último admin activo no se puede desactivar; con otro, sí', async () => {
    await env.DB.prepare("UPDATE users SET activo = 0 WHERE rol = 'admin' AND usuario <> 'jefa'").run();
    const r = await admin('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'jefa', activo: false } });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/último administrador/);
    expect((await admin('/api/sesion')).status).toBe(200);

    await crearUsuario('segunda', 'admin');
    const segunda = como(await entrar('segunda'));
    expect((await segunda('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'jefa', activo: false } })).status).toBe(200);
    expect((await admin('/api/sesion')).status).toBe(401);
    expect((await segunda('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'segunda', activo: false } })).status).toBe(422);
    expect((await segunda('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'jefa', activo: true } })).status).toBe(200);
    admin = como(await entrar('jefa'));
  });

  it('dos admins que se desactivan entre sí a la vez dejan al menos uno', async () => {
    await env.DB.prepare("UPDATE users SET activo = 0 WHERE rol = 'admin' AND usuario NOT IN ('jefa')").run();
    await crearUsuario('tercera', 'admin');
    const tercera = como(await entrar('tercera'));
    await Promise.all([
      admin('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'tercera', activo: false } }),
      tercera('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'jefa', activo: false } }),
    ]);
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE rol = 'admin' AND activo = 1").first();
    expect(n).toBeGreaterThanOrEqual(1);
    await env.DB.prepare("UPDATE users SET activo = 1 WHERE usuario = 'jefa'").run();
    admin = como(await entrar('jefa'));
  });

  it('un usuario que no existe: 404', async () => {
    expect((await admin('/api/usuarios/activo', { metodo: 'POST', cuerpo: { usuario: 'nadie', activo: false } })).status).toBe(404);
  });
});

describe('contraseña nueva', () => {
  it('la vieja deja de servir, se cierran sus sesiones y se borran sus intentos fallidos', async () => {
    await crearUsuario('olvidadiza', 'editor');
    const suya = como(await entrar('olvidadiza'));
    for (let i = 0; i < 5; i++) await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'olvidadiza', contrasena: 'mal-mal-mal-mal' } });
    const r = await admin('/api/usuarios/contrasena', { metodo: 'POST', cuerpo: { usuario: 'olvidadiza' } });
    expect(r.status).toBe(200);
    const { contrasena } = await r.json();
    expect((await suya('/api/sesion')).status).toBe(401);
    await expect(entrar('olvidadiza')).rejects.toThrow(/401/);
    await expect(entrar('olvidadiza', contrasena)).resolves.toBeTruthy();
  });

  it('un usuario que no existe: 404', async () => {
    expect((await admin('/api/usuarios/contrasena', { metodo: 'POST', cuerpo: { usuario: 'nadie' } })).status).toBe(404);
  });
});
