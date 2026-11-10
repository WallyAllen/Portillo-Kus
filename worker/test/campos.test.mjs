// Lista cerrada, caracteres peligrosos y fotos, en el servidor. Y que los avisos del navegador
// (pantallas/revisar.js) digan lo mismo que el servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { definicion, revisarContenido } from '../campos.js';
import { DatosInvalidos, guardarCambios, guardarTraducciones } from '../guardado.js';
import { revisarResena, revisarTexto } from '../panel/cliente/pantallas/revisar.js';
import { ARCHIVO_PENDIENTES } from '../traducciones.js';
import { GitHubSimulado } from './github-simulado.mjs';

const raiz = new URL('../../', import.meta.url);
const delRepo = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const RUTAS = ['src/content.es.json', 'src/content.en.json', 'src/content.pt.json', 'src/content.ru.json', 'src/content.zh.json',
  'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', ARCHIVO_PENDIENTES];
const iniciales = Object.fromEntries(RUTAS.map((r) => [r, delRepo(r)]));
const ES = 'src/content.es.json';
const EN = 'src/content.en.json';
const admin = { usuario: 'admin', nombre: 'Admin', rol: 'admin' };
const editor = { usuario: 'editor', nombre: 'Editor', rol: 'editor' };
const jpeg = readFileSync(new URL('portillo-images/area-laboral.jpg', raiz)).toString('base64');

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

const editar = (ruta, cambio) => {
  const datos = JSON.parse(String(github.leerEnHead(ruta)));
  cambio(datos);
  return `${JSON.stringify(datos, null, 2)}\n`;
};
const guardarEs = (cambio, autor = editor) => guardarCambios(env, { base: github.head, autor, archivos: [{ ruta: ES, texto: editar(ES, cambio) }] });
const rechaza = async (promesa, parecido) => {
  const head = github.head;
  await assert.rejects(promesa, (e) => e instanceof DatosInvalidos && e.errores.some((t) => parecido.test(t)), String(parecido));
  assert.equal(github.head, head, 'no se escribió nada');
};

test('un campo de la lista se guarda', async () => {
  await guardarEs((d) => { d.ciudadania.step1 = '1. Otra consulta.'; });
  assert.equal(JSON.parse(String(github.leerEnHead(ES))).ciudadania.step1, '1. Otra consulta.');
});

test('una clave fuera de la lista se rechaza con cualquier rol', async () => {
  for (const autor of [editor, admin]) {
    await rechaza(guardarEs((d) => { d.hero.eyebrow = 'Otro'; }, autor), /hero\.eyebrow.*no se puede editar/);
    await rechaza(guardarEs((d) => { d.meta.title = 'Otro'; }, autor), /meta\.title.*no se puede editar/);
    await rechaza(guardarEs((d) => { d.hero.nueva = 'Otro'; }, autor), /hero\.nueva.*no se puede editar/);
    await rechaza(guardarEs((d) => { delete d.hero.eyebrow; }, autor), /hero\.eyebrow.*no se puede editar/);
  }
});

test('también vale para otro idioma por /api/guardar', async () => {
  await rechaza(guardarCambios(env, { base: github.head, autor: admin, archivos: [{ ruta: EN, texto: editar(EN, (d) => { d.hero.eyebrow = 'x'; }) }] }), /no se puede editar/);
});

test('el largo máximo se respeta', async () => {
  await rechaza(guardarEs((d) => { d.hero.title = 'x'.repeat(71); }), /Título principal.*70/);
  await guardarEs((d) => { d.hero.title = 'x'.repeat(70); });
});

test('un campo de la lista no puede quedar vacío', async () => {
  await rechaza(guardarEs((d) => { d.ciudadania.step2 = '   '; }), /Paso 2.*vacío/);
});

test('"<" se rechaza en todo texto que entra, con un mensaje entendible', async () => {
  await rechaza(guardarEs((d) => { d.hero.sub = 'Hola <script>alert(1)</script>'; }), /Texto debajo del título.*</);
  await rechaza(guardarEs((d) => { d.opiniones.r1_text = 'Muy bien <img src=x onerror=alert(1)>'; d.opiniones.r1_name = 'Ana'; }), /Reseña 1: texto.*</);
  await rechaza(guardarCambios(env, { base: github.head, autor: admin, archivos: [{ ruta: EN, texto: editar(EN, (d) => { d.hero.sub = '<b>x</b>'; }) }] }), /</);
});

test('en una traducción también, y en una descripción tampoco comillas', async () => {
  const conPendientes = { pendientes: {
    'hero.sub': { fecha: 'f', viejo: { en: 'x' } },
    'need.c1_alt': { fecha: 'f', viejo: { en: 'x' } },
  } };
  github.avanzar(ARCHIVO_PENDIENTES, JSON.stringify(conPendientes));
  await rechaza(guardarTraducciones(env, { base: github.head, autor: admin, textos: { 'hero.sub': { en: '<script>' } } }), /</);
  await rechaza(guardarTraducciones(env, { base: github.head, autor: admin, textos: { 'need.c1_alt': { en: 'x" onerror="alert(1)' } } }), /comillas/);
  await guardarTraducciones(env, { base: github.head, autor: admin, textos: { 'hero.sub': { en: 'Con "comillas" sí' } } });
});

test('una reseña con texto necesita autor', async () => {
  await rechaza(guardarEs((d) => { d.opiniones.r2_text = 'Muy buena atención'; d.opiniones.r2_name = ''; }), /Reseña 2.*autor/);
  await rechaza(guardarEs((d) => { d.opiniones.r2_text = 'Muy buena atención'; }), /autor|r2_name/);
  await guardarEs((d) => { d.opiniones.r2_text = 'Muy buena atención'; d.opiniones.r2_name = 'Ana'; });
  assert.ok(JSON.parse(String(github.leerEnHead(ARCHIVO_PENDIENTES))).pendientes['opiniones.r2_text']);
});

test('una reseña sin publicar sigue oculta y se puede vaciar', async () => {
  await guardarEs((d) => { d.opiniones.r3_text = '[PENDIENTE] Otro borrador'; });
  await guardarEs((d) => { d.opiniones.r3_text = ''; d.opiniones.r3_name = ''; });
});

test('una foto de servicio va junto con su descripción nueva', async () => {
  const ruta = 'portillo-images/area-laboral.jpg';
  await rechaza(guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta, base64: jpeg }] }), /Laboral.*descripción/);
  await rechaza(guardarCambios(env, {
    base: github.head, autor: editor, archivos: [{ ruta, base64: jpeg }, { ruta: ES, texto: editar(ES, () => {}) }],
  }), /Laboral.*descripción/);
  await rechaza(guardarCambios(env, {
    base: github.head, autor: editor, archivos: [{ ruta, base64: jpeg }, { ruta: ES, texto: editar(ES, (d) => { d.areas.a1_alt = 'Con " comillas'; }) }],
  }), /comillas/);
  const { commit } = await guardarCambios(env, {
    base: github.head, autor: editor, archivos: [{ ruta, base64: jpeg }, { ruta: ES, texto: editar(ES, (d) => { d.areas.a1_alt = 'Una foto nueva'; }) }],
  });
  assert.ok(github.commits.get(commit).mensaje.includes(ruta));
  assert.deepEqual(Object.keys(JSON.parse(String(github.leerEnHead(ARCHIVO_PENDIENTES))).pendientes), ['areas.a1_alt']);
});

test('una foto sólo va a los nombres esperados', async () => {
  const alt = { ruta: ES, texto: editar(ES, (d) => { d.areas.a1_alt = 'Otra'; }) };
  for (const nombre of ['hero.jpg', 'logo.png', 'ciudadania.jpg', 'og.jpg', 'cualquiera.jpg', 'area-nueva.jpg', 'area-laboral.png', '../src/build.py', 'abogado-Mayus.jpg', 'abogado-a/b.jpg']) {
    await rechaza(guardarCambios(env, { base: github.head, autor: admin, archivos: [{ ruta: `portillo-images/${nombre}`, base64: jpeg }, alt] }), /no se puede editar/);
  }
});

test('una foto de abogado tiene que ser de alguien de la lista', async () => {
  await rechaza(guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: 'portillo-images/abogado-nadie.jpg', base64: jpeg }] }), /ningún abogado/);
  await guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: 'portillo-images/abogado-1.jpg', base64: jpeg }] });
});

test('el campo foto sale del id del abogado, no de otro nombre', async () => {
  const con = (foto) => editar('src/equipo.json', (d) => { d.abogados[0].foto = foto; });
  await rechaza(guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: 'src/equipo.json', texto: con('abogado-otro.jpg') }] }), /tiene que llamarse abogado-1\.jpg/);
  await rechaza(guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: 'src/equipo.json', texto: con('hero.jpg') }] }), /tiene que llamarse/);
  await guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta: 'portillo-images/abogado-1.jpg', base64: jpeg }, { ruta: 'src/equipo.json', texto: con('abogado-1.jpg') }] });
});

test('una imagen cortada o de otro tipo no llega', async () => {
  const ruta = 'portillo-images/abogado-1.jpg';
  const cortada = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
  const png = Buffer.from('\x89PNG\r\n\x1a\n00000000', 'latin1').toString('base64');
  const sinImagen = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]).toString('base64');
  const sobredimensionada = readFileSync(new URL('portillo-images/hero.jpg', raiz)).toString('base64');
  for (const base64 of [cortada, png, sinImagen, sobredimensionada, 'no es base64!', Buffer.from('<svg onload=alert(1)>').toString('base64')]) {
    await rechaza(guardarCambios(env, { base: github.head, autor: editor, archivos: [{ ruta, base64 }] }), /JPG entera/);
  }
});

test('foto más JSON con base vieja y carrera entra en el límite de subpedidos', async () => {
  const base = github.head;
  const archivos = [
    { ruta: 'portillo-images/area-laboral.jpg', base64: jpeg },
    { ruta: ES, texto: editar(ES, (d) => { d.areas.a1_alt = 'Una foto nueva'; }) },
  ];
  github.avanzar('src/template.html', iniciales['src/template.html']);
  github.pedidos = [];
  github.antesDeMover = () => github.avanzar('src/template.html', iniciales['src/template.html']);
  await guardarCambios(env, { base, autor: editor, archivos });
  assert.ok(github.pedidos.length <= 50, `${github.pedidos.length} subpedidos`);
  process.stdout.write(`# foto más JSON, peor caso: ${github.pedidos.length} subpedidos\n`);
});

test('el navegador avisa lo mismo que el servidor sobre un texto', () => {
  const es = JSON.parse(iniciales[ES]);
  const conValor = (clave, valor) => {
    const copia = structuredClone(es);
    const partes = clave.split('.');
    const ultima = partes.pop();
    partes.reduce((n, p) => n[p], copia)[ultima] = valor;
    return copia;
  };
  const campos = [
    ...definicion.textos,
    ...definicion.fotos.lista.map((f) => ({ clave: f.clave, largo: definicion.fotos.largoDescripcion, atributo: true })),
  ];
  for (const campo of campos) {
    for (const valor of ['Un texto cualquiera', '', '   ', 'con <', 'con "comillas"', 'x'.repeat(campo.largo), 'x'.repeat(campo.largo + 1)]) {
      const servidor = revisarContenido('es', es, conValor(campo.clave, valor)).length > 0;
      const navegador = revisarTexto(valor, campo) !== null;
      assert.equal(navegador, servidor, `${campo.clave} con ${JSON.stringify(valor.slice(0, 20))}`);
    }
  }
});

test('el navegador avisa lo mismo que el servidor sobre una reseña', () => {
  const es = JSON.parse(iniciales[ES]);
  const { largoTexto, largoAutor } = definicion.resenas;
  for (const [texto, autor] of [['Muy bien', 'Ana'], ['Muy bien', ''], ['con <', 'Ana'], ['Muy bien', 'con <'], ['x'.repeat(largoTexto + 1), 'Ana'], ['Muy bien', 'x'.repeat(largoAutor + 1)]]) {
    const copia = structuredClone(es);
    copia.opiniones.r1_text = texto;
    copia.opiniones.r1_name = autor;
    const servidor = revisarContenido('es', es, copia).length > 0;
    const navegador = Object.keys(revisarResena({ texto, autor, publicada: true }, definicion.resenas)).length > 0;
    assert.equal(navegador, servidor, JSON.stringify([texto.slice(0, 20), autor.slice(0, 20)]));
  }
});
