import pg from 'pg';

import { config } from './env.js';
import { ApiError } from '../utils/ApiError.js';

const { Pool, types } = pg;

// Los DECIMAL/NUMERIC llegan como string para no perder precision; en esta API
// los exponemos como number porque son montos y coordenadas acotadas.
types.setTypeParser(types.builtins.NUMERIC, (valor) => (valor === null ? null : Number(valor)));

/** Sin DATABASE_URL no se crea el pool y la API funciona en modo sin base. */
export const hayBaseDeDatos = Boolean(config.db.url);

export const pool = hayBaseDeDatos
  ? new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      max: config.db.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Evita que una query colgada bloquee una conexion del pool para siempre.
      statement_timeout: 15_000,
    })
  : null;

pool?.on('error', (error) => {
  // Un cliente idle que se cae no debe tumbar el proceso.
  console.error('[db] error en cliente idle del pool:', error.message);
});

function exigirBase() {
  if (!pool) throw ApiError.serviceUnavailable('La base de datos todavia no esta configurada');
}

/** Ejecuta una query usando una conexion del pool. */
export function query(text, params) {
  exigirBase();
  return pool.query(text, params);
}

/**
 * Ejecuta `fn` dentro de una transaccion. Commitea si resuelve y hace rollback
 * si lanza. `fn` recibe el client para encadenar queries sobre la misma conexion.
 */
export async function withTransaction(fn) {
  exigirBase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** Verifica que la base responda antes de empezar a aceptar requests. */
export async function connectDatabase() {
  if (!pool) {
    console.warn('[db] sin DATABASE_URL: modo sin base (solo login de admin hardcodeado)');
    return;
  }
  const { rows } = await pool.query('SELECT current_database() AS db');
  console.log(`[db] conectado a "${rows[0].db}"`);
}

export async function disconnectDatabase() {
  await pool?.end();
}
