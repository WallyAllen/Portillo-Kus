// Prueba de punta a punta contra `wrangler dev`, con D1 local y GitHub simulado.
//   node worker/test/e2e.mjs
// Usa una base temporal y sólo credenciales de prueba. No toca Cloudflare ni GitHub.
// No se llama *.test.mjs porque tarda y necesita wrangler: `node --test` no la levanta.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitHubSimulado } from './github-simulado.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PUERTO = 8787;
const PUERTO_SIN_D1 = 8790;
const ORIGEN = `http://localhost:${PUERTO}`;
const CONTRASENA = 'contrasena-solo-de-prueba';
const WRANGLER = ['--yes', 'wrangler@4'];

const persistencia = mkdtempSync(join(tmpdir(), 'panel-e2e-'));
const procesos = [];
let fallas = 0;
let pasadas = 0;

async function caso(nombre, prueba) {
  try {
    await prueba();
    pasadas++;
    console.log(`  ok    ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`  FALLA ${nombre}\n        ${e.message.split('\n').slice(0, 6).join('\n        ')}`);
  }
}

function correr(comando, argumentos, opciones = {}) {
  const r = spawnSync([comando, ...argumentos].join(' '), { cwd: RAIZ, encoding: 'utf8', shell: true, ...opciones });
  if (r.status !== 0) throw new Error(`${comando} ${argumentos.join(' ')} falló:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const sql = (consulta) => correr('npx', [...WRANGLER, 'd1', 'execute', 'DB', '--local', '--env', 'dev',
  `--persist-to="${persistencia}"`, `--command="${consulta}"`]);

function crearUsuario(usuario, rol = 'admin') {
  correr('node', ['scripts/crear-admin.mjs', '--usuario', usuario, '--nombre', `"Persona ${usuario}"`, '--rol', rol,
    '--local', '--env', 'dev', `--persist-to="${persistencia}"`], { env: { ...process.env, PANEL_CONTRASENA: CONTRASENA } });
}

async function levantar(argumentos, puerto) {
  const proceso = spawn(['npx', ...WRANGLER, 'dev', '--port', puerto, ...argumentos].join(' '), { cwd: RAIZ, shell: true, stdio: 'ignore' });
  procesos.push(proceso);
  for (let i = 0; i < 90; i++) {
    try {
      await fetch(`http://localhost:${puerto}/panel`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`wrangler dev no arrancó en ${puerto}`);
}

function bajarProcesos() {
  for (const p of procesos) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  if (process.platform !== 'win32') for (const p of procesos) p.kill();
}

// Un navegador mínimo: guarda la cookie y manda los encabezados que manda la página.
class Cliente {
  cookie = null;
  csrf = null;

  async pedir(ruta, { metodo = 'GET', cuerpo, encabezados = {} } = {}) {
    const headers = { ...encabezados };
    if (this.cookie) headers.Cookie = this.cookie;
    if (metodo !== 'GET') {
      headers.Origin ??= ORIGEN;
      headers['Content-Type'] ??= 'application/json';
      if (this.csrf) headers['X-CSRF-Token'] ??= this.csrf;
    }
    return fetch(ORIGEN + ruta, { method: metodo, headers, redirect: 'manual', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  }

  async entrar(usuario, contrasena = CONTRASENA) {
    const r = await this.pedir('/api/login', { metodo: 'POST', cuerpo: { usuario, contrasena } });
    if (r.status === 200) {
      this.cookie = r.headers.get('set-cookie').split(';')[0];
      this.csrf = (await r.json()).csrf;
    }
    return r;
  }
}

const github = new GitHubSimulado(Object.fromEntries(
  ['src/content.es.json', 'src/content.en.json', 'src/content.pt.json', 'src/content.ru.json', 'src/content.zh.json',
    'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', 'src/traducciones-pendientes.json']
    .map((ruta) => [ruta, readFileSync(join(RAIZ, ruta), 'utf8')]),
));

async function principal() {
  console.log('Preparando: build, base local, usuarios y wrangler dev…');
  correr('python', ['-X', 'utf8', 'src/build.py']);
  correr('npx', [...WRANGLER, 'd1', 'migrations', 'apply', 'DB', '--local', '--env', 'dev', `--persist-to="${persistencia}"`]);
  crearUsuario('prueba');
  crearUsuario('prueba-bloqueo');
  crearUsuario('prueba-carrera');
  crearUsuario('prueba-activa', 'editor');
  crearUsuario('prueba-editor', 'editor');
  await github.iniciar(8788);
  await levantar(['--env', 'dev', `--persist-to="${persistencia}"`, '--var', 'GITHUB_TOKEN:token-de-prueba'], PUERTO);
  await levantar([`--persist-to="${persistencia}"`, '--inspector-port', '9231'], PUERTO_SIN_D1);

  console.log('Sitio estático');
  await caso('las páginas salen idénticas a dist/ y con sus encabezados', async () => {
    for (const [ruta, archivo] of [['/', 'index.html'], ['/en/', 'en/index.html'], ['/pt/', 'pt/index.html'], ['/privacidad/', 'privacidad/index.html']]) {
      const r = await fetch(ORIGEN + ruta);
      assert.equal(r.status, 200, ruta);
      assert.equal(await r.text(), readFileSync(join(RAIZ, 'dist', archivo), 'utf8'), ruta);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self' 'sha256-/, ruta);
      assert.equal(r.headers.get('x-robots-tag'), null, ruta);
    }
  });
  await caso('404 real, redirecciones y archivos del repo afuera', async () => {
    for (const ruta of ['/no-existe', '/en/no-existe', '/README.md', '/src/build.py', '/worker/index.js', '/wrangler.jsonc',
      '/traducciones-pendientes.json', '/src/traducciones-pendientes.json']) {
      assert.equal((await fetch(ORIGEN + ruta)).status, 404, ruta);
    }
    for (const [ruta, destino] of [['/home', '/'], ['/contacto', '/#contacto'], ['/index.html', '/']]) {
      const r = await fetch(ORIGEN + ruta, { redirect: 'manual' });
      assert.ok([301, 307].includes(r.status), `${ruta}: ${r.status}`);
      assert.ok(r.headers.get('location').endsWith(destino), ruta);
    }
  });
  await caso('version.json se revalida y robots cierra el panel', async () => {
    const r = await fetch(`${ORIGEN}/version.json`);
    assert.deepEqual(await r.json(), { sha: 'local' });
    assert.match(r.headers.get('cache-control'), /max-age=0, must-revalidate/);
    const robots = await (await fetch(`${ORIGEN}/robots.txt`)).text();
    assert.match(robots, /^Disallow: \/panel\r?$/m); // Python en Windows escribe CRLF
    assert.match(robots, /^Disallow: \/api\/\r?$/m);
  });
  await caso('sin base configurada: el sitio funciona y el panel avisa', async () => {
    const otro = `http://localhost:${PUERTO_SIN_D1}`;
    assert.equal((await fetch(`${otro}/`)).status, 200);
    assert.equal((await fetch(`${otro}/panel`)).status, 200);
    const r = await fetch(`${otro}/api/sesion`);
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /configurado/);
  });

  console.log('Panel: encabezados');
  await caso('/panel y /panel/ con noindex y CSP propia', async () => {
    for (const ruta of ['/panel', '/panel/']) {
      const r = await fetch(ORIGEN + ruta, { redirect: 'manual' });
      assert.equal(r.status, 200, ruta);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.match(r.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'; style-src 'self'/);
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.match(await r.text(), /<meta name="robots" content="noindex, nofollow">/);
    }
  });
  await caso('archivos del panel, 404 y API con los mismos encabezados', async () => {
    for (const [ruta, tipo] of [['/panel/app.js', 'text/javascript'], ['/panel/pantallas/inicio.js', 'text/javascript'], ['/panel/pantallas/traducciones.js', 'text/javascript'], ['/panel/estilos.css', 'text/css']]) {
      const r = await fetch(ORIGEN + ruta);
      assert.equal(r.status, 200, ruta);
      assert.ok(r.headers.get('content-type').startsWith(tipo), ruta);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', ruta);
    }
    for (const ruta of ['/panel/no-existe', '/api/no-existe']) {
      const r = await fetch(ORIGEN + ruta);
      assert.equal(r.status, 404, ruta);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', ruta);
    }
  });

  console.log('Login y sesión');
  const cliente = new Cliente();
  await caso('sin sesión no se entra', async () => {
    assert.equal((await cliente.pedir('/api/sesion')).status, 401);
    assert.equal((await cliente.pedir('/api/archivo?ruta=src/equipo.json')).status, 401);
    assert.equal((await cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: {} })).status, 401);
    assert.equal((await cliente.pedir(`/api/publicacion?commit=${'a'.repeat(40)}`)).status, 401);
  });
  await caso('login desde otro origen, sin origen o sin JSON: rechazado', async () => {
    const cuerpo = { usuario: 'prueba', contrasena: CONTRASENA };
    assert.equal((await cliente.pedir('/api/login', { metodo: 'POST', cuerpo, encabezados: { Origin: 'https://malo.test' } })).status, 403);
    const sinOrigen = await fetch(`${ORIGEN}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    assert.equal(sinOrigen.status, 403);
    assert.equal((await cliente.pedir('/api/login', { metodo: 'POST', cuerpo, encabezados: { 'Content-Type': 'text/plain' } })).status, 415);
  });
  await caso('contraseña incorrecta y usuario inexistente dan la misma respuesta', async () => {
    const [a, b] = [await new Cliente().entrar('prueba-activa', 'mal'), await new Cliente().entrar('no-existe', 'mal')];
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(await a.json(), await b.json());
  });
  await caso('login correcto con cookie HttpOnly, Secure, SameSite=Strict, 7 días', async () => {
    const r = await cliente.entrar('prueba');
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /^__Host-panel_sesion=/);
    for (const atributo of [/; HttpOnly/, /; Secure/, /; SameSite=Strict/, /; Path=\//, /; Max-Age=604800/]) assert.match(cookie, atributo);
    const sesion = await cliente.pedir('/api/sesion');
    assert.equal(sesion.status, 200);
    const datos = await sesion.json();
    assert.deepEqual(datos.usuario, { usuario: 'prueba', nombre: 'Persona prueba', rol: 'admin' });
    assert.equal(datos.csrf, cliente.csrf);
  });
  await caso('en D1 no quedan la contraseña ni el token', async () => {
    const salida = sql('SELECT hash FROM users WHERE usuario=\'prueba\'; SELECT token_hash FROM sessions');
    assert.match(salida, /pbkdf2-sha256\$210000\$/);
    assert.ok(!salida.includes(CONTRASENA));
    assert.ok(!salida.includes(cliente.cookie.split('=')[1]));
  });

  console.log('CSRF');
  await caso('escribir sin token, con otro token o desde otro origen: rechazado', async () => {
    const con = (encabezados) => cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: {}, encabezados });
    const sinToken = await fetch(`${ORIGEN}/api/logout`, { method: 'POST', headers: { Cookie: cliente.cookie, Origin: ORIGEN, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sinToken.status, 403);
    assert.equal((await con({ 'X-CSRF-Token': 'a'.repeat(64) })).status, 403);
    assert.equal((await con({ Origin: 'https://malo.test' })).status, 403);
    assert.equal((await cliente.pedir('/api/sesion')).status, 200, 'la sesión sigue abierta');
  });

  console.log('Bloqueo');
  await caso('tras 5 fallos, ni la contraseña correcta entra; a los 15 minutos, sí', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await new Cliente().entrar('prueba-bloqueo', 'mal')).status, 401, `intento ${i + 1}`);
    const bloqueado = await new Cliente().entrar('prueba-bloqueo');
    assert.equal(bloqueado.status, 429);
    assert.equal(bloqueado.headers.get('retry-after'), '900');
    assert.match((await bloqueado.json()).error, /15 minutos/);
    assert.equal((await new Cliente().entrar('prueba-activa')).status, 200, 'otro usuario no queda bloqueado');
    sql(`UPDATE login_attempts SET creado = creado - ${16 * 60 * 1000} WHERE usuario = 'prueba-bloqueo'`);
    assert.equal((await new Cliente().entrar('prueba-bloqueo')).status, 200);
    assert.ok(!sql('SELECT usuario FROM login_attempts').includes('prueba-bloqueo'), 'el login correcto limpia los intentos');
  });
  await caso('con pedidos en paralelo tampoco pasan más de 5 intentos', async () => {
    const respuestas = await Promise.all(Array.from({ length: 12 }, () => new Cliente().entrar('prueba-carrera', 'mal')));
    const estados = respuestas.map((r) => r.status);
    assert.equal(estados.filter((e) => e === 401).length, 5, estados.join());
    assert.equal(estados.filter((e) => e === 429).length, 7, estados.join());
  });

  console.log('Guardar');
  const es = 'src/content.es.json';
  const leer = async (c, ruta) => (await c.pedir(`/api/archivo?ruta=${ruta}`)).json();
  const conSub = (texto, valor) => {
    const datos = JSON.parse(texto);
    datos.hero.sub = valor;
    return JSON.stringify(datos, null, 2);
  };
  let primerCommit;
  await caso('leer y guardar: un commit que dice quién y qué', async () => {
    const { commit, texto } = await leer(cliente, es);
    assert.equal(commit, github.head);
    const r = await cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: commit, descripcion: 'Cambió la bajada', archivos: [{ ruta: es, texto: conSub(texto, 'Bajada de prueba') }] } });
    assert.equal(r.status, 200, await r.clone().text());
    primerCommit = (await r.json()).commit;
    assert.equal(github.head, primerCommit);
    assert.match(github.commits.get(primerCommit).mensaje, /^Panel \(Persona prueba\): Cambió la bajada/);
    assert.equal(JSON.parse(github.leerEnHead(es)).hero.sub, 'Bajada de prueba');
  });
  await caso('lo que rompería el build no se commitea', async () => {
    const { commit, texto } = await leer(cliente, es);
    const r = await cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: commit, archivos: [{ ruta: es, texto: conSub(texto, '[PENDIENTE] x') }] } });
    assert.equal(r.status, 422);
    assert.ok((await r.json()).errores.some((t) => t.includes('hero.sub')));
    assert.equal(github.head, commit);
  });
  await caso('un archivo fuera de la lista no se lee ni se escribe', async () => {
    const lectura = await cliente.pedir('/api/archivo?ruta=wrangler.jsonc');
    assert.equal(lectura.status, 422);
    const escritura = await cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: github.head, archivos: [{ ruta: 'worker/index.js', texto: 'x' }] } });
    assert.equal(escritura.status, 422);
  });
  await caso('dos personas sobre la misma base: 409 y nada pisado', async () => {
    const { commit, texto } = await leer(cliente, es);
    const antes = github.avanzar(es, conSub(texto, 'Otra persona'));
    const r = await cliente.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: commit, archivos: [{ ruta: es, texto: conSub(texto, 'Mía') }] } });
    assert.equal(r.status, 409);
    assert.deepEqual((await r.json()).conflicto, [es]);
    assert.equal(github.head, antes);
  });

  console.log('Traducciones');
  const redactor = new Cliente();
  const pendientesEnHead = () => JSON.parse(github.leerEnHead('src/traducciones-pendientes.json')).pendientes;
  await caso('un editor no entra a las traducciones: la API responde 403', async () => {
    assert.equal((await redactor.entrar('prueba-editor')).status, 200);
    const head = github.head;
    assert.equal((await redactor.pedir('/api/traducciones')).status, 403);
    assert.equal((await redactor.pedir('/api/traducciones', { metodo: 'POST', cuerpo: { base: head, textos: { 'hero.sub': { en: 'x' } } } })).status, 403);
    assert.equal((await redactor.pedir('/api/archivo?ruta=src/content.en.json')).status, 403);
    const directo = await redactor.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: head, archivos: [{ ruta: 'src/content.en.json', texto: String(github.leerEnHead('src/content.en.json')) }] } });
    assert.equal(directo.status, 403);
    assert.equal(github.head, head);
  });
  await caso('la lista de pendientes no se lee ni se escribe directo, ni como admin', async () => {
    const ruta = 'src/traducciones-pendientes.json';
    for (const c of [redactor, cliente]) {
      assert.equal((await c.pedir(`/api/archivo?ruta=${ruta}`)).status, 422);
      assert.equal((await c.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: github.head, archivos: [{ ruta, texto: '{"pendientes": {}}\n' }] } })).status, 422);
    }
  });
  await caso('un pedido no puede dar de baja pendientes por /api/guardar', async () => {
    const { commit, texto } = await leer(redactor, es);
    const datos = JSON.parse(texto);
    datos.ciudadania.step2 = 'Otra etiqueta';
    const r = await redactor.pedir('/api/guardar', { metodo: 'POST', cuerpo: {
      base: commit, archivos: [{ ruta: es, texto: JSON.stringify(datos, null, 2) }], confirmados: [{ clave: 'ciudadania.step2', codigo: 'en' }],
    } });
    assert.equal(r.status, 200, await r.clone().text());
    assert.ok('en' in pendientesEnHead()['ciudadania.step2'].viejo);
  });
  await caso('un editor recibe equipo.json sólo en español', async () => {
    const { texto } = await leer(redactor, 'src/equipo.json');
    assert.deepEqual(Object.keys(JSON.parse(texto).abogados[0].cargo), ['es']);
    const completo = await leer(cliente, 'src/equipo.json');
    assert.ok('en' in JSON.parse(completo.texto).abogados[0].cargo);
  });
  await caso('el editor cambia un texto, el admin lo traduce: pendiente en el mismo commit y baja en otro', async () => {
    const { commit, texto } = await leer(redactor, es);
    const datos = JSON.parse(texto);
    const viejo = datos.ciudadania.step1;
    datos.ciudadania.step1 = 'Etiqueta nueva';
    const guardado = await redactor.pedir('/api/guardar', { metodo: 'POST', cuerpo: { base: commit, descripcion: 'Cambió una etiqueta', archivos: [{ ruta: es, texto: JSON.stringify(datos, null, 2) }] } });
    assert.equal(guardado.status, 200, await guardado.clone().text());
    assert.match(github.commits.get(github.head).mensaje, /traducciones-pendientes\.json/);

    const lista = await (await cliente.pedir('/api/traducciones')).json();
    const item = lista.pendientes.find((p) => p.clave === 'ciudadania.step1');
    assert.equal(item.nuevo, 'Etiqueta nueva');
    assert.equal(item.idiomas.find((i) => i.codigo === 'en').viejo, viejo);

    const r = await cliente.pedir('/api/traducciones', { metodo: 'POST', cuerpo: { base: lista.commit, textos: { 'ciudadania.step1': { en: 'New label' } } } });
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual(github.commits.get(github.head).padres, [lista.commit], 'un solo commit');
    assert.equal(JSON.parse(github.leerEnHead('src/content.en.json')).ciudadania.step1, 'New label');
    assert.deepEqual(Object.keys(pendientesEnHead()['ciudadania.step1'].viejo), ['pt', 'ru', 'zh']);
  });
  await caso('traducción inválida y conflicto: 422 y 409', async () => {
    const lista = await (await cliente.pedir('/api/traducciones')).json();
    const invalida = await cliente.pedir('/api/traducciones', { metodo: 'POST', cuerpo: { base: lista.commit, textos: { 'ciudadania.step1': { pt: '[PENDIENTE] x' } } } });
    assert.equal(invalida.status, 422);
    const { texto } = await leer(cliente, es);
    const datos = JSON.parse(texto);
    datos.ciudadania.step1 = 'Otra vez cambiada';
    github.avanzar(es, JSON.stringify(datos, null, 2));
    const conflicto = await cliente.pedir('/api/traducciones', { metodo: 'POST', cuerpo: { base: lista.commit, textos: { 'ciudadania.step1': { pt: 'Novo' } } } });
    assert.equal(conflicto.status, 409);
  });

  console.log('Publicación');
  const version = join(RAIZ, 'dist/version.json');
  const estado = async (commit) => (await (await cliente.pedir(`/api/publicacion?commit=${commit}`)).json()).estado;
  const esperarEstado = async (commit, esperado) => {
    for (let i = 0; i < 30; i++) {
      if (await estado(commit) === esperado) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(await estado(commit), esperado);
  };
  await caso('"publicando" hasta que version.json coincide o contiene al commit', async () => {
    assert.equal(await estado(primerCommit), 'publicando', 'build local');
    writeFileSync(version, JSON.stringify({ sha: primerCommit }));
    await esperarEstado(primerCommit, 'publicado');
    writeFileSync(version, JSON.stringify({ sha: github.head }));
    await new Promise((r) => setTimeout(r, 3000));
    await esperarEstado(primerCommit, 'publicado'); // el commit siguiente lo contiene
    assert.equal((await cliente.pedir('/api/publicacion?commit=nada')).status, 400);
  });

  console.log('Fin de la sesión');
  await caso('usuario desactivado pierde el acceso en el pedido siguiente', async () => {
    const c = new Cliente();
    assert.equal((await c.entrar('prueba-activa')).status, 200);
    sql("UPDATE users SET activo = 0 WHERE usuario = 'prueba-activa'");
    assert.equal((await c.pedir('/api/sesion')).status, 401);
    assert.equal((await new Cliente().entrar('prueba-activa')).status, 401);
  });
  await caso('una sesión vencida no sirve', async () => {
    const c = new Cliente();
    assert.equal((await c.entrar('prueba-bloqueo')).status, 200);
    assert.equal((await c.pedir('/api/sesion')).status, 200);
    sql(`UPDATE sessions SET expira = ${Date.now() - 1000} WHERE user_id = (SELECT id FROM users WHERE usuario = 'prueba-bloqueo')`);
    assert.equal((await c.pedir('/api/sesion')).status, 401);
  });
  await caso('cerrar sesión la invalida en el servidor, no sólo la cookie', async () => {
    const r = await cliente.pedir('/api/logout', { metodo: 'POST', cuerpo: {} });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await cliente.pedir('/api/sesion')).status, 401, 'la cookie vieja ya no entra');
  });
}

try {
  await principal();
} catch (e) {
  fallas++;
  console.error(e);
} finally {
  bajarProcesos();
  await github.cerrar().catch(() => {});
  correr('python', ['-X', 'utf8', 'src/build.py'], { stdio: 'ignore' }); // version.json vuelve a "local"
  rmSync(persistencia, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
console.log(`\n${pasadas} pasaron, ${fallas} fallaron`);
process.exit(fallas ? 1 : 0);
