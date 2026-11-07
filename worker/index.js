// Entrada del Worker. Sólo llegan acá /panel, /panel/* y /api/* (run_worker_first en
// wrangler.jsonc); el resto del sitio lo responde la capa de assets sin ejecutar este código.
import { manejarApi } from './api.js';
import { manejarPanel } from './panel/rutas.js';

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/panel' || pathname.startsWith('/panel/')) return manejarPanel(request);
    if (pathname.startsWith('/api/')) return manejarApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
