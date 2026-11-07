// Corre en Node, fuera de workerd: levanta el GitHub simulado con los archivos reales del repo.
import { readFileSync } from 'node:fs';
import { GitHubSimulado } from '../github-simulado.mjs';

export const PUERTO_GITHUB = 8792;
const RUTAS = [...['es', 'en', 'pt', 'ru', 'zh'].map((c) => `src/content.${c}.json`),
  'src/equipo.json', 'src/template.html', 'src/privacy-template.html', 'src/404-template.html', 'src/traducciones-pendientes.json'];

export default async function () {
  const raiz = new URL('../../../', import.meta.url);
  const github = new GitHubSimulado(Object.fromEntries(RUTAS.map((r) => [r, readFileSync(new URL(r, raiz), 'utf8')])));
  await github.iniciar(PUERTO_GITHUB);
  return () => github.cerrar();
}
