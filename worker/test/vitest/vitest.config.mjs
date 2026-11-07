// Pruebas de la API dentro de workerd, el mismo runtime que producción, con la configuración real
// de wrangler.jsonc (entorno dev: D1 local) y el GitHub simulado de ../github-simulado.mjs.
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { PUERTO_GITHUB } from './github.global.mjs';

const desdeAca = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: desdeAca('../../../wrangler.jsonc'), environment: 'dev' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(desdeAca('../../migrations')),
          GITHUB_TOKEN: 'token-de-prueba',
          GITHUB_API_URL: `http://127.0.0.1:${PUERTO_GITHUB}`,
        },
      },
    }),
  ],
  test: {
    include: ['*.test.js'],
    globalSetup: ['./github.global.mjs'],
    setupFiles: ['./migraciones.js'],
    testTimeout: 30000,
  },
}));
