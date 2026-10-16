/**
 * Puente REST liviano entre Profit Plus (SQL Server, on-premise en la
 * tienda principal) y el backend en la nube. Expone un único endpoint de
 * solo lectura que devuelve el catálogo completo (código, descripción,
 * categoría, marca, stock, precio1, precio2) que la sincronización necesita. Todo
 * el proyecto vive en esta carpeta aparte — no toca ni depende del backend
 * principal (NestJS) — pensado para correr como servicio local en la misma
 * PC (o red) donde está el SQL Server de Profit Plus.
 *
 * Este es el bridge de la tienda PRINCIPAL. La tienda secundaria tiene su
 * propio bridge hermano (../profit-plus-bridge-secundaria) contra un SQL
 * Server físicamente distinto — mismo contrato de campos, esquema distinto.
 *
 * Endpoint: GET /api/productos-sincronizacion
 * Auth:     header "Authorization: Bearer <API_KEY>" (o el token a secas).
 *
 * Seguridad:
 *   - Escucha solo en 127.0.0.1: el túnel de Cloudflare entra por ahí y
 *     ningún otro equipo de la red de la tienda necesita llegar al bridge.
 *   - No arranca con la clave de ejemplo ni con una de menos de 32
 *     caracteres, y compara la clave en tiempo constante.
 *   - Un fallo de SQL Server responde el tipo de fallo y un id; el mensaje
 *     de SQL Server (equipo, instancia, base, usuario) queda solo en el
 *     registro local.
 */

'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { promisify } = require('util');
const zlib = require('zlib');
const express = require('express');
const sql = require('mssql');
const { ConfigError, parsePort, loadDbConfig, classifyDbError } = require('./db-config');

const gzip = promisify(zlib.gzip);

/** Una línea por evento, con fecha: NSSM la guarda en bridge.log, y sin
 * hora no se puede saber cuándo empezó un fallo. */
function log(level, message) {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (level === 'INFO') console.log(line);
  else console.error(line);
}

// --- Configuración ----------------------------------------------------------
// Todo se valida al arrancar: un dato que no sirve detiene el servicio con un
// mensaje claro en el registro, en vez de fallar en la primera petición.

/** El valor que trae .env.example: con él, cualquiera que haya visto el
 * repositorio tendría la clave. */
const EXAMPLE_API_KEY = 'cambia-esto-por-un-token-largo-y-aleatorio';
const MIN_API_KEY_LENGTH = 32;

function loadServerConfig(env = process.env) {
  const apiKey = env.API_KEY || '';
  if (!apiKey) {
    throw new ConfigError('Falta API_KEY en el archivo .env — la API no arranca sin una clave.');
  }
  if (apiKey === EXAMPLE_API_KEY || apiKey.length < MIN_API_KEY_LENGTH) {
    throw new ConfigError(
      `API_KEY es la de ejemplo o tiene menos de ${MIN_API_KEY_LENGTH} caracteres. Genera una con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return {
    apiKey,
    port: parsePort(env.PORT, 4000, 'PORT'),
    host: env.HOST || '127.0.0.1',
    // El código de almacén es opcional: si no se define, la consulta suma el
    // stock de TODOS los almacenes por artículo.
    warehouseCode: (env.WAREHOUSE_CODE || '').trim() || null,
  };
}

let config;
let dbConfig;
try {
  config = loadServerConfig();
  dbConfig = loadDbConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  log('ERROR', err.message);
  process.exit(1);
}

/**
 * Consulta del catálogo, escrita con el esquema real de la base ELECT26
 * (Profit Plus Administrativo, verificado con "npm run diagnostico" el
 * 2026-10-15). Las mismas tablas existen en la empresa "demo", que sirve
 * para probarla con datos.
 *
 *   - art: un artículo por fila. co_art es su código interno, único: con él
 *     la web reconoce el artículo de una sincronización a otra. ref es la
 *     REFERENCIA, el código que la tienda usa y que la web muestra (si está
 *     vacía, muestra co_art). art_des, la descripción; prec_vta1 y
 *     prec_vta2, el precio detal y el mayor, en dólares sin IVA. Los
 *     anulados no salen, y la web los oculta.
 *   - lin_art: la LÍNEA del artículo es su categoría en la web; su código
 *     (co_lin) la identifica aunque en Profit le cambien el nombre.
 *   - cat_art: la tienda usa la CATEGORÍA de Profit, renombrada, para la
 *     MARCA (Lucerna es la "001"). En la web cada marca es además un
 *     proveedor, enlazado por su código (co_cat).
 *   - st_almac: existencia actual (stock_act) por almacén. Con
 *     WAREHOUSE_CODE vacío se suman todos; la tienda tiene uno solo (CCS).
 *     El comprometido y el por llegar no se cuentan.
 *
 * Profit guarda códigos y descripciones en columnas char() rellenas de
 * espacios: se recortan aquí y otra vez en toProducto().
 *
 * El almacén llega como parámetro (@almacen), nunca pegado al texto de la
 * consulta: así no hay inyección SQL posible desde el .env.
 */
const PRODUCTOS_QUERY = `
  SELECT
    RTRIM(art.co_art)     AS codigo,
    RTRIM(art.ref)        AS referencia,
    RTRIM(art.art_des)    AS descripcion,
    RTRIM(art.co_lin)     AS categoria_codigo,
    RTRIM(lin.lin_des)    AS categoria,
    RTRIM(art.co_cat)     AS marca_codigo,
    RTRIM(cat.cat_des)    AS marca,
    ISNULL(st.stock, 0)   AS stock,
    art.prec_vta1         AS precio1,
    art.prec_vta2         AS precio2
  FROM art
  LEFT JOIN lin_art lin ON lin.co_lin = art.co_lin
  LEFT JOIN cat_art cat ON cat.co_cat = art.co_cat
  LEFT JOIN (
    SELECT co_art, SUM(stock_act) AS stock
    FROM st_almac
    WHERE @almacen IS NULL OR co_alma = @almacen
    GROUP BY co_art
  ) st ON st.co_art = art.co_art
  WHERE art.anulado = 0
  ORDER BY art.co_art;
`;

// --- SQL Server -------------------------------------------------------------

/** El pool en uso y su conexión inicial, o null antes de la primera
 * petición o después de que se cerró. */
let current = null;

/**
 * Pool de conexión reutilizado entre peticiones. Uno propio (no el global de
 * mssql) para poder escuchar sus errores: mssql emite 'error' en el pool
 * desde eventos de la conexión, fuera de cualquier consulta, y un 'error'
 * sin oyente tumba el proceso. Si la conexión inicial falla o el pool se
 * cerró, la próxima petición abre uno nuevo en vez de quedar pegada.
 */
function getPool() {
  if (current && !current.pool.connected && !current.pool.connecting) dropPool(current.pool);
  if (!current) {
    const pool = new sql.ConnectionPool(dbConfig);
    pool.on('error', (err) => log('ERROR', `Conexión con SQL Server: ${err.message}`));
    current = { pool, ready: pool.connect() };
    current.ready.catch(() => dropPool(pool));
  }
  return current.ready;
}

function dropPool(pool) {
  if (!current || current.pool !== pool) return;
  current = null;
  pool.close().catch(() => undefined);
}

/** Profit Plus guarda código, descripción y grupo en columnas char() de
 * ancho fijo: vienen rellenas con espacios a la derecha (igual que en la
 * tienda secundaria). Sin recortarlas, el código no coincide con el código
 * de barras escaneado ni con la búsqueda en la web. */
function toProducto(row) {
  return {
    codigo: String(row.codigo ?? '').trim(),
    referencia: String(row.referencia ?? '').trim() || null,
    descripcion: String(row.descripcion ?? '').trim(),
    categoriaCodigo: String(row.categoria_codigo ?? '').trim() || null,
    categoria: String(row.categoria ?? '').trim() || null,
    marcaCodigo: String(row.marca_codigo ?? '').trim() || null,
    marca: String(row.marca ?? '').trim() || null,
    stock: Number(row.stock) || 0,
    precio1: Number(row.precio1) || 0,
    precio2: Number(row.precio2) || 0,
  };
}

async function queryCatalog() {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('almacen', sql.VarChar(50), config.warehouseCode)
    .query(PRODUCTOS_QUERY);
  const productos = result.recordset.map(toProducto);
  return Buffer.from(JSON.stringify({ total: productos.length, productos }));
}

/** Una consulta a la vez: las peticiones que llegan juntas (un reintento,
 * dos sincronizaciones) comparten el resultado en vez de lanzar cada una el
 * catálogo completo contra el SQL Server de la tienda. */
let catalogInFlight = null;
function loadCatalog() {
  catalogInFlight ??= queryCatalog().finally(() => {
    catalogInFlight = null;
  });
  return catalogInFlight;
}

// --- Autenticación ----------------------------------------------------------

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const API_KEY_DIGEST = sha256(config.apiKey);

/** Acepta "Bearer <clave>" (el esquema sin importar mayúsculas, como dice
 * el estándar HTTP) o la clave sola. */
function tokenFrom(header) {
  const value = String(header || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return (match ? match[1] : value).trim();
}

/** Quién llamó, solo para el registro: detrás del túnel la IP real viene en
 * CF-Connecting-IP. Nunca decide acceso: fuera del túnel se puede falsificar. */
function clientAddress(req) {
  return req.get('cf-connecting-ip') || req.socket.remoteAddress;
}

function requireApiKey(req, res, next) {
  const token = tokenFrom(req.headers.authorization);
  // Se comparan los resúmenes SHA-256 (32 bytes los dos) con timingSafeEqual:
  // una comparación con === se detiene en el primer carácter distinto, y su
  // tiempo le dice a quien prueba claves cuánto acierta.
  if (token && crypto.timingSafeEqual(sha256(token), API_KEY_DIGEST)) return next();
  log('WARN', `Clave rechazada desde ${clientAddress(req)} (${req.method} ${req.path.slice(0, 200)})`);
  res
    .set('WWW-Authenticate', 'Bearer')
    .status(401)
    .json({ error: 'No autorizado. Header Authorization ausente o inválido.' });
}

// --- HTTP -------------------------------------------------------------------

/** Fallos que suelen pasar solos (SQL Server reiniciando, la red de la
 * tienda): con 503 el backend reintenta una vez antes de darlo por fallido. */
const TRANSIENT_MOTIVOS = new Set(['conexion', 'instancia', 'tiempo']);

const app = express();
// Ni anunciar que es Express, ni calcular un ETag del catálogo entero en
// cada respuesta (nadie la guarda en caché).
app.disable('x-powered-by');
app.set('etag', false);
// El bridge no lee la cadena de consulta: sin parser, una URL armada a mano
// no llega a la librería qs.
app.set('query parser', false);

app.use((_req, res, next) => {
  // El catálogo con precios no se guarda en ningún caché (ni de Cloudflare
  // ni de un navegador), y el navegador no adivina su tipo.
  res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  next();
});

app.get('/api/productos-sincronizacion', requireApiKey, async (req, res) => {
  try {
    const body = await loadCatalog();
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Vary', 'Accept-Encoding');
    // El catálogo completo pesa ~1 MB de JSON muy repetitivo: comprimido sube
    // por la conexión de la tienda en una fracción del tiempo.
    if (req.acceptsEncodings('gzip') === 'gzip') {
      res.set('Content-Encoding', 'gzip');
      res.send(await gzip(body));
      return;
    }
    res.send(body);
  } catch (err) {
    const id = crypto.randomUUID().slice(0, 8);
    const { motivo, ayuda } = classifyDbError(err);
    log('ERROR', `[${id}] Consulta del catálogo falló (${motivo}): ${err.message} — ${ayuda}`);
    res
      .status(TRANSIENT_MOTIVOS.has(motivo) ? 503 : 500)
      .json({ error: 'No se pudo consultar Profit Plus.', motivo, id });
  }
});

// Sin autenticación a propósito — solo confirma que el proceso está vivo,
// no expone datos ni toca SQL Server. Útil para NSSM, el túnel o un ping.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((_req, res) => res.status(404).json({ error: 'No encontrado.' }));

// Express exige los cuatro parámetros para reconocerlo como manejador de errores.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  log('ERROR', `${req.method} ${req.path.slice(0, 200)}: ${err.message}`);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Error interno del bridge.' : 'Petición inválida.' });
});

const server = app.listen(config.port, config.host, () => {
  log('INFO', `Profit Plus bridge escuchando en http://${config.host}:${config.port}`);
});
// Una conexión que manda las cabeceras a cuentagotas no retiene el proceso.
server.headersTimeout = 20_000;
server.requestTimeout = 120_000;
server.on('error', (err) => {
  log(
    'ERROR',
    err.code === 'EADDRINUSE'
      ? `El puerto ${config.port} ya está en uso: ¿hay otra copia del bridge corriendo?`
      : `No se pudo iniciar el servidor: ${err.message}`,
  );
  process.exit(1);
});

/** Al detener el servicio (NSSM manda Ctrl+C), termina lo que está en curso
 * y cierra las conexiones con SQL Server antes de salir. */
function shutdown(signal) {
  log('INFO', `${signal}: cerrando el bridge.`);
  setTimeout(() => process.exit(0), 10_000).unref();
  server.close(() => {
    const pool = current && current.pool;
    current = null;
    (pool ? pool.close() : Promise.resolve()).catch(() => undefined).finally(() => process.exit(0));
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Un fallo no previsto queda en el registro con fecha antes de salir; NSSM
// vuelve a levantar el servicio.
process.on('uncaughtException', (err) => {
  log('ERROR', `Error no controlado: ${err.stack || err.message}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', `Promesa rechazada sin manejar: ${(reason && reason.stack) || reason}`);
  process.exit(1);
});
