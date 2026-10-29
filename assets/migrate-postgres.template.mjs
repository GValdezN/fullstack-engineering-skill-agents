// PostgreSQL orchestration; the API must install pg explicitly.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function migrate(client, dir, { lockTimeoutMs = 60000 } = {}) {
  const names = (await readdir(dir)).filter(x => x.endsWith('.sql'));
  if (names.some(x => !/^\d{3,}_[a-z0-9_]+\.sql$/.test(x))) throw new Error('Invalid migration filename');
  const ids = names.map(x => Number(x.split('_')[0]));
  if (ids.some(x => !Number.isSafeInteger(x)) || new Set(ids).size !== ids.length) throw new Error('Duplicate or invalid migration version');
  const files = names.sort((a,b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
  const inputs = await Promise.all(files.map(async id => {
    const sql = await readFile(new URL(id, dir), 'utf8');
    return { id, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  let locked = false;
  try {
    const deadline = Date.now() + lockTimeoutMs;
    do {
      const { rows } = await client.query('SELECT pg_try_advisory_lock(724018) AS locked');
      locked = rows[0].locked;
      if (locked) break;
      if (Date.now() >= deadline) throw new Error('Migration lock deadline exceeded');
      await delay(100);
    } while (!locked);
    await client.query('CREATE TABLE IF NOT EXISTS _schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, executed_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows: applied } = await client.query('SELECT id,checksum FROM _schema_migrations');
    const ledger = new Map(applied.map(row => [row.id, row.checksum]));
    // Check the entire history before applying any new change.
    for (const row of applied) if (!inputs.some(x => x.id === row.id)) throw new Error(`Missing applied migration: ${row.id}`);
    for (const item of inputs) if (ledger.has(item.id) && ledger.get(item.id) !== item.checksum) throw new Error(`Changed applied migration: ${item.id}`);
    const highestApplied = Math.max(0, ...applied.map(x => Number(x.id.split('_')[0])));
    for (const item of inputs) {
      if (ledger.has(item.id)) continue;
      if (Number(item.id.split('_')[0]) <= highestApplied) throw new Error('Out-of-order migration requires explicit recovery plan');
      await client.query('BEGIN');
      try {
        await client.query(item.sql);
        await client.query('INSERT INTO _schema_migrations(id,checksum) VALUES($1,$2)', [item.id, item.checksum]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(724018)');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 60000 });
  let client;
  try {
    client = await pool.connect();
    await migrate(client, new URL('../migrations/', import.meta.url));
  } finally {
    client?.release();
    await pool.end();
  }
}
