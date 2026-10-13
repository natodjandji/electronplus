/**
 * Conexión a SQL Server (Profit Plus, tienda secundaria) y lectura de sus
 * errores en palabras de quien instala. Mismo módulo que el del bridge
 * principal, salvo los textos propios de esta tienda.
 *
 * Nada aquí corta el proceso: un dato que falta o no sirve lanza
 * ConfigError, y quien llama decide cómo avisarlo y salir.
 */

'use strict';

/** Un dato del .env que falta o no sirve — un error de quien instala, que
 * se avisa con un mensaje claro en vez de una traza. */
class ConfigError extends Error {}

/** Puerto TCP entero entre 1 y 65535, o `fallback` si no se definió. Un
 * valor como "1433a" pasaba antes como NaN y fallaba más tarde con un error
 * de conexión que no decía por qué. */
function parsePort(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`${name} debe ser un puerto entre 1 y 65535 (vale "${value}").`);
  }
  return port;
}

/** @returns {import('mssql').config} */
function loadDbConfig(env = process.env) {
  for (const name of ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD']) {
    if (!env[name]) {
      throw new ConfigError(`Falta ${name} en el archivo .env — revisa la configuración de conexión.`);
    }
  }
  return {
    // Admite "EQUIPO\INSTANCIA" (requiere el servicio SQL Server Browser) o
    // solo "EQUIPO" con el puerto fijo de la instancia en DB_PORT; con una
    // instancia con nombre, mssql ignora el puerto.
    server: env.DB_SERVER,
    database: env.DB_DATABASE,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    port: parsePort(env.DB_PORT, 1433, 'DB_PORT'),
    options: {
      // La mayoría de instalaciones on-premise de SQL Server para Profit
      // Plus no tienen un certificado TLS válido: sin cifrar y confiando en
      // el certificado es lo habitual dentro de la red local. Con
      // DB_ENCRYPT=true se cifra; con DB_TRUST_SERVER_CERT=false además se
      // valida el certificado, que es lo único que impide que otro equipo
      // de la red se haga pasar por el servidor.
      encrypt: env.DB_ENCRYPT === 'true',
      trustServerCertificate: env.DB_TRUST_SERVER_CERT !== 'false',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

/**
 * Qué tipo de fallo es un error de mssql, en palabras de quien instala.
 * mssql pone el tipo en err.code (ELOGIN, EINSTLOOKUP, ESOCKET, ETIMEOUT);
 * el mensaje cubre los casos sin código.
 *
 * @returns {{ motivo: string, ayuda: string }}
 */
function classifyDbError(err) {
  const text = `${err && err.code} ${err && err.message}`;
  if (/ELOGIN|Login failed/i.test(text)) {
    return {
      motivo: 'login',
      ayuda:
        'Usuario o contraseña de SQL Server incorrectos, o SQL Server solo acepta inicio de sesión de Windows (activa "SQL Server and Windows Authentication mode").',
    };
  }
  if (/EINSTLOOKUP|instance|Browser|Port for .+ not found/i.test(text)) {
    return {
      motivo: 'instancia',
      ayuda:
        'No se encontró la instancia: revisa DB_SERVER (EQUIPO\\INSTANCIA) y que el servicio "SQL Server Browser" esté iniciado, o usa el puerto fijo en DB_PORT.',
    };
  }
  if (/Cannot open database/i.test(text)) {
    return {
      motivo: 'base',
      ayuda:
        'El usuario no tiene acceso a esa base: revisa DB_DATABASE y el mapeo del usuario (rol db_datareader).',
    };
  }
  if (/Invalid object name|Invalid column name/i.test(text)) {
    return {
      motivo: 'consulta',
      ayuda:
        'La consulta no coincide con las tablas de esta base: revisa que DB_DATABASE sea la base de Profit Plus de esta tienda (la consulta se verificó contra PRUE24).',
    };
  }
  if (err && err.name === 'RequestError' && err.code === 'ETIMEOUT') {
    return { motivo: 'tiempo', ayuda: 'La consulta tardó más de 30 s en SQL Server.' };
  }
  if (/ESOCKET|ETIMEOUT|ECONNREFUSED|ECONNCLOSED|ENOTFOUND|getaddrinfo/i.test(text)) {
    return {
      motivo: 'conexion',
      ayuda:
        'No se pudo llegar al SQL Server: revisa DB_SERVER y DB_PORT, que TCP/IP esté habilitado en "SQL Server Configuration Manager" y el firewall si es otro equipo.',
    };
  }
  return { motivo: 'desconocido', ayuda: 'Revisa los datos de conexión del archivo .env.' };
}

module.exports = { ConfigError, parsePort, loadDbConfig, classifyDbError };
