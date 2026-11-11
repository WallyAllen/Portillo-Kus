// "Volver a la versión anterior": deshace la última publicación del panel sin pisar nada más.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { Conflicto, DatosInvalidos, guardarCambios, restaurarVersion, versionAnterior } from '../guardado.js';
import { GitHubSimulado } from './github-simulado.mjs';

const raiz = new URL('../../', import.meta.url);
const delRepo = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const RUTAS = ['src/content.es.json', 'src/content.en.json', 'src/content.pt.json', 'src/content.ru.json', 'src/content.zh.json',
  'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', 'src/traducciones-pendientes.json'];
const iniciales = Object.fromEntries(RUTAS.map((r) => [r, delRepo(r)]));
const ES = 'src/content.es.json';
const PENDIENTES = 'src/traducciones-pendientes.json';
const FOTO = 'portillo-images/area-laboral.jpg';
const admin = { usuario: 'prueba', nombre: 'Persona de Prueba', rol: 'admin' };
const editor = { usuario: 'editora', nombre: 'Editora', rol: 'editor' };

const editar = (texto, cambio) => {
  const datos = JSON.parse(texto);
  cambio(datos);
  return `${JSON.stringify(datos, null, 2)}\n`;
};

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

const leer = (ruta) => github.leerEnHead(ruta)?.toString();
const publicarBajada = (valor, autor = admin) => guardarCambios(env, {
  base: github.head, autor, descripcion: 'Textos: Texto debajo del título',
  archivos: [{ ruta: ES, texto: editar(leer(ES), (d) => { d.hero.sub = valor; }) }],
});

test('sin publicaciones del panel no hay nada para deshacer', async () => {
  const { head, anterior } = await versionAnterior(env, admin);
  assert.equal(head, github.head);
  assert.equal(anterior, null);
});

test('deshace la última publicación con un commit nuevo, pendientes incluidos', async () => {
  const antes = { es: leer(ES), pendientes: leer(PENDIENTES) };
  const { commit: publicado } = await publicarBajada('Una bajada nueva');
  assert.notEqual(leer(PENDIENTES), antes.pendientes, 'cambiar el español deja traducciones pendientes');

  const { head, anterior } = await versionAnterior(env, admin);
  assert.equal(anterior.commit, publicado);
  assert.equal(anterior.descripcion, 'Textos: Texto debajo del título');
  assert.equal(anterior.autor, 'Persona de Prueba');
  assert.deepEqual(anterior.cambia, ['Textos, reseñas y descripciones de fotos']);
  assert.equal(anterior.motivo, undefined);

  const { commit } = await restaurarVersion(env, { head, commit: publicado, autor: admin });
  assert.equal(github.head, commit);
  assert.deepEqual(github.commits.get(commit).padres, [publicado]);
  assert.match(github.commits.get(commit).mensaje, /^Panel \(Persona de Prueba\): Volver a la versión anterior a «Textos: Texto debajo del título»/);
  assert.equal(leer(ES), antes.es);
  assert.equal(leer(PENDIENTES), antes.pendientes);
});

test('otro cambio después, en otro archivo, no impide volver atrás ni se pierde', async () => {
  const { commit: publicado } = await publicarBajada('Otra bajada');
  github.avanzar('src/template.html', `${iniciales['src/template.html']}\n<!-- otro cambio -->\n`, 'Felipe: plantilla');
  const { head, anterior } = await versionAnterior(env, admin);
  assert.equal(anterior.commit, publicado);
  assert.equal(anterior.motivo, undefined);
  await restaurarVersion(env, { head, commit: publicado, autor: admin });
  assert.equal(leer(ES), iniciales[ES]);
  assert.match(leer('src/template.html'), /otro cambio/);
});

test('si después alguien tocó lo mismo, no se ofrece y no se pisa', async () => {
  await publicarBajada('Bajada del panel');
  const encima = editar(leer(ES), (d) => { d.hero.title = 'Cambio de Felipe'; });
  github.avanzar(ES, encima, 'Felipe: título');
  const { head, anterior } = await versionAnterior(env, admin);
  assert.match(anterior.motivo, /otros cambios en lo mismo/);
  await assert.rejects(restaurarVersion(env, { head, commit: anterior.commit, autor: admin }), DatosInvalidos);
  assert.equal(leer(ES), encima);
});

test('si la rama se movió desde que se abrió el diálogo, avisa y no hace nada', async () => {
  const { commit: publicado } = await publicarBajada('Bajada');
  const { head } = await versionAnterior(env, admin);
  github.avanzar('src/template.html', `${iniciales['src/template.html']}\n`, 'Otro cambio');
  const antes = github.head;
  await assert.rejects(restaurarVersion(env, { head, commit: publicado, autor: admin }), Conflicto);
  assert.equal(github.head, antes);
});

test('una cuenta de edición no puede deshacer una traducción', async () => {
  const en = editar(leer('src/content.en.json'), (d) => { d.hero.sub = 'New subtitle'; });
  github.avanzar('src/content.en.json', en, 'Panel (Felipe): Traducción de hero.sub (en)\n\nUsuario: felipe');
  const { anterior } = await versionAnterior(env, editor);
  assert.match(anterior.motivo, /administración/);
  assert.deepEqual(anterior.cambia, ['Traducción al inglés']);
  const comoAdmin = await versionAnterior(env, admin);
  assert.equal(comoAdmin.anterior.motivo, undefined);
});

test('lo que no publicó el panel no se puede deshacer desde el panel', async () => {
  github.avanzar('src/template.html', `${iniciales['src/template.html']}\n`, 'Panel (Alguien): algo raro');
  const { anterior } = await versionAnterior(env, admin);
  assert.match(anterior.motivo, /no se puede deshacer/);
});

test('una foto vuelve a la anterior sin subirla de nuevo', async () => {
  const original = readFileSync(new URL(FOTO, raiz));
  github.avanzar(FOTO, original, 'Fotos iniciales');
  const blobOriginal = github.arbolDe(github.head).get(FOTO);
  const nueva = readFileSync(new URL('portillo-images/area-familia.jpg', raiz)).toString('base64');
  const { commit: publicado } = await guardarCambios(env, {
    base: github.head, autor: admin, descripcion: 'Foto: Laboral',
    archivos: [
      { ruta: FOTO, base64: nueva },
      { ruta: ES, texto: editar(leer(ES), (d) => { d.areas.a1_alt = 'Una descripción nueva de la foto'; }) },
    ],
  });
  const { head, anterior } = await versionAnterior(env, admin);
  assert.ok(anterior.cambia.includes('Foto: Laboral'));
  await restaurarVersion(env, { head, commit: publicado, autor: admin });
  assert.deepEqual(github.leerEnHead(FOTO), original);
  assert.equal(github.arbolDe(github.head).get(FOTO), blobOriginal, 'la foto vuelve con su mismo blob, sin subirse otra vez');
  assert.equal(JSON.parse(leer(ES)).areas.a1_alt, JSON.parse(iniciales[ES]).areas.a1_alt);
});
