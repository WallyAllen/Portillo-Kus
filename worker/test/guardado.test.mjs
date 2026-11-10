import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { Conflicto, DatosInvalidos, estadoPublicacion, guardarCambios, leerParaEditar } from '../guardado.js';
import { GitHubSimulado } from './github-simulado.mjs';

const raiz = new URL('../../', import.meta.url);
const delRepo = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const RUTAS = ['src/content.es.json', 'src/content.en.json', 'src/content.pt.json', 'src/content.ru.json', 'src/content.zh.json',
  'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', 'src/traducciones-pendientes.json'];
const iniciales = Object.fromEntries(RUTAS.map((r) => [r, delRepo(r)]));

const ES = 'src/content.es.json';
const EN = 'src/content.en.json';
const autor = { usuario: 'prueba', nombre: 'Persona de Prueba', rol: 'admin' };
const JPEG = readFileSync(new URL('portillo-images/area-laboral.jpg', raiz)).toString('base64');

function editar(texto, cambio) {
  const datos = JSON.parse(texto);
  cambio(datos);
  return JSON.stringify(datos, null, 2);
}
const conSub = (ruta, valor) => editar(iniciales[ruta], (d) => { d.hero.sub = valor; });

let github;
let env;

before(async () => {
  github = new GitHubSimulado();
  env = { GITHUB_TOKEN: 'token-de-prueba', GITHUB_REPO: 'prueba/repo', GITHUB_BRANCH: 'main', GITHUB_API_URL: await github.iniciar() };
});
after(() => github.cerrar());

beforeEach(() => {
  const nuevo = new GitHubSimulado(iniciales);
  Object.assign(github, { blobs: nuevo.blobs, arboles: nuevo.arboles, commits: nuevo.commits, head: nuevo.head, pedidos: [], antesDeMover: null });
});

test('guarda en un único commit, con quién y qué en el mensaje', async () => {
  const base = github.head;
  const { commit } = await guardarCambios(env, {
    base, autor, descripcion: 'Cambió la bajada', archivos: [{ ruta: ES, texto: conSub(ES, 'Nueva bajada') }],
  });
  assert.equal(github.head, commit);
  const datos = github.commits.get(commit);
  assert.deepEqual(datos.padres, [base]);
  assert.match(datos.mensaje, /^Panel \(Persona de Prueba\): Cambió la bajada\n/);
  assert.match(datos.mensaje, /Usuario: prueba/);
  assert.match(datos.mensaje, /- src\/content\.es\.json/);
  assert.equal(datos.autor.name, 'Persona de Prueba');
  assert.equal(JSON.parse(github.leerEnHead(ES)).hero.sub, 'Nueva bajada');
  assert.equal(github.pedidos.filter((p) => p.startsWith('PATCH')).length, 1);
});

test('foto y JSON van juntos en el mismo commit, y la foto nueva cuenta para validar', async () => {
  const base = github.head;
  const abogado = JSON.parse(delRepo('tests/casos_validacion.json')).abogadoCompleto;
  const { commit } = await guardarCambios(env, {
    base, autor, descripcion: 'Sumó a la Dra. Prueba',
    archivos: [
      { ruta: 'portillo-images/abogado-prueba.jpg', base64: JPEG },
      { ruta: 'src/equipo.json', texto: JSON.stringify({ abogados: [abogado] }) },
    ],
  });
  assert.deepEqual(github.commits.get(commit).padres, [base]);
  assert.ok(github.leerEnHead('portillo-images/abogado-prueba.jpg'));
  assert.equal(JSON.parse(github.leerEnHead('src/equipo.json')).abogados[0].nombre, 'Dra. Prueba');
});

test('lo inválido no llega al repo', async () => {
  const base = github.head;
  await assert.rejects(
    guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, '[PENDIENTE] x') }] }),
    (e) => e instanceof DatosInvalidos && e.errores.some((t) => t.includes('hero.sub')),
  );
  assert.equal(github.head, base);
  assert.equal(github.pedidos.filter((p) => p.startsWith('POST')).length, 0);
});

test('el contenido validado no puede reemplazarse con una segunda representación', async () => {
  const base = github.head;
  const texto = conSub(ES, 'Nueva bajada válida');
  const base64 = Buffer.from('JSON inválido').toString('base64');
  for (const rol of ['admin', 'editor']) {
    await assert.rejects(guardarCambios(env, {
      base, autor: { ...autor, rol }, archivos: [{ ruta: ES, texto, base64 }],
    }), (e) => e instanceof DatosInvalidos && e.errores.some((error) => error.includes('no admite base64')));
  }
  await assert.rejects(guardarCambios(env, {
    base, autor, archivos: [{ ruta: 'portillo-images/area-laboral.jpg', texto: 'otro contenido', base64: JPEG }],
  }), (e) => e instanceof DatosInvalidos && e.errores.some((error) => error.includes('no admite texto')));
  assert.equal(github.head, base);
  assert.equal(github.pedidos.length, 0);
});

test('sólo se pueden escribir las rutas previstas', async () => {
  const base = github.head;
  for (const ruta of ['worker/index.js', 'wrangler.jsonc', 'src/template.html', '../secreto', 'portillo-images/x.svg', 'portillo-images/../src/build.py']) {
    await assert.rejects(guardarCambios(env, { base, autor, archivos: [{ ruta, texto: 'x', base64: JPEG }] }), DatosInvalidos, ruta);
  }
  await assert.rejects(leerParaEditar(env, '.github/secrets', null), DatosInvalidos);
  assert.equal(github.head, base);
});

test('una imagen falsa no llega al repo', async () => {
  await assert.rejects(guardarCambios(env, {
    base: github.head, autor, archivos: [{ ruta: 'portillo-images/abogado-x.jpg', base64: Buffer.from('<svg onload=alert(1)>').toString('base64') }],
  }), DatosInvalidos);
});

test('dos personas sobre la misma base: la segunda no pisa a la primera', async () => {
  const base = github.head;
  const { commit: primera } = await guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'De la primera') }] });
  await assert.rejects(
    guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'De la segunda') }] }),
    (e) => e instanceof Conflicto && e.archivos.includes(ES),
  );
  assert.equal(github.head, primera);
  assert.equal(JSON.parse(github.leerEnHead(ES)).hero.sub, 'De la primera');
});

test('si la rama avanzó en otro archivo, guarda arriba sin perder lo otro', async () => {
  const base = github.head;
  const ajeno = github.avanzar(EN, conSub(EN, 'Otra persona'));
  const { commit } = await guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'Mía') }] });
  assert.deepEqual(github.commits.get(commit).padres, [ajeno]);
  assert.equal(JSON.parse(github.leerEnHead(EN)).hero.sub, 'Otra persona');
  assert.equal(JSON.parse(github.leerEnHead(ES)).hero.sub, 'Mía');
});

test('se valida contra lo que entró recién, no sólo contra la base', async () => {
  const base = github.head;
  // Lo mío era válido contra la base, pero head ya tiene una clave que mi inglés no tiene.
  github.avanzar(ES, editar(iniciales[ES], (d) => { d.hero.nueva = 'x'; }));
  await assert.rejects(
    guardarCambios(env, { base, autor, archivos: [{ ruta: EN, texto: conSub(EN, 'Mía') }] }),
    (e) => e instanceof DatosInvalidos && e.errores.some((t) => t.includes('hero.nueva')),
  );
});

test('carrera justo antes de mover la rama sin tocar lo mismo: reintenta y entra', async () => {
  const base = github.head;
  github.antesDeMover = () => github.avanzar(EN, conSub(EN, 'Justo antes'));
  const { commit } = await guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'Mía') }] });
  assert.equal(github.head, commit);
  assert.equal(JSON.parse(github.leerEnHead(EN)).hero.sub, 'Justo antes');
  assert.equal(JSON.parse(github.leerEnHead(ES)).hero.sub, 'Mía');
});

test('carrera justo antes de mover la rama tocando lo mismo: avisa', async () => {
  const base = github.head;
  github.antesDeMover = () => github.avanzar(ES, conSub(ES, 'Justo antes'));
  await assert.rejects(
    guardarCambios(env, { base, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'Mía') }] }),
    (e) => e instanceof Conflicto && e.archivos.includes(ES),
  );
  assert.equal(JSON.parse(github.leerEnHead(ES)).hero.sub, 'Justo antes');
});

test('una base que no existe o una historia reescrita no pisa nada', async () => {
  const head = github.head;
  await assert.rejects(
    guardarCambios(env, { base: 'f'.repeat(40), autor, archivos: [{ ruta: ES, texto: conSub(ES, 'Mía') }] }),
    Conflicto,
  );
  assert.equal(github.head, head);
});

test('un guardado nunca fuerza la rama ni expone el token en el error', async () => {
  const malo = { ...env, GITHUB_TOKEN: 'token-equivocado' };
  await assert.rejects(guardarCambios(malo, { base: github.head, autor, archivos: [{ ruta: ES, texto: conSub(ES, 'x') }] }), (e) => {
    assert.doesNotMatch(e.message, /token-equivocado/);
    return e.estado === 401;
  });
});

test('estado de la publicación', async () => {
  const assets = (cuerpo, ok = true) => ({ ASSETS: { fetch: async () => new Response(JSON.stringify(cuerpo), { status: ok ? 200 : 404 }) } });
  const a = github.head;
  const b = github.avanzar(EN, conSub(EN, 'B'));
  const c = github.avanzar(EN, conSub(EN, 'C'));
  const estado = (publicado, commit, ok) => estadoPublicacion({ ...env, ...assets({ sha: publicado }, ok) }, commit, 'https://sitio.test');
  assert.equal((await estado(b, b)).estado, 'publicado', 'coincide');
  assert.equal((await estado(c, b)).estado, 'publicado', 'lo publicado contiene a mi commit');
  assert.equal((await estado(a, b)).estado, 'publicando', 'lo publicado es anterior');
  assert.equal((await estado('local', b)).estado, 'publicando', 'build local');
  assert.equal((await estado(b, b, false)).estado, 'publicando', 'sin version.json');
});
