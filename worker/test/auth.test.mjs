import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csrfValido, hashContrasena, ITERACIONES, origenValido, verificarContrasena } from '../auth.js';

test('el hash lleva sal y las iteraciones pedidas, y verifica sólo la contraseña correcta', async () => {
  const hash = await hashContrasena('una-contrasena-de-prueba');
  assert.equal(ITERACIONES, 210000);
  assert.match(hash, /^pbkdf2-sha256\$210000\$[^$]+\$[^$]+$/);
  assert.notEqual(hash, await hashContrasena('una-contrasena-de-prueba'), 'cada hash lleva su sal');
  assert.equal(await verificarContrasena('una-contrasena-de-prueba', hash), true);
  assert.equal(await verificarContrasena('otra-contrasena', hash), false);
});

test('funciona con el tope de 100000 iteraciones por llamada de workerd', async () => {
  // `wrangler dev` y Node no aplican el tope: se simula para que esta garantía no dependa de producción.
  const original = crypto.subtle.deriveBits;
  const tramos = [];
  crypto.subtle.deriveBits = function (parametros, ...resto) {
    if (parametros.iterations > 100000) {
      throw new DOMException(`Pbkdf2 failed: iteration counts above 100000 are not supported (requested ${parametros.iterations}).`, 'NotSupportedError');
    }
    tramos.push(parametros.iterations);
    return original.call(this, parametros, ...resto);
  };
  try {
    const hash = await hashContrasena('una-contrasena-de-prueba');
    assert.deepEqual(tramos, [100000, 100000, 10000]);
    assert.equal(await verificarContrasena('una-contrasena-de-prueba', hash), true);
  } finally {
    crypto.subtle.deriveBits = original;
  }
});

test('hasta el tope es PBKDF2 estándar', async () => {
  const sal = Buffer.from('sal-de-prueba-16');
  const { pbkdf2Sync } = await import('node:crypto');
  const esperado = pbkdf2Sync('clave', sal, 1000, 32, 'sha256').toString('base64');
  assert.equal(await verificarContrasena('clave', `pbkdf2-sha256$1000$${sal.toString('base64')}$${esperado}`), true);
});

test('un hash con otro formato no entra', async () => {
  assert.equal(await verificarContrasena('x', 'md5$1$a$b'), false);
  assert.equal(await verificarContrasena('x', 'pbkdf2-sha256$0$AAAA$AAAA'), false);
});

test('origen y token CSRF', () => {
  const pedido = (encabezados) => new Request('https://sitio.test/api/x', { method: 'POST', headers: encabezados });
  assert.equal(origenValido(pedido({ Origin: 'https://sitio.test' })), true);
  assert.equal(origenValido(pedido({ Origin: 'https://otro.test' })), false);
  assert.equal(origenValido(pedido({})), false);
  const sesion = { csrf: 'abc' };
  assert.equal(csrfValido(pedido({ 'X-CSRF-Token': 'abc' }), sesion), true);
  assert.equal(csrfValido(pedido({ 'X-CSRF-Token': 'abd' }), sesion), false);
  assert.equal(csrfValido(pedido({}), sesion), false);
});
