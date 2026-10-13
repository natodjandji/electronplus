/**
 * Diagnóstico de SOLO LECTURA para escribir la consulta real del bridge.
 * Se conecta con el mismo .env que el servidor y guarda en
 * diagnostico-profit.txt:
 *   - la versión de SQL Server y el nombre de la base;
 *   - las tablas cuyo nombre parece de artículos, existencias, almacenes,
 *     precios, líneas/grupos o monedas, con sus filas y columnas;
 *   - 3 filas de ejemplo de las tablas de catálogo conocidas de Profit Plus.
 * Nada de clientes, ventas ni usuarios: solo el catálogo. No modifica nada.
 *
 * Uso: npm run diagnostico
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { ConfigError, loadDbConfig, classifyDbError } = require('./db-config');

const OUTPUT = path.join(__dirname, 'diagnostico-profit.txt');

/** Fragmentos de nombre de tabla que interesan para el catálogo. */
const NAME_HINTS = ['art', 'stock', 'almac', 'invent', 'prec', 'lin', 'grup', 'cat', 'mone'];

/** Tablas de catálogo de Profit Plus (varias versiones) de las que vale la
 * pena ver filas de ejemplo, si existen en esta base. */
const SAMPLE_TABLES = [
  'art',
  'st_almac',
  'lin_art',
  'sub_lin',
  'cat_art',
  'almacen',
  'moneda',
  'saArticulo',
  'saStockAlmacen',
  'saArtPrecio',
  'saLineaArticulo',
  'saSubLinea',
  'saCatArticulo',
  'saAlmacen',
  'saMoneda',
  'saArt',
  'saInvent',
  'saGrupoArt',
];

const SAMPLE_ROWS = 3;
const MAX_VALUE_LENGTH = 80;

function nameFilter(column) {
  return NAME_HINTS.map((hint) => `${column} LIKE '%${hint}%'`).join(' OR ');
}

function formatValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) return '<binario>';
  if (value instanceof Date) return value.toISOString();
  // JSON muestra los espacios de relleno de las columnas char(): importa verlos.
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

function quoteName(name) {
  return `[${name.replace(/]/g, ']]')}]`;
}

async function main() {
  const lines = [];
  const out = (line = '') => lines.push(line);

  let dbConfig;
  try {
    dbConfig = loadDbConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const pool = new sql.ConnectionPool(dbConfig);
  // Un 'error' sin oyente en el pool tumbaría el proceso sin explicación.
  pool.on('error', (err) => console.error(`Conexión con SQL Server: ${err.message}`));
  try {
    await pool.connect();
  } catch (err) {
    console.error(`No se pudo conectar a SQL Server: ${err.message}`);
    console.error(classifyDbError(err).ayuda);
    process.exitCode = 1;
    return;
  }

  try {
    const info = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS base');
    out('== SQL Server');
    out(`Base: ${info.recordset[0].base}`);
    out(String(info.recordset[0].version).split('\n')[0].trim());
    out();

    const tables = (
      await pool.request().query(`
        SELECT s.name AS esquema, t.name AS tabla, SUM(p.rows) AS filas
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
        WHERE ${nameFilter('t.name')}
        GROUP BY s.name, t.name
        ORDER BY t.name
      `)
    ).recordset;

    const columns = (
      await pool.request().query(`
        SELECT TABLE_SCHEMA AS esquema, TABLE_NAME AS tabla, COLUMN_NAME AS columna,
               DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS largo
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE ${nameFilter('TABLE_NAME')}
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `)
    ).recordset;

    out(`== Tablas que parecen del catálogo (${tables.length})`);
    for (const table of tables) {
      const cols = columns
        .filter((c) => c.esquema === table.esquema && c.tabla === table.tabla)
        .map((c) => `${c.columna} ${c.tipo}${c.largo ? `(${c.largo})` : ''}`);
      out(`${table.esquema}.${table.tabla} — ${table.filas} filas`);
      out(`  ${cols.length > 0 ? cols.join(', ') : '(sin columnas visibles para este usuario)'}`);
    }
    out();

    const wanted = new Set(SAMPLE_TABLES.map((name) => name.toLowerCase()));
    const samples = tables.filter((t) => wanted.has(t.tabla.toLowerCase()));
    out(`== Filas de ejemplo (${SAMPLE_ROWS} por tabla)`);
    for (const table of samples) {
      out(`-- ${table.esquema}.${table.tabla}`);
      try {
        const rows = (
          await pool
            .request()
            .query(
              `SELECT TOP ${SAMPLE_ROWS} * FROM ${quoteName(table.esquema)}.${quoteName(table.tabla)}`,
            )
        ).recordset;
        for (const row of rows) {
          out(
            `  ${Object.entries(row)
              .map(([key, value]) => `${key}=${formatValue(value)}`)
              .join(' | ')}`,
          );
        }
        if (rows.length === 0) out('  (sin filas)');
      } catch (err) {
        out(`  (no se pudo leer: ${err.message})`);
      }
    }
    if (samples.length === 0) out('(ninguna de las tablas conocidas existe en esta base)');
  } finally {
    await pool.close();
  }

  fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\nGuardado en ${OUTPUT} — envía ese archivo para escribir la consulta real.`);
}

main().catch((err) => {
  console.error(`El diagnóstico falló: ${err.message}`);
  process.exitCode = 1;
});
