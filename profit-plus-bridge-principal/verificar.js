/**
 * Verificación de solo lectura: lee los artículos directo de las tablas de
 * Profit Plus y los compara con lo que entrega el bridge y con lo que publica
 * la web (código de barra, SKU, nombre, categoría, marca, stock y precios).
 * No escribe nada en Profit ni en la web.
 *
 * Uso (en la PC del bridge, en esta carpeta, con el bridge corriendo):
 *   npm run verificar
 *
 * El informe sale en pantalla y queda en verificacion-profit.txt, junto a
 * este archivo. Termina con código 1 si hay diferencias, para poder usarlo
 * desde una tarea programada.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { ConfigError, parsePort, loadDbConfig, classifyDbError } = require('./db-config');
const { elegirColumnaSku } = require('./columna-sku');
const { deProfit, existencias, verificar, informe } = require('./verificacion');

const OUTPUT = path.join(__dirname, 'verificacion-profit.txt');
/** La API de la web; WEB_API_URL en el .env la cambia (por ejemplo, para
 * probar contra otro entorno). */
const WEB_API = (process.env.WEB_API_URL || 'https://electronplus-api-771016935976.us-central1.run.app/api').replace(
  /\/+$/,
  '',
);

/** Los artículos activos tal como están en las tablas de Profit. */
async function leerProfit(pool) {
  const { recordset: columnas } = await pool
    .request()
    .query("SELECT COLUMN_NAME AS nombre FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'art'");
  const columnaSku = elegirColumnaSku(columnas.map((fila) => String(fila.nombre)));
  const { recordset: filas } = await pool.request().query(`
    SELECT art.co_art, art.ref, ${columnaSku ? `art.[${columnaSku}] AS modelo,` : ''}
           art.art_des, art.co_lin, lin.lin_des, art.co_cat, cat.cat_des,
           art.prec_vta1, art.prec_vta2
    FROM art
    LEFT JOIN lin_art lin ON lin.co_lin = art.co_lin
    LEFT JOIN cat_art cat ON cat.co_cat = art.co_cat
    WHERE art.anulado = 0
    ORDER BY art.co_art`);
  // La existencia se suma aquí, no en SQL como hace el bridge.
  const { recordset: almacen } = await pool.request().query('SELECT co_art, co_alma, stock_act FROM st_almac');
  const stockDe = existencias(almacen, process.env.WAREHOUSE_CODE);
  return { columnaSku, articulos: filas.map((fila) => deProfit(fila, stockDe(fila.co_art))) };
}

/** La respuesta del bridge que corre en esta PC, con la clave del .env. */
async function leerBridge() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('falta API_KEY en el archivo .env.');
  const port = parsePort(process.env.PORT, 4000, 'PORT');
  const host = !process.env.HOST || process.env.HOST === '0.0.0.0' ? '127.0.0.1' : process.env.HOST;
  const url = `http://${host}:${port}/api/productos-sincronizacion`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new Error(`no responde en ${url} (${err.cause?.code || err.message}): ¿está corriendo la tarea?`);
  }
  if (res.status === 401) throw new Error('rechazó la API_KEY del .env.');
  if (!res.ok) throw new Error(`respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Los productos que muestra la tienda en línea. */
async function leerWeb() {
  const url = `${WEB_API}/products/catalog`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new Error(`no responde en ${url} (${err.cause?.code || err.message}): ¿hay internet en esta PC?`);
  }
  if (!res.ok) throw new Error(`${url} respondió ${res.status}.`);
  const body = await res.json();
  return body.data ?? [];
}

async function main() {
  let dbConfig;
  try {
    dbConfig = loadDbConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Leyendo Profit Plus (${dbConfig.server}/${dbConfig.database})...`);
  const pool = new sql.ConnectionPool(dbConfig);
  pool.on('error', (err) => console.error(`Conexión con SQL Server: ${err.message}`));
  try {
    await pool.connect();
  } catch (err) {
    console.error(`No se pudo conectar a SQL Server: ${err.message}`);
    console.error(classifyDbError(err).ayuda);
    process.exitCode = 1;
    return;
  }

  let profit;
  try {
    profit = await leerProfit(pool);
  } finally {
    await pool.close().catch(() => undefined);
  }

  console.log('Leyendo el bridge y la web...');
  const errores = [];
  const [bridge, web] = await Promise.all([
    leerBridge().catch((err) => {
      errores.push(`Bridge: ${err.message}`);
      return null;
    }),
    leerWeb().catch((err) => {
      errores.push(`Web: ${err.message}`);
      return null;
    }),
  ]);

  const resultado = verificar({ profit: profit.articulos, bridge, web });
  const { lineas, problemas } = informe(resultado, { columnaSku: profit.columnaSku, errores });
  const encabezado = `Verificación de Profit Plus — ${new Date().toLocaleString('es-VE')}`;
  const texto = [encabezado, '', ...lineas].join('\n');
  console.log(`\n${texto}`);
  fs.writeFileSync(OUTPUT, `${texto}\n`, 'utf8');
  console.log(`\nInforme guardado en ${OUTPUT}`);
  if (problemas > 0 || errores.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`La verificación falló: ${err.stack || err.message}`);
  process.exitCode = 1;
});
