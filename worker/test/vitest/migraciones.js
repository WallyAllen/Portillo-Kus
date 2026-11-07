// Puede correr más de una vez: applyD1Migrations sólo aplica las que faltan.
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
