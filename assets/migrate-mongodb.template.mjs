// Orquestación de migraciones para MongoDB; la API debe instalar mongodb.
// Los archivos de migración deben nombrarse 001_descripcion.mjs y exportar async function up(db).
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function migrate(db, dir, { lockTimeoutMs = 60000 } = {}) {
  const names = (await readdir(dir)).filter(x => x.endsWith('.mjs') || x.endsWith('.js'));
  if (names.some(x => !/^\d{3,}_[a-z0-9_]+\.(mjs|js)$/.test(x))) throw new Error('Invalid migration filename');
  const ids = names.map(x => Number(x.split('_')[0]));
  if (ids.some(x => !Number.isSafeInteger(x)) || new Set(ids).size !== ids.length) throw new Error('Duplicate or invalid migration version');
  const files = names.sort((a,b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));

  const inputs = await Promise.all(files.map(async id => {
    const content = await readFile(new URL(id, dir), 'utf8');
    return { id, fileUrl: new URL(id, dir), checksum: createHash('sha256').update(content).digest('hex') };
  }));

  const migrationsCol = db.collection('_schema_migrations');
  const locksCol = db.collection('_migration_locks');

  let locked = false;
  const lockId = 'migration_runner';
  const deadline = Date.now() + lockTimeoutMs;

  try {
    do {
      try {
        const res = await locksCol.updateOne(
          { _id: lockId, locked: { $ne: true } },
          { $set: { locked: true, acquiredAt: new Date() } },
          { upsert: true }
        );
        if (res.upsertedCount > 0 || res.modifiedCount > 0) {
          locked = true;
          break;
        }
      } catch (err) {
        // Solo la colisión de clave única significa contención.
        if (err.code !== 11000) throw err;
      }
      if (Date.now() >= deadline) throw new Error('MongoDB migration lock deadline exceeded');
      await delay(200);
    } while (!locked);

    const applied = await migrationsCol.find({}).toArray();
    const ledger = new Map(applied.map(row => [row._id, row.checksum]));

    // Validar integridad histórica completa
    for (const row of applied) if (!inputs.some(x => x.id === row._id)) throw new Error(`Missing applied migration: ${row._id}`);
    for (const item of inputs) if (ledger.has(item.id) && ledger.get(item.id) !== item.checksum) throw new Error(`Changed applied migration: ${item.id}`);

    const highestApplied = Math.max(0, ...applied.map(x => Number(x._id.split('_')[0])));
    for (const item of inputs) {
      if (ledger.has(item.id)) continue;
      if (Number(item.id.split('_')[0]) <= highestApplied) throw new Error('Out-of-order migration requires explicit recovery plan');

      // Cargar dinámicamente y ejecutar función up(db)
      const migrationModule = await import(item.fileUrl.href);
      if (typeof migrationModule.up !== 'function') throw new Error(`Migration ${item.id} does not export an up(db) function`);

      await migrationModule.up(db);
      await migrationsCol.insertOne({ _id: item.id, checksum: item.checksum, executedAt: new Date() });
    }
  } finally {
    if (locked) {
      await locksCol.updateOne({ _id: lockId }, { $set: { locked: false, releasedAt: new Date() } }).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/app');
  try {
    await client.connect();
    const db = client.db();
    await migrate(db, new URL('../migrations/', import.meta.url));
  } finally {
    await client.close();
  }
}
