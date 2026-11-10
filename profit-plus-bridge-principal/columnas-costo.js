/**
 * Profit Plus guarda el costo de cada artículo en varias columnas de art: el
 * último costo (el de la última compra o entrada) y el costo promedio, cada
 * uno en la moneda de la empresa y en la "otra moneda". Cuáles hay y cómo se
 * llaman cambia entre versiones de Profit, así que el bridge no elige una:
 * manda todas las de costo que encuentre, con su nombre, y la web decide
 * cuál usa. Si la que usa resulta ser la equivocada (otra moneda, por
 * ejemplo), se corrige en la web sin tener que volver a actualizar el bridge
 * en la PC de la tienda.
 */

/** Tipos de SQL Server que guardan un número. */
const TIPOS_NUMERICOS = new Set([
  'decimal',
  'numeric',
  'money',
  'smallmoney',
  'float',
  'real',
  'int',
  'bigint',
  'smallint',
  'tinyint',
]);

/** Más que esto ya no es el costo de un artículo: es otra cosa que se llama
 * parecido, y cada una pesa en el catálogo de miles de artículos. */
const MAX_COLUMNAS = 12;

/** Las columnas de art que guardan un costo: numéricas y con "cos" en el
 * nombre (ult_cos_un, cos_pro_un, ult_cos_om…), o que se llaman como el
 * código de un costo en Profit (ULOM, el último costo en otra moneda), en
 * el orden de la tabla. Solo nombres de columna normales: van entre
 * corchetes en la consulta. */
function elegirColumnasCosto(columnas) {
  return columnas
    .filter(
      ({ nombre, tipo }) =>
        (/cos/i.test(nombre) || /^ulom$/i.test(nombre)) &&
        /^[A-Za-z0-9_]+$/.test(nombre) &&
        TIPOS_NUMERICOS.has(String(tipo ?? '').toLowerCase()),
    )
    .map(({ nombre }) => nombre)
    .slice(0, MAX_COLUMNAS);
}

module.exports = { elegirColumnasCosto };
