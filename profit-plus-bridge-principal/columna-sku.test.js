const test = require('node:test');
const assert = require('node:assert');
const { elegirColumnaSku } = require('./columna-sku');

const ART = ['co_art', 'art_des', 'ref', 'co_lin', 'co_cat', 'prec_vta1', 'anulado'];

test('toma la columna modelo de Profit Plus Administrativo, escriba como la escriba la base', () => {
  assert.strictEqual(elegirColumnaSku([...ART, 'modelo']), 'modelo');
  assert.strictEqual(elegirColumnaSku([...ART, 'MODELO']), 'MODELO');
});

test('prefiere el nombre exacto y, si no, una columna que lo contenga', () => {
  assert.strictEqual(elegirColumnaSku([...ART, 'co_modelo', 'modelo']), 'modelo');
  assert.strictEqual(elegirColumnaSku([...ART, 'art_modelo']), 'art_modelo');
});

test('sin campo Modelo, ninguna', () => {
  assert.strictEqual(elegirColumnaSku(ART), null);
  assert.strictEqual(elegirColumnaSku([]), null);
});

test('no acepta un nombre que no sea una columna normal', () => {
  assert.strictEqual(elegirColumnaSku([...ART, 'modelo]; DROP TABLE art; --']), null);
});
