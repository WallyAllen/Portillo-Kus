// Archivos del panel, empaquetados como texto dentro del Worker (ver "rules" en wrangler.jsonc).
// Para sumar una pantalla: importarla acá y agregarla a ARCHIVOS y a PANTALLAS en cliente/app.js.
import { respuesta } from '../http.js';
import pagina from './pagina.html';
import estilos from './estilos.css';
import app from './cliente/app.js';
import inicio from './cliente/pantallas/inicio.js';
import traducciones from './cliente/pantallas/traducciones.js';

const JS = 'text/javascript; charset=utf-8';
const ARCHIVOS = {
  '/panel/estilos.css': [estilos, 'text/css; charset=utf-8'],
  '/panel/app.js': [app, JS],
  '/panel/pantallas/inicio.js': [inicio, JS],
  '/panel/pantallas/traducciones.js': [traducciones, JS],
};

export function manejarPanel(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return respuesta('', 'text/plain', 405, { Allow: 'GET, HEAD' });
  const { pathname } = new URL(request.url);
  if (pathname === '/panel' || pathname === '/panel/') return respuesta(pagina, 'text/html; charset=utf-8');
  const archivo = ARCHIVOS[pathname];
  return archivo ? respuesta(...archivo) : respuesta('No existe.', 'text/plain; charset=utf-8', 404);
}
