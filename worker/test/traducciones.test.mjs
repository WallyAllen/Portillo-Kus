import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { Conflicto, DatosInvalidos, guardarCambios, guardarTraducciones, leerParaEditar, listarTraducciones, Prohibido } from '../guardado.js';
import { ARCHIVO_PENDIENTES, reconciliar } from '../traducciones.js';
import { GitHubSimulado } from './github-simulado.mjs';

const raiz = new URL('../../', import.meta.url);
const delRepo = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const RUTAS = ['src/content.es.json', 'src/content.en.json', 'src/content.pt.json', 'src/content.ru.json', 'src/content.zh.json',
  'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', ARCHIVO_PENDIENTES];
const iniciales = Object.fromEntries(RUTAS.map((r) => [r, delRepo(r)]));

const ES = 'src/content.es.json';
const EN = 'src/content.en.json';
const EQUIPO = 'src/equipo.json';
const admin = { usuario: 'admin', nombre: 'Admin de Prueba', rol: 'admin' };
const editor = { usuario: 'editor', nombre: 'Editor de Prueba', rol: 'editor' };

const editar = (ruta, cambio) => {
  const datos = JSON.parse(github.leerEnHead(ruta));
  cambio(datos);
  return `${JSON.stringify(datos, null, 2)}\n`;
};
const conSub = (ruta, valor) => editar(ruta, (d) => { d.hero.sub = valor; });
const lista = () => JSON.parse(github.leerEnHead(ARCHIVO_PENDIENTES)).pendientes;
const leerHead = (ruta) => JSON.parse(github.leerEnHead(ruta));
const subOriginal = JSON.parse(iniciales[ES]).hero.sub;
const cambiarSub = (valor, autor = editor) => guardarCambios(env, { base: github.head, autor, archivos: [{ ruta: ES, texto: conSub(ES, valor) }] });
const traducir = (textos, autor = admin, base = github.head) => guardarTraducciones(env, { base, textos, autor });

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

test('reconciliar: el español cambia y entran los otros idiomas', () => {
  const antes = { a: { es: 'uno', en: 'one', pt: 'um', ru: 'р', zh: 'z' } };
  const despues = { a: { ...antes.a, es: 'dos' } };
  assert.deepEqual(reconciliar({}, antes, despues, 'F'), { a: { fecha: 'F', viejo: { en: 'uno', pt: 'uno', ru: 'uno', zh: 'uno' } } });
});

test('reconciliar: sin cambios no registra nada y no cambia la fecha', () => {
  const textos = { a: { es: 'uno', en: 'one' }, b: { es: 'dos', en: 'two' } };
  const previos = { b: { fecha: 'antes', viejo: { en: 'viejo' } } };
  assert.deepEqual(reconciliar(previos, textos, textos, 'F'), previos);
});

test('reconciliar: dos ediciones conservan el texto de la última traducción válida', () => {
  const previos = { a: { fecha: 'antes', viejo: { en: 'original' } } };
  const r = reconciliar(previos, { a: { es: 'segundo', en: 'one' } }, { a: { es: 'tercero', en: 'one' } }, 'F');
  assert.equal(r.a.fecha, 'F');
  assert.equal(r.a.viejo.en, 'original');
  assert.equal(r.a.viejo.pt, 'segundo', 'pt no estaba pendiente: su traducción válida era la del segundo');
});

test('reconciliar: volver al texto traducido saca el pendiente', () => {
  const previos = { a: { fecha: 'antes', viejo: { en: 'original', pt: 'otro', ru: 'otro', zh: 'otro' } } };
  const r = reconciliar(previos, { a: { es: 'editado', en: 'one', pt: 'um' } }, { a: { es: 'original', en: 'one', pt: 'um' } }, 'F');
  assert.deepEqual(r, { a: { fecha: 'F', viejo: { pt: 'otro', ru: 'otro', zh: 'otro' } } });
});

test('reconciliar: traducir en el mismo guardado no deja pendiente ese idioma', () => {
  const r = reconciliar({}, { a: { es: 'uno', en: 'one', pt: 'um', ru: 'р', zh: 'z' } }, { a: { es: 'dos', en: 'two', pt: 'um', ru: 'р2', zh: 'z2' } }, 'F');
  assert.deepEqual(r, { a: { fecha: 'F', viejo: { pt: 'uno' } } });
});

test('reconciliar: una traducción marcada como pendiente no cuenta, y lo borrado sale', () => {
  const previos = { a: { fecha: 'antes', viejo: { en: 'x' } }, borrada: { fecha: 'antes', viejo: { en: 'x' } } };
  const r = reconciliar(previos, { a: { es: 'uno', en: 'one' } }, { a: { es: 'uno', en: '[PENDIENTE] y' } }, 'F');
  assert.deepEqual(r, { a: { fecha: 'antes', viejo: { en: 'x' } } });
});

test('el cambio en español registra el pendiente en el mismo commit', async () => {
  const base = github.head;
  const { commit } = await cambiarSub('Nueva bajada');
  assert.deepEqual(github.commits.get(commit).padres, [base]);
  assert.match(github.commits.get(commit).mensaje, /traducciones-pendientes\.json/);
  const { fecha, viejo } = lista()['hero.sub'];
  assert.ok(!Number.isNaN(Date.parse(fecha)));
  assert.deepEqual(viejo, { en: subOriginal, pt: subOriginal, ru: subOriginal, zh: subOriginal });
});

test('guardar el mismo texto no registra nada', async () => {
  const { commit } = await guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: ES, texto: iniciales[ES] }] });
  assert.ok(!github.commits.get(commit).mensaje.includes('traducciones-pendientes'));
  assert.deepEqual(lista(), {});
});

test('la lista se recalcula sobre lo último: no choca con otro guardado ni lo pisa', async () => {
  const base = github.head;
  const ajena = { 'stats.s1_label': { fecha: 'antes', viejo: { en: 'x' } } };
  github.avanzar(ARCHIVO_PENDIENTES, JSON.stringify({ pendientes: ajena }));
  await guardarCambios(env, { base, autor: editor, archivos: [{ ruta: ES, texto: conSub(ES, 'Mía') }] });
  assert.deepEqual(Object.keys(lista()).sort(), ['hero.sub', 'stats.s1_label']);
});

test('una clave nueva en español queda pendiente y no rompe los otros idiomas', () => {
  const r = reconciliar({}, {}, { 'hero.nueva': { es: 'Texto nuevo' } }, 'F');
  assert.deepEqual(r['hero.nueva'].viejo, { en: '', pt: '', ru: '', zh: '' });
});

test('nadie escribe ni lee la lista directo, ni un admin', async () => {
  const archivos = [{ ruta: ARCHIVO_PENDIENTES, texto: '{"pendientes": {}}\n' }];
  for (const autor of [admin, editor]) {
    await assert.rejects(guardarCambios(env, { base: github.head, autor, archivos }), DatosInvalidos);
    await assert.rejects(leerParaEditar(env, ARCHIVO_PENDIENTES, null, autor.rol), DatosInvalidos);
  }
});

test('un editor no ve ni escribe otros idiomas; sin rol, tampoco', async () => {
  const sinRol = { usuario: 'x', nombre: 'X' };
  for (const autor of [editor, sinRol]) {
    await assert.rejects(guardarCambios(env, { base: github.head, autor, archivos: [{ ruta: EN, texto: iniciales[EN] }] }), Prohibido);
    await assert.rejects(leerParaEditar(env, EN, null, autor.rol), Prohibido);
    await assert.rejects(traducir({ 'hero.sub': { en: 'x' } }, autor), Prohibido);
  }
  assert.equal((await leerParaEditar(env, EN, null, 'admin')).ruta, EN);
});

test('un editor recibe equipo.json sólo en español', async () => {
  const { texto } = await leerParaEditar(env, EQUIPO, null, 'editor');
  for (const abogado of JSON.parse(texto).abogados) {
    for (const campo of ['cargo', 'idiomas', 'biografia']) assert.deepEqual(Object.keys(abogado[campo]), ['es']);
  }
  const { texto: completo } = await leerParaEditar(env, EQUIPO, null, 'admin');
  assert.equal(completo, iniciales[EQUIPO]);
});

test('lo que un editor guarda en equipo.json conserva las traducciones y registra el pendiente', async () => {
  const { commit, texto } = await leerParaEditar(env, EQUIPO, null, 'editor');
  const datos = JSON.parse(texto);
  datos.abogados[0].cargo.es = 'Socia';
  datos.abogados[0].biografia.en = 'Metido por el editor';
  await guardarCambios(env, { base: commit, autor: editor, archivos: [{ ruta: EQUIPO, texto: JSON.stringify(datos) }] });
  const original = JSON.parse(iniciales[EQUIPO]).abogados[0];
  const ahora = leerHead(EQUIPO).abogados[0];
  assert.equal(ahora.cargo.es, 'Socia');
  assert.equal(ahora.cargo.en, original.cargo.en);
  assert.equal(ahora.biografia.en, original.biografia.en);
  assert.deepEqual(Object.keys(lista()), ['equipo:abogado-1.cargo']);
});

test('un abogado nuevo de un editor queda pendiente, y sin id no entra', async () => {
  const { commit, texto } = await leerParaEditar(env, EQUIPO, null, 'editor');
  const datos = JSON.parse(texto);
  const nuevo = { ...datos.abogados[0], id: 'abogado-nuevo', cargo: { es: 'Socia' }, biografia: { es: 'Una' }, idiomas: { es: '' } };
  await assert.rejects(guardarCambios(env, {
    base: commit, autor: editor, archivos: [{ ruta: EQUIPO, texto: JSON.stringify({ abogados: [...datos.abogados, { ...nuevo, id: undefined }] }) }],
  }), DatosInvalidos);
  await guardarCambios(env, { base: commit, autor: editor, archivos: [{ ruta: EQUIPO, texto: JSON.stringify({ abogados: [...datos.abogados, nuevo] }) }] });
  assert.deepEqual(lista()['equipo:abogado-nuevo.cargo'].viejo, { en: '', pt: '', ru: '', zh: '' });
  assert.equal(leerHead(EQUIPO).abogados.at(-1).cargo.en, '');
});

test('la lista para la pantalla trae viejo, nuevo y qué idiomas se publican', async () => {
  await cambiarSub('Nueva bajada');
  const { commit, pendientes } = await listarTraducciones(env);
  assert.equal(commit, github.head);
  const [item] = pendientes;
  assert.equal(item.clave, 'hero.sub');
  assert.equal(item.nuevo, 'Nueva bajada');
  const en = item.idiomas.find((i) => i.codigo === 'en');
  assert.equal(en.viejo, subOriginal);
  assert.equal(en.actual, JSON.parse(iniciales[EN]).hero.sub);
  assert.equal(en.publicado, true);
  assert.equal(item.idiomas.find((i) => i.codigo === 'ru').publicado, false);
  assert.equal(item.idiomas.find((i) => i.codigo === 'ru').actual, '', 'hero.sub en ruso está marcado como pendiente');
});

test('traducir y dar de baja van en un solo commit, de a un idioma', async () => {
  await cambiarSub('Nueva bajada');
  const base = github.head;
  const { commit } = await traducir({ 'hero.sub': { en: 'New subtitle', pt: 'Nova chamada', ru: '  ' } });
  assert.deepEqual(github.commits.get(commit).padres, [base]);
  assert.equal(github.head, commit);
  assert.equal(leerHead(EN).hero.sub, 'New subtitle');
  assert.deepEqual(Object.keys(lista()['hero.sub'].viejo), ['ru', 'zh'], 'ru y zh siguen pendientes sin trabar nada');
  await traducir({ 'hero.sub': { ru: 'Подзаголовок', zh: '副标题' } });
  assert.deepEqual(lista(), {});
});

test('dar por buena la traducción que ya estaba la saca de la lista', async () => {
  await cambiarSub('Nueva bajada');
  await traducir({ 'hero.sub': { en: JSON.parse(iniciales[EN]).hero.sub } });
  assert.equal(leerHead(EN).hero.sub, JSON.parse(iniciales[EN]).hero.sub);
  assert.ok(!('en' in lista()['hero.sub'].viejo));
});

test('una traducción de equipo.json entra por id', async () => {
  const { commit, texto } = await leerParaEditar(env, EQUIPO, null, 'editor');
  const datos = JSON.parse(texto);
  datos.abogados[1].cargo.es = 'Socio';
  await guardarCambios(env, { base: commit, autor: editor, archivos: [{ ruta: EQUIPO, texto: JSON.stringify(datos) }] });
  const { pendientes } = await listarTraducciones(env);
  assert.match(pendientes[0].titulo, /· Cargo$/);
  await traducir({ 'equipo:abogado-2.cargo': { en: 'Partner' } });
  assert.equal(leerHead(EQUIPO).abogados[1].cargo.en, 'Partner');
  assert.equal(leerHead(EQUIPO).abogados[1].cargo.es, 'Socio');
  assert.ok(!('en' in lista()['equipo:abogado-2.cargo'].viejo));
});

test('una clave pendiente que falta en el idioma se crea al traducirla, aunque no esté en la lista cerrada', async () => {
  github.avanzar(ES, editar(ES, (d) => { d.hero.nueva = 'Texto nuevo'; }));
  github.avanzar(ARCHIVO_PENDIENTES, JSON.stringify({ pendientes: { 'hero.nueva': { fecha: 'antes', viejo: { en: '', pt: '', ru: '', zh: '' } } } }));
  await traducir({ 'hero.nueva': { en: 'New text' } });
  assert.equal(leerHead(EN).hero.nueva, 'New text');
});

test('traducciones que no se aceptan', async () => {
  await cambiarSub('Nueva bajada');
  const head = github.head;
  for (const textos of [
    {},
    { 'hero.sub': { en: '   ' } },
    { 'hero.sub': { en: '[PENDIENTE] x' } },
    { 'hero.sub': { en: '<script>alert(1)</script>' } },
    { 'hero.sub': { es: 'Por acá no' } },
    { 'stats.s1_label': { en: 'No está pendiente' } },
  ]) await assert.rejects(traducir(textos), DatosInvalidos, JSON.stringify(textos));
  assert.equal(github.head, head);
});

test('si el español cambió mientras se traducía, avisa y no guarda', async () => {
  await cambiarSub('Primera');
  const base = github.head;
  await cambiarSub('Segunda');
  const head = github.head;
  await assert.rejects(traducir({ 'hero.sub': { en: 'First' } }, admin, base), (e) => e instanceof Conflicto && e.archivos.includes('hero.sub'));
  assert.equal(github.head, head);
});

test('el peor guardado no pasa de 50 subpedidos: base vieja, cuatro idiomas y una carrera que obliga a reintentar', async () => {
  await cambiarSub('Nueva bajada');
  const base = github.head;
  github.avanzar('src/template.html', iniciales['src/template.html']);
  github.pedidos = [];
  github.antesDeMover = () => github.avanzar('src/template.html', iniciales['src/template.html']);
  await traducir({ 'hero.sub': { en: 'New', pt: 'Nova', ru: 'Новый', zh: '新' } }, admin, base);
  assert.equal(github.pedidos.filter((p) => p.startsWith('POST') && p.endsWith('/git/commits')).length, 2, 'tuvo que reintentar');
  assert.ok(github.pedidos.length <= 50, `${github.pedidos.length} subpedidos`);
  process.stdout.write(`# peor caso: ${github.pedidos.length} subpedidos\n`);
});
