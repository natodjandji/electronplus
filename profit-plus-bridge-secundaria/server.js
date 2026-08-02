/**
 * Puente REST liviano entre Profit Plus (SQL Server, on-premise en la
 * tienda secundaria) y el backend en la nube. Expone el catálogo completo
 * (código, descripción, stock, precio1, precio2) — mismo contrato de campos
 * que el bridge de la tienda principal (../profit-plus-bridge-principal),
 * pero contra un SQL Server físicamente distinto. Proyecto standalone — no
 * depende del backend principal ni del otro bridge.
 *
 * Endpoint: GET /api/productos-sincronizacion
 * Auth:     header "Authorization: Bearer <API_KEY>" (o el token a secas,
 *           sin "Bearer " — ver requireApiKey más abajo).
 */

require('dotenv').config();
const express = require('express');
const sql = require('mssql');

const PORT = Number(process.env.PORT) || 4001;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error(
    'Falta API_KEY en el archivo .env — la API no puede arrancar sin una clave de autenticación configurada.',
  );
  process.exit(1);
}

for (const required of ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[required]) {
    console.error(`Falta ${required} en el archivo .env — revisa la configuración de conexión.`);
    process.exit(1);
  }
}

/** @type {import('mssql').config} */
const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  options: {
    // La mayoría de instalaciones on-premise de SQL Server para Profit Plus
    // no tienen un certificado TLS válido — encrypt:false + trust:true es
    // lo habitual para conectarse dentro de la red local. Si tu SQL Server
    // sí exige TLS, pon DB_ENCRYPT=true en el .env.
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 15000,
  requestTimeout: 30000,
};

/**
 * CONSULTA VERIFICADA — corrida contra el SQL Server real de la tienda
 * secundaria (base PRUE24) y confirmada funcionando. Nombres de columna
 * reales de esta instalación (distintos a la convención "sa*" que se usa
 * en la tienda principal — son dos Profit Plus independientes):
 *   art.ref        -> código del artículo
 *   art.art_des    -> descripción
 *   art.prec_vta1  -> precio 1 (detal)
 *   art.prec_vta2  -> precio 2 (mayor)
 *   art.co_art     -> clave de artículo, para el JOIN con st_almac
 *   st_almac.stock_act -> existencia
 *
 * SUM + GROUP BY se agregan sobre la consulta ya verificada por precaución:
 * si st_almac tiene una fila por almacén por artículo (instalación con
 * varios depósitos), esto consolida el total en vez de devolver un renglón
 * duplicado por almacén. Si tu instalación ya tiene una sola fila por
 * artículo en st_almac, el SUM no cambia nada — sigue siendo seguro.
 *
 * Si más adelante quieres filtrar por un almacén específico (como ya hace
 * el bridge principal vía WAREHOUSE_CODE), identifica primero el nombre de
 * la columna de código de almacén en st_almac y agrega la condición al JOIN.
 */
const PRODUCTOS_QUERY = `
  SELECT
    art.ref                              AS codigo,
    art.art_des                          AS descripcion,
    art.prec_vta1                        AS precio1,
    art.prec_vta2                        AS precio2,
    SUM(ISNULL(st_almac.stock_act, 0))   AS stock
  FROM art
  LEFT JOIN st_almac ON st_almac.co_art = art.co_art
  GROUP BY art.ref, art.art_des, art.prec_vta1, art.prec_vta2
  ORDER BY art.art_des;
`;

// Pool de conexión reutilizado entre requests — evita abrir una conexión
// nueva a SQL Server en cada llamada. Si la conexión falla, se limpia la
// promesa cacheada para que el próximo request reintente en vez de quedar
// pegado con una conexión muerta para siempre.
let poolPromise = null;
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig).catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

function requireApiKey(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: 'No autorizado. Header Authorization ausente o inválido.' });
  }
  next();
}

const app = express();

app.get('/api/productos-sincronizacion', requireApiKey, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(PRODUCTOS_QUERY);

    const productos = result.recordset.map((row) => ({
      // art.ref/art_des son columnas char() de ancho fijo en esta
      // instalación — vienen rellenas con espacios a la derecha, hay que
      // recortarlas o el matching por código en el sync falla.
      codigo: (row.codigo ?? '').trim(),
      descripcion: (row.descripcion ?? '').trim(),
      precio1: Number(row.precio1) || 0,
      precio2: Number(row.precio2) || 0,
      stock: Number(row.stock) || 0,
    }));

    res.json({ total: productos.length, productos });
  } catch (err) {
    // Nunca se cae por un fallo de SQL Server — responde 500 con un
    // mensaje claro en vez de tumbar el proceso.
    console.error('Error consultando Profit Plus:', err.message);
    res.status(500).json({
      error: 'No se pudo conectar o consultar la base de datos de Profit Plus.',
      detalle: err.message,
    });
  }
});

// Sin autenticación a propósito — solo confirma que el proceso está vivo,
// no expone datos. Útil para un health check de infraestructura (ej. NSSM,
// un balanceador, o un simple ping de monitoreo).
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Profit Plus bridge (tienda secundaria) escuchando en http://localhost:${PORT}`);
  console.log(`Endpoint: GET http://localhost:${PORT}/api/productos-sincronizacion`);
});
