// equipo.json por el panel: los avisos del navegador contra el servidor, y un abogado nuevo con una
// foto real hasta que build.py --produccion acepta lo que quedó en el repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { DatosInvalidos, fotoDeAbogado, guardarCambios } from '../guardado.js';
import { fotoDeAbogado as fotoEnNavegador, idNuevo, revisarAbogado } from '../panel/cliente/pantallas/revisar.js';
import { ARCHIVO_PENDIENTES } from '../traducciones.js';
import { GitHubSimulado } from './github-simulado.mjs';

const raiz = new URL('../../', import.meta.url);
const delRepo = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');
const IDIOMAS = ['es', 'en', 'pt', 'ru', 'zh'];
const RUTAS = [...IDIOMAS.map((c) => `src/content.${c}.json`), 'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', ARCHIVO_PENDIENTES];
const iniciales = Object.fromEntries(RUTAS.map((r) => [r, delRepo(r)]));
const EQUIPO = 'src/equipo.json';
const editor = { usuario: 'editor', nombre: 'Editor', rol: 'editor' };
const fotoReal = readFileSync(new URL('portillo-images/area-laboral.jpg', raiz)).toString('base64');

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

const textos = (es) => Object.fromEntries(IDIOMAS.map((c) => [c, c === 'es' ? es : '']));
const completo = (id, ajustes = {}) => ({
  id,
  publicado: true,
  nombre: 'Persona de Prueba',
  foto: fotoDeAbogado(id),
  matricula: 'T° 1 F° 2',
  linkedin: 'https://www.linkedin.com/in/prueba/',
  cargo: textos('Socia'),
  idiomas: textos('Español'),
  biografia: textos('Un párrafo.\n\nOtro párrafo.'),
  ...ajustes,
});
const equipoCon = (abogados) => `${JSON.stringify({ abogados }, null, 2)}\n`;
const leerEquipo = () => JSON.parse(String(github.leerEnHead(EQUIPO))).abogados;
const guardarEquipo = (abogados, extra = []) => guardarCambios(env, {
  base: github.head, autor: editor, archivos: [...extra, { ruta: EQUIPO, texto: equipoCon(abogados) }],
});

test('el nombre de la foto es el mismo en el navegador y en el servidor', () => {
  for (const id of ['abogado-1', 'abogado-ab12cd34', 'otro']) assert.equal(fotoEnNavegador(id), fotoDeAbogado(id));
  assert.match(fotoDeAbogado(idNuevo()), /^abogado-[0-9a-f]{8}\.jpg$/);
});

test('el navegador avisa lo mismo que el servidor sobre un abogado', async () => {
  const casos = {
    completo: {},
    'sin nombre': { nombre: ' ' },
    'nombre de muestra': { nombre: '[Abogado 1]' },
    'sin foto': { foto: '' },
    'sin cargo': { cargo: textos('') },
    'cargo de muestra': { cargo: textos('[Cargo]') },
    'sin biografía': { biografia: textos('') },
    'idiomas vacíos': { idiomas: textos('') },
    'idiomas de muestra': { idiomas: textos('[Idiomas]') },
    'matrícula vacía': { matricula: '' },
    'matrícula de muestra': { matricula: '[T° y F°]' },
    'sin linkedin': { linkedin: '' },
    'linkedin ajeno': { linkedin: 'https://ejemplo.com/' },
    'linkedin con script': { linkedin: 'javascript:alert(1)' },
    'borrador a medio hacer': { publicado: false, nombre: '', foto: '', cargo: textos(''), biografia: textos('') },
    'borrador con linkedin con script': { publicado: false, linkedin: 'javascript:alert(1)' },
  };
  for (const [nombre, ajustes] of Object.entries(casos)) {
    const abogado = completo('abogado-1', ajustes);
    const extra = abogado.foto ? [{ ruta: `portillo-images/${abogado.foto}`, base64: fotoReal }] : [];
    let servidor = false;
    try {
      await guardarEquipo([abogado], extra);
    } catch (e) {
      if (!(e instanceof DatosInvalidos)) throw e;
      servidor = true;
    }
    assert.equal(Object.keys(revisarAbogado(abogado)).length > 0, servidor, nombre);
  }
});

test('un editor agrega un abogado con foto y build.py --produccion acepta el resultado', async () => {
  const id = idNuevo();
  const espanolSolo = completo(id);
  for (const campo of ['cargo', 'idiomas', 'biografia']) espanolSolo[campo] = { es: espanolSolo[campo].es };
  await guardarEquipo([...leerEquipo(), espanolSolo], [{ ruta: `portillo-images/${fotoDeAbogado(id)}`, base64: fotoReal }]);
  assert.deepEqual(Object.keys(JSON.parse(String(github.leerEnHead(ARCHIVO_PENDIENTES))).pendientes).sort(),
    ['biografia', 'cargo', 'idiomas'].map((c) => `equipo:${id}.${c}`));

  const temporal = mkdtempSync(join(tmpdir(), 'panel-abogado-'));
  try {
    for (const carpeta of ['src', 'portillo-images']) cpSync(new URL(carpeta, raiz), join(temporal, carpeta), { recursive: true });
    for (const ruta of RUTAS) writeFileSync(join(temporal, ruta), github.leerEnHead(ruta));
    writeFileSync(join(temporal, 'portillo-images', fotoDeAbogado(id)), Buffer.from(fotoReal, 'base64'));
    const salida = spawnSync('python', [join(temporal, 'src/build.py'), '--produccion'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    assert.equal(salida.status, 0, salida.stderr);
    const portada = readFileSync(join(temporal, 'dist/index.html'), 'utf8');
    assert.ok(portada.includes('Persona de Prueba') && portada.includes(`portillo-images/abogado-${id.slice(8)}`));
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
});

test('corregir el nombre no cambia el archivo de la foto', async () => {
  await guardarEquipo([completo('abogado-1')], [{ ruta: 'portillo-images/abogado-1.jpg', base64: fotoReal }]);
  await guardarEquipo([{ ...leerEquipo()[0], nombre: 'Otro Nombre' }]);
  assert.equal(leerEquipo()[0].foto, 'abogado-1.jpg');
});

test('eliminar saca la entrada y sus pendientes, y deja la foto en el repo', async () => {
  await guardarEquipo([completo('abogado-1')], [{ ruta: 'portillo-images/abogado-1.jpg', base64: fotoReal }]);
  await guardarEquipo([]);
  assert.deepEqual(leerEquipo(), []);
  assert.deepEqual(JSON.parse(String(github.leerEnHead(ARCHIVO_PENDIENTES))).pendientes, {});
  assert.ok(github.leerEnHead('portillo-images/abogado-1.jpg'));
});

test('reordenar no crea pendientes', async () => {
  await guardarEquipo([...leerEquipo()].reverse());
  assert.deepEqual(leerEquipo().map((a) => a.id), ['abogado-3', 'abogado-2', 'abogado-1']);
  assert.deepEqual(JSON.parse(String(github.leerEnHead(ARCHIVO_PENDIENTES))).pendientes, {});
});

test('foto más equipo.json con base vieja y carrera entra en el límite de subpedidos', async () => {
  const base = github.head;
  const archivos = [
    { ruta: 'portillo-images/abogado-1.jpg', base64: fotoReal },
    { ruta: EQUIPO, texto: equipoCon(leerEquipo().map((a) => (a.id === 'abogado-1' ? { ...a, foto: 'abogado-1.jpg' } : a))) },
  ];
  github.avanzar('src/template.html', iniciales['src/template.html']);
  github.pedidos = [];
  github.antesDeMover = () => github.avanzar('src/template.html', iniciales['src/template.html']);
  await guardarCambios(env, { base, autor: editor, archivos });
  assert.ok(github.pedidos.length <= 50, `${github.pedidos.length} subpedidos`);
  process.stdout.write(`# foto de abogado más JSON, peor caso: ${github.pedidos.length} subpedidos\n`);
});
