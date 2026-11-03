/**
 * El SKU de la tienda va en el campo MODELO del artículo. Su columna en la
 * tabla art se busca en la base, entre las que tiene, en vez de suponer su
 * nombre: así una versión de Profit que lo llame distinto no deja a la web
 * sin SKU, ni rompe la consulta.
 */

/** Cómo puede llamarse, en orden: el de Profit Plus Administrativo primero. */
const COLUMNAS_MODELO = ['modelo', 'model', 'co_modelo'];

/** La columna del campo MODELO entre las de art, o null si no hay. Solo un
 * nombre de columna normal: va entre corchetes en la consulta. */
function elegirColumnaSku(columnas) {
  const porNombre = new Map(columnas.map((nombre) => [nombre.toLowerCase(), nombre]));
  const encontrada =
    COLUMNAS_MODELO.map((nombre) => porNombre.get(nombre)).find(Boolean) ??
    columnas.find((nombre) => /model/i.test(nombre));
  return encontrada && /^[A-Za-z0-9_]+$/.test(encontrada) ? encontrada : null;
}

module.exports = { elegirColumnaSku };
