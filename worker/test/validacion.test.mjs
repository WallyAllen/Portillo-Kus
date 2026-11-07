// node --test "worker/test/*.test.mjs"
// Los mismos casos que tests/test_panel_reglas.py corre contra el build real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validarRepo } from '../validacion.js';

const raiz = new URL('../../', import.meta.url);
const leerDelRepo = (ruta) => {
  try {
    return readFileSync(new URL(ruta, raiz), 'utf8');
  } catch {
    return null;
  }
};
const { casos, imagenes, abogadoCompleto } = JSON.parse(leerDelRepo('tests/casos_validacion.json'));

function aplicar(archivos, cambio) {
  if ('abogados' in cambio) {
    const lista = cambio.abogados.map((ajustes) => {
      const abogado = { ...abogadoCompleto, ...ajustes };
      for (const clave of Object.keys(abogado)) if (abogado[clave] === null) delete abogado[clave];
      return abogado;
    });
    archivos['src/equipo.json'] = JSON.stringify({ abogados: lista });
    return;
  }
  if ('crudo' in cambio) {
    archivos[cambio.archivo] = cambio.crudo;
    return;
  }
  const datos = JSON.parse(archivos[cambio.archivo] ?? leerDelRepo(cambio.archivo));
  const camino = cambio.ruta.split('.');
  const ultima = camino.pop();
  const nodo = camino.reduce((n, parte) => n[parte], datos);
  if (cambio.borrar) delete nodo[ultima];
  else nodo[ultima] = cambio.valor;
  archivos[cambio.archivo] = JSON.stringify(datos);
}

for (const caso of casos) {
  test(`${caso.espera}: ${caso.nombre}`, async () => {
    const archivos = {};
    for (const cambio of caso.cambios) aplicar(archivos, cambio);
    const errores = await validarRepo({
      leer: (ruta) => archivos[ruta] ?? leerDelRepo(ruta),
      listarImagenes: async () => new Set(imagenes),
    });
    if (caso.espera === 'ok') assert.deepEqual(errores, []);
    else assert.notEqual(errores.length, 0, 'tenía que rechazarlo');
  });
}
