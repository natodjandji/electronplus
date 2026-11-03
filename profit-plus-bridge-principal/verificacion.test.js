const test = require('node:test');
const assert = require('node:assert');
const { deProfit, existencias, verificar, informe } = require('./verificacion');

/** Una fila de art como la devuelve SQL Server: char() rellenos de espacios. */
const fila = (extra = {}) => ({
  co_art: 'A001      ',
  ref: '7591234567890  ',
  modelo: 'LU-9W   ',
  art_des: 'Bombillo LED 9W   ',
  co_lin: '01  ',
  lin_des: 'Bombillos   ',
  co_cat: '001 ',
  cat_des: 'Lucerna  ',
  prec_vta1: 3.5,
  prec_vta2: 2.75,
  ...extra,
});

/** Lo que manda el bridge de ese mismo artículo. */
const delBridge = (extra = {}) => ({
  codigo: 'A001',
  referencia: '7591234567890',
  modelo: 'LU-9W',
  descripcion: 'Bombillo LED 9W',
  categoriaCodigo: '01',
  categoria: 'Bombillos',
  marcaCodigo: '001',
  marca: 'Lucerna',
  stock: 12,
  precio1: 3.5,
  precio2: 2.75,
  ...extra,
});

/** Y lo que publica la web. */
const deLaWeb = (extra = {}) => ({
  sku: '7591234567890',
  model: 'LU-9W',
  name: 'Bombillo LED 9W',
  category: { label: 'Bombillos' },
  brand: 'Lucerna',
  stock: 12,
  retailPrice: 3.5,
  wholesalePrice: 2.75,
  ...extra,
});

const respuesta = (productos, extra = { columnaSku: 'modelo' }) => ({ total: productos.length, ...extra, productos });

test('lee el artículo de Profit como lo debe mostrar la web', () => {
  assert.deepStrictEqual(deProfit(fila(), 12), {
    codigo: 'A001',
    codigoDeBarra: '7591234567890',
    sku: 'LU-9W',
    nombre: 'Bombillo LED 9W',
    categoria: 'Bombillos',
    marca: 'Lucerna',
    stock: 12,
    precioDetal: 3.5,
    precioMayor: 2.75,
  });
  // Sin referencia, el código de barra es el código interno; sin nombres,
  // los de la web; sin Modelo, no hay SKU; el stock negativo es 0.
  const sinDatos = deProfit(fila({ ref: '  ', modelo: null, lin_des: null, cat_des: null }), -3);
  assert.strictEqual(sinDatos.codigoDeBarra, 'A001');
  assert.strictEqual(sinDatos.sku, null);
  assert.strictEqual(sinDatos.categoria, 'Categoría 01');
  assert.strictEqual(sinDatos.marca, 'Marca 001');
  assert.strictEqual(sinDatos.stock, 0);
});

test('suma la existencia de todos los almacenes, o solo la del indicado', () => {
  const filas = [
    { co_art: 'A001  ', co_alma: 'CCS ', stock_act: 10 },
    { co_art: 'a001', co_alma: 'VAL', stock_act: 2.5 },
    { co_art: 'B002', co_alma: 'CCS', stock_act: 4 },
  ];
  assert.strictEqual(existencias(filas)('A001'), 12.5);
  assert.strictEqual(existencias(filas, 'ccs')('A001'), 10);
  assert.strictEqual(existencias(filas)('C003'), 0);
});

test('todo igual: sin diferencias', () => {
  const profit = [deProfit(fila(), 12)];
  const resultado = verificar({ profit, bridge: respuesta([delBridge()]), web: [deLaWeb()] });
  assert.deepStrictEqual(resultado.bridge.difieren, []);
  assert.deepStrictEqual(resultado.web.difieren, []);
  const { lineas, problemas } = informe(resultado, { columnaSku: 'modelo' });
  assert.strictEqual(problemas, 0);
  assert.match(lineas.join('\n'), /Campo Modelo \(SKU\): art\.modelo — 1 con SKU, 0 sin SKU/);
  assert.match(lineas.at(-1), /todo lo que llega de Profit es correcto/);
});

test('dice qué campo difiere y cuál es el valor de cada lado', () => {
  const profit = [deProfit(fila(), 12)];
  const resultado = verificar({
    profit,
    bridge: respuesta([delBridge({ precio1: 3.4 })]),
    web: [deLaWeb({ model: null, stock: 11 })],
  });
  assert.deepStrictEqual(resultado.bridge.difieren, [
    { codigo: 'A001', cambios: [{ campo: 'precio detal', esperado: 3.5, real: 3.4 }] },
  ]);
  assert.deepStrictEqual(
    resultado.web.difieren[0].cambios.map((c) => c.campo),
    ['SKU', 'stock'],
  );
  const { lineas, problemas } = informe(resultado, { columnaSku: 'modelo' });
  assert.strictEqual(problemas, 2);
  assert.ok(lineas.includes('  A001: SKU "LU-9W" en Profit, null aquí; stock 12 en Profit, 11 aquí'));
});

test('no cuenta como diferencia menos de medio centavo', () => {
  const profit = [deProfit(fila({ prec_vta1: 3.4999 }), 12)];
  const resultado = verificar({ profit, bridge: respuesta([delBridge()]), web: [deLaWeb()] });
  assert.deepStrictEqual(resultado.bridge.difieren, []);
});

test('reconoce el bridge viejo, que no manda el SKU', () => {
  const profit = [deProfit(fila(), 12)];
  const viejo = respuesta([delBridge({ modelo: undefined })], {});
  const resultado = verificar({ profit, bridge: viejo, web: null });
  assert.strictEqual(resultado.bridge.anteriorA120, true);
  const { lineas, problemas } = informe(resultado, { columnaSku: 'modelo' });
  // El aviso del bridge viejo y la diferencia de SKU.
  assert.strictEqual(problemas, 2);
  assert.ok(lineas.some((l) => l.includes('anterior a la 1.2.0')));
});

test('lista lo que falta o sobra en el bridge y lo no publicado en la web', () => {
  const profit = [deProfit(fila(), 12), deProfit(fila({ co_art: 'B002', ref: '111' }), 1)];
  const resultado = verificar({
    profit,
    bridge: respuesta([delBridge(), delBridge({ codigo: 'Z999' })]),
    web: [deLaWeb()],
  });
  assert.deepStrictEqual(resultado.bridge.faltan, ['B002']);
  assert.deepStrictEqual(resultado.bridge.sobran, ['Z999']);
  assert.deepStrictEqual(resultado.web.noPublicados, ['B002']);
  // Lo no publicado no es un error por sí solo.
  assert.strictEqual(informe(resultado, { columnaSku: 'modelo' }).problemas, 2);
});

test('avisa los códigos de barra repetidos y no los compara con la web', () => {
  const profit = [deProfit(fila(), 12), deProfit(fila({ co_art: 'B002', modelo: 'OTRO' }), 1)];
  const resultado = verificar({ profit, bridge: null, web: [deLaWeb({ name: 'Otro nombre' })] });
  assert.deepStrictEqual(resultado.barrasRepetidas, ['7591234567890']);
  assert.deepStrictEqual(resultado.web.difieren, []);
  const { lineas } = informe(resultado, { columnaSku: 'modelo', errores: ['Bridge: no responde'] });
  assert.ok(lineas.some((l) => l.startsWith('Códigos de barra repetidos (corregir en Profit): 1 — 7591234567890')));
  assert.ok(lineas.includes('Bridge: no responde'));
  assert.match(lineas.join('\n'), /RESULTADO: 0 diferencia\(s\) y 1 error\(es\)/);
});

test('en la web, el stock puede sumar la tienda secundaria, pero no ser menor', () => {
  const profit = [deProfit(fila(), 0), deProfit(fila({ co_art: 'B002', ref: '111' }), 5)];
  const resultado = verificar({
    profit,
    bridge: null,
    web: [deLaWeb({ stock: 17 }), deLaWeb({ sku: '111', stock: 3 })],
  });
  assert.strictEqual(resultado.web.conSecundaria, 1);
  assert.deepStrictEqual(resultado.web.difieren, [
    { codigo: 'B002', cambios: [{ campo: 'stock', esperado: 5, real: 3 }] },
  ]);
  const { lineas } = informe(resultado, { columnaSku: 'modelo' });
  assert.ok(lineas.some((l) => l.startsWith('Con unidades de la tienda secundaria: 1 ')));
});
