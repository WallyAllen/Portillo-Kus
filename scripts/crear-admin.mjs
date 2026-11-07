#!/usr/bin/env node
// Crea un usuario del panel con `wrangler d1 execute`. La contraseña se pide sin mostrarla y
// no pasa por la línea de comandos ni por el historial; a D1 sólo llega su hash.
//
//   node scripts/crear-admin.mjs --usuario felipe --nombre "Felipe" --remote
//   node scripts/crear-admin.mjs --usuario prueba --nombre "Prueba" --local --env dev
//
// Opcionales: --rol editor (por defecto admin), --persist-to <carpeta> (con --local).
// PANEL_CONTRASENA la da por variable de entorno: sólo para pruebas automáticas.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { hashContrasena } from '../worker/auth.js';

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function preguntarOculto(texto) {
  return new Promise((resolver) => {
    const lector = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    lector.question(texto, (respuesta) => {
      lector.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
    lector._writeToOutput = () => {}; // después del texto de la pregunta: no repite lo que se escribe
  });
}

async function pedirContrasena() {
  if (process.env.PANEL_CONTRASENA) return process.env.PANEL_CONTRASENA;
  if (!process.stdin.isTTY) salir('Hace falta una terminal interactiva para pedir la contraseña.');
  const primera = await preguntarOculto('Contraseña (mínimo 12 caracteres): ');
  const segunda = await preguntarOculto('Repetila: ');
  if (primera !== segunda) salir('Las contraseñas no coinciden.');
  return primera;
}

const comilla = (texto) => `'${texto.replaceAll("'", "''")}'`;

const { values: op } = parseArgs({
  options: {
    usuario: { type: 'string' },
    nombre: { type: 'string' },
    rol: { type: 'string', default: 'admin' },
    local: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
    env: { type: 'string' },
    'persist-to': { type: 'string' },
  },
});

if (!op.usuario || !op.nombre) salir('Uso: node scripts/crear-admin.mjs --usuario <usuario> --nombre "<nombre>" (--local | --remote)');
if (op.local === op.remote) salir('Indicá --local o --remote.');
const usuario = op.usuario.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) salir('El usuario lleva de 3 a 40 letras, números, punto, guion o guion bajo.');
if (!['admin', 'editor'].includes(op.rol)) salir('El rol es admin o editor.');

const contrasena = await pedirContrasena();
if (contrasena.length < 12) salir('La contraseña debe tener al menos 12 caracteres.');
if (contrasena.length > 200) salir('La contraseña no puede pasar de 200 caracteres.');

const sql = `INSERT INTO users (usuario, nombre, hash, rol, activo, creado) VALUES (${comilla(usuario)}, ${comilla(op.nombre.trim())}, `
  + `${comilla(await hashContrasena(contrasena))}, ${comilla(op.rol)}, 1, ${Date.now()});\n`;

const carpeta = mkdtempSync(join(tmpdir(), 'panel-admin-'));
try {
  const archivo = join(carpeta, 'usuario.sql');
  writeFileSync(archivo, sql, { mode: 0o600 });
  const argumentos = ['npx', '--yes', 'wrangler@4', 'd1', 'execute', 'DB', op.remote ? '--remote' : '--local', `--file="${archivo}"`];
  if (op.env) argumentos.push('--env', op.env);
  if (op['persist-to']) argumentos.push(`--persist-to="${op['persist-to']}"`);
  // shell: en Windows npx es un .cmd. La contraseña y el nombre no van en esta línea, sólo en el archivo.
  const resultado = spawnSync(argumentos.join(' '), { stdio: 'inherit', shell: true });
  if (resultado.status !== 0) salir('No se pudo crear el usuario. Si ya existe, el usuario está repetido.');
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
console.log(`Usuario ${usuario} (${op.rol}) creado.`);
