// Aplica el esquema y los datos base. Ejecutar con: npm run db:migrate
// Es idempotente, asi que se puede correr en cada deploy.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '../config/database.js';

if (!pool) {
  console.error('[migrate] falta DATABASE_URL: no hay base contra la cual migrar');
  process.exit(1);
}

const carpeta = dirname(fileURLToPath(import.meta.url));

async function ejecutarArchivo(nombre) {
  const sql = await readFile(join(carpeta, nombre), 'utf8');
  await pool.query(sql);
  console.log(`[migrate] ${nombre} aplicado`);
}

try {
  await ejecutarArchivo('schema.sql');
  await ejecutarArchivo('seed.sql');
  console.log('[migrate] listo');
} catch (error) {
  console.error('[migrate] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
