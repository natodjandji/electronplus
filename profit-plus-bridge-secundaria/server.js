/**
 * Puente REST liviano entre Profit Plus (SQL Server, on-premise en la
 * tienda secundaria) y el backend en la nube. A diferencia del bridge de la
 * tienda principal (../profit-plus-bridge-principal, que expone el catálogo
 * completo), este SOLO expone descripción y stock — es lo único que la
 * tienda secundaria sincroniza. Proyecto standalone — no depende del
 * backend principal ni del otro bridge.
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

// El código de almacén es opcional: si no se define, la consulta suma el
// stock de TODOS los almacenes por artículo. Defínelo si Profit Plus maneja
// varios depósitos y solo quieres el del almacén principal/general.
const WAREHOUSE_CODE = process.env.WAREHOUSE_CODE || null;

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
 * CONSULTA APROXIMADA — basada en la convención estándar de tablas de
 * Profit Plus (prefijo "sa"). Verifica los nombres reales de columnas
 * contra tu base antes de usar esto en producción — ver la sección
 * "Verificar el esquema real" en el README.
 *
 * Solo dos campos, a propósito: la tienda secundaria únicamente sincroniza
 * descripción y stock, no código/categoría/precios.
 *
 * Nota: sin un código de artículo en la respuesta, quien consuma este
 * endpoint solo puede emparejar productos por el texto exacto de la
 * descripción. Si en algún momento el otro lado necesita un identificador
 * más confiable, es tan simple como agregar `art.Art_Codigo AS codigo` al
 * SELECT y al GROUP BY de abajo.
 */
const PRODUCTOS_QUERY = `
  SELECT
    art.Art_Descripcion                  AS descripcion,
    SUM(ISNULL(inv.Inv_Existencia, 0))   AS stock
  FROM saArt art
  LEFT JOIN saInvent inv
    ON inv.Inv_CodArt = art.Art_Codigo
    AND (@almacen IS NULL OR inv.Inv_CodAlm = @almacen)
  WHERE art.Art_Activo = 1
  GROUP BY art.Art_Descripcion
  ORDER BY art.Art_Descripcion;
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
    const result = await pool
      .request()
      .input('almacen', sql.VarChar, WAREHOUSE_CODE)
      .query(PRODUCTOS_QUERY);

    const productos = result.recordset.map((row) => ({
      descripcion: row.descripcion,
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
