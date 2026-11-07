// Login, sesión, CSRF, permisos y validación, contra el Worker en workerd.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, CONTRASENA, crearUsuario, entrar, pedir } from './ayuda.js';

beforeAll(async () => {
  await crearUsuario('admin1', 'admin');
  await crearUsuario('editor1', 'editor');
  await crearUsuario('baja1', 'editor', { activo: 0 });
});

describe('login', () => {
  it('entra con la contraseña correcta: cookie __Host-, HttpOnly, Secure, SameSite=Strict', async () => {
    const r = await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'Admin1 ', contrasena: CONTRASENA } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toMatch(/^__Host-panel_sesion=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
    const datos = await r.json();
    expect(datos.usuario).toEqual({ usuario: 'admin1', nombre: 'Persona admin1', rol: 'admin' });
    expect(datos.csrf).toMatch(/^[0-9a-f]{64}$/);
  });

  // El tope de 100000 iteraciones por llamada de producción no rige acá (tampoco en `wrangler
  // dev`): lo cubre auth.test.mjs simulándolo, y docs/panel.md lo pone en las comprobaciones reales.
  it('un hash creado afuera, con 210000 iteraciones, verifica en workerd', async () => {
    await expect(entrar('admin1')).resolves.toBeTruthy();
  });

  it('el panel se sirve como texto, con su CSP', async () => {
    const r = await pedir('/panel/pantallas/usuarios.js');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(await r.text()).toContain("id: 'usuarios'");
  });

  it('contraseña incorrecta, usuario inexistente y usuario desactivado responden igual', async () => {
    const respuestas = await Promise.all([
      pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'admin1', contrasena: 'otra-cosa-larga' } }),
      pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'nadie', contrasena: 'otra-cosa-larga' } }),
      pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'baja1', contrasena: CONTRASENA } }),
    ]);
    for (const r of respuestas) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ error: 'Usuario o contraseña incorrectos.' });
    }
  });

  it('pedido incompleto: 400', async () => {
    expect((await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'admin1' } })).status).toBe(400);
  });

  it('tras 5 fallos queda bloqueado aunque después acierte', async () => {
    await crearUsuario('bloqueo1', 'editor');
    for (let i = 0; i < 5; i++) {
      expect((await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'bloqueo1', contrasena: 'mal-mal-mal-mal' } })).status).toBe(401);
    }
    const r = await pedir('/api/login', { metodo: 'POST', cuerpo: { usuario: 'bloqueo1', contrasena: CONTRASENA } });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('900');
  });

  it('20 fallos desde una IP la bloquean para cualquier usuario', async () => {
    for (let i = 0; i < 20; i++) {
      await pedir('/api/login', { metodo: 'POST', ipCliente: '10.9.9.9', cuerpo: { usuario: `inventado${i}`, contrasena: 'mal-mal-mal-mal' } });
    }
    expect((await pedir('/api/login', { metodo: 'POST', ipCliente: '10.9.9.9', cuerpo: { usuario: 'admin1', contrasena: CONTRASENA } })).status).toBe(429);
  });
});

describe('sesión', () => {
  it('sin cookie o con una inventada: 401', async () => {
    expect((await pedir('/api/sesion')).status).toBe(401);
    expect((await pedir('/api/sesion', { cookie: '__Host-panel_sesion=inventada' })).status).toBe(401);
  });

  it('en D1 queda el hash del token, no el token', async () => {
    const { cookie } = await entrar('editor1');
    const token = cookie.split('=')[1];
    const fila = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').bind(token).first();
    expect(fila.n).toBe(0);
  });

  it('cerrar sesión la invalida en el servidor', async () => {
    const sesion = await entrar('editor1');
    const yo = como(sesion);
    expect((await yo('/api/sesion')).status).toBe(200);
    expect((await yo('/api/logout', { metodo: 'POST', cuerpo: {} })).status).toBe(200);
    expect((await yo('/api/sesion')).status).toBe(401);
  });

  it('una sesión vencida no sirve', async () => {
    const sesion = await entrar('editor1');
    await env.DB.prepare('UPDATE sessions SET expira = ?').bind(Date.now() - 1).run();
    expect((await como(sesion)('/api/sesion')).status).toBe(401);
  });
});

describe('CSRF', () => {
  it('escribir sin token, con otro token, desde otro origen o sin JSON: rechazado', async () => {
    const sesion = await entrar('admin1');
    const cuerpo = { usuario: 'x', activo: true };
    const ruta = '/api/usuarios/activo';
    expect((await pedir(ruta, { metodo: 'POST', cuerpo, cookie: sesion.cookie })).status).toBe(403);
    expect((await pedir(ruta, { metodo: 'POST', cuerpo, cookie: sesion.cookie, csrf: '0'.repeat(64) })).status).toBe(403);
    expect((await pedir(ruta, { metodo: 'POST', cuerpo, ...sesion, origen: 'https://otro.sitio' })).status).toBe(403);
    expect((await pedir(ruta, { metodo: 'POST', cuerpo, ...sesion, origen: null })).status).toBe(403);
    expect((await pedir(ruta, { metodo: 'POST', cuerpo: 'usuario=x', ...sesion, tipo: 'application/x-www-form-urlencoded' })).status).toBe(415);
  });

  it('el login también exige el mismo origen', async () => {
    expect((await pedir('/api/login', { metodo: 'POST', origen: 'https://otro.sitio', cuerpo: { usuario: 'admin1', contrasena: CONTRASENA } })).status).toBe(403);
  });
});

describe('permisos', () => {
  it('un editor no entra a traducciones ni a usuarios, aunque mande el token', async () => {
    const editor = como(await entrar('editor1'));
    expect((await editor('/api/traducciones')).status).toBe(403);
    expect((await editor('/api/usuarios')).status).toBe(403);
    expect((await editor('/api/usuarios', { metodo: 'POST', cuerpo: { usuario: 'colado', nombre: 'Colado', rol: 'admin' } })).status).toBe(403);
    expect((await editor('/api/usuarios/contrasena', { metodo: 'POST', cuerpo: { usuario: 'admin1' } })).status).toBe(403);
    const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE usuario = 'colado'").first();
    expect(fila.n).toBe(0);
  });

  it('un editor recibe equipo.json sólo en español', async () => {
    const r = await como(await entrar('editor1'))('/api/archivo?ruta=src/equipo.json');
    const { abogados } = JSON.parse((await r.json()).texto);
    expect(Object.keys(abogados[0].cargo)).toEqual(['es']);
  });

  it('un archivo fuera de la lista no se lee', async () => {
    expect((await como(await entrar('admin1'))('/api/archivo?ruta=wrangler.jsonc')).status).toBe(422);
  });
});

describe('validación al guardar', () => {
  const guardarEs = async (sesion, cambio) => {
    const yo = como(sesion);
    const { commit, texto } = await (await yo('/api/archivo?ruta=src/content.es.json')).json();
    const datos = JSON.parse(texto);
    cambio(datos);
    return yo('/api/guardar', { metodo: 'POST', cuerpo: { base: commit, descripcion: 'Prueba', archivos: [{ ruta: 'src/content.es.json', texto: JSON.stringify(datos, null, 2) }] } });
  };

  it('una clave fuera de la lista, "<" y un texto demasiado largo dan 422, también como admin', async () => {
    const admin = await entrar('admin1');
    for (const [cambio, parecido] of [
      [(d) => { d.hero.eyebrow = 'Otro'; }, /no se puede editar/],
      [(d) => { d.hero.sub = '<script>alert(1)</script>'; }, /carácter </],
      [(d) => { d.hero.title = 'x'.repeat(71); }, /pasa de 70/],
    ]) {
      const r = await guardarEs(admin, cambio);
      expect(r.status).toBe(422);
      expect((await r.json()).errores.some((t) => parecido.test(t))).toBe(true);
    }
  });

  it('un cambio válido se guarda como commit', async () => {
    const r = await guardarEs(await entrar('editor1'), (d) => { d.ciudadania.step1 = '1. Paso de prueba.'; });
    expect(r.status).toBe(200);
    expect((await r.json()).commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
