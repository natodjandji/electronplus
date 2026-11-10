const test = require('node:test');
const assert = require('node:assert');
const { elegirColumnasCosto } = require('./columnas-costo');

const col = (nombre, tipo = 'decimal') => ({ nombre, tipo });
const ART = [
  col('co_art', 'char'),
  col('art_des', 'varchar'),
  col('prec_vta1'),
  col('prec_vta2'),
  col('anulado', 'bit'),
];

test('toma las columnas de costo de Profit Plus Administrativo', () => {
  assert.deepStrictEqual(
    elegirColumnasCosto([
      ...ART,
      col('ult_cos_un'),
      col('cos_pro_un'),
      col('ult_cos_om'),
      col('cos_pro_om'),
    ]),
    ['ult_cos_un', 'cos_pro_un', 'ult_cos_om', 'cos_pro_om'],
  );
});

test('cualquier tipo numérico sirve, escriba la base el tipo como lo escriba', () => {
  assert.deepStrictEqual(
    elegirColumnasCosto([col('ULT_COS_UN', 'NUMERIC'), col('cos_pro_un', 'money'), col('costo', 'float')]),
    ['ULT_COS_UN', 'cos_pro_un', 'costo'],
  );
});

test('deja fuera las fechas y los textos aunque se llamen parecido', () => {
  assert.deepStrictEqual(
    elegirColumnasCosto([col('fec_cos_pro', 'smalldatetime'), col('cos_nota', 'varchar'), col('ult_cos_un')]),
    ['ult_cos_un'],
  );
});

test('también la que se llama como el código del costo (ULOM)', () => {
  assert.deepStrictEqual(elegirColumnasCosto([...ART, col('ULOM'), col('ulom_fecha', 'datetime')]), ['ULOM']);
});

test('sin columnas de costo, ninguna', () => {
  assert.deepStrictEqual(elegirColumnasCosto(ART), []);
  assert.deepStrictEqual(elegirColumnasCosto([]), []);
});

test('no acepta un nombre que no sea una columna normal', () => {
  assert.deepStrictEqual(elegirColumnasCosto([col('cos]; DROP TABLE art; --')]), []);
});

test('no pasa de doce columnas', () => {
  const muchas = Array.from({ length: 20 }, (_, n) => col(`cos_${n}`));
  assert.strictEqual(elegirColumnasCosto(muchas).length, 12);
});
