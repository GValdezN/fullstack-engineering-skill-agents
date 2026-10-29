// Orquestación de migraciones para MySQL; la API debe instalar mysql2.
// IMPORTANTE: En MySQL las sentencias DDL (CREATE, ALTER, DROP) causan un COMMIT implícito.
// Por ende, la serialización descansa en GET_LOCK y registro ordenado en el ledger.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function migrate(conn, dir, { lockTimeoutSeconds = 60 } = {}) {
  const names = (await readdir(dir)).filter(x => x.endsWith('.sql'));
  if (names.some(x => !/^\d{3,}_[a-z0-9_]+\.sql$/.test(x))) throw new Error('Invalid migration filename');
  const ids = names.map(x => Number(x.split('_')[0]));
  if (ids.some(x => !Number.isSafeInteger(x)) || new Set(ids).size !== ids.length) throw new Error('Duplicate or invalid migration version');
  const files = names.sort((a,b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  const inputs = await Promise.all(files.map(async id => {
    const sql = await readFile(new URL(id, dir), 'utf8');
    return { id, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));

  const [[{ dbName }]] = await conn.query('SELECT DATABASE() AS dbName');
  if (!dbName) throw new Error('MySQL database required');
  const lockName = 'migrations:' + createHash('sha256').update(dbName).digest('hex').slice(0, 48);
  let locked = false;
  try {
    const [lockRows] = await conn.query('SELECT GET_LOCK(?, ?) AS locked', [lockName, lockTimeoutSeconds]);
    locked = lockRows[0]?.locked === 1;
    if (!locked) throw new Error('MySQL migration lock deadline exceeded');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id VARCHAR(255) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [applied] = await conn.query('SELECT id, checksum FROM _schema_migrations');
    const ledger = new Map(applied.map(row => [row.id, row.checksum]));

    // Validar integridad histórica completa
    for (const row of applied) if (!inputs.some(x => x.id === row.id)) throw new Error(`Missing applied migration: ${row.id}`);
    for (const item of inputs) if (ledger.has(item.id) && ledger.get(item.id) !== item.checksum) throw new Error(`Changed applied migration: ${item.id}`);

    const highestApplied = Math.max(0, ...applied.map(x => Number(x.id.split('_')[0])));
    for (const item of inputs) {
      if (ledger.has(item.id)) continue;
      if (Number(item.id.split('_')[0]) <= highestApplied) throw new Error('Out-of-order migration requires explicit recovery plan');

      // Ejecutar DDL/DML de la migración y registrar en ledger
      await conn.query(item.sql);
      await conn.query('INSERT INTO _schema_migrations(id, checksum) VALUES(?, ?)', [item.id, item.checksum]);
    }
  } finally {
    if (locked) {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mysql = (await import('mysql2/promise')).default;
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
    connectTimeout: 3000,
  });
  try {
    await migrate(conn, new URL('../migrations/', import.meta.url));
  } finally {
    await conn.end();
  }
}
