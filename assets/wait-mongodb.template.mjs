// Espera determinista y autenticada para MongoDB; la API debe instalar mongodb.
import { MongoClient } from 'mongodb';
import { setTimeout as delay } from 'node:timers/promises';

const deadline = Date.now() + 60000;
let ready = false;

while (Date.now() < deadline) {
  let client;
  try {
    client = new MongoClient(process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/app', {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    await client.connect();
    await client.db().admin().ping();
    ready = true;
  } catch {
    // Reintentar sin loguear credenciales
  } finally {
    if (client) await client.close().catch(() => {});
  }
  if (ready) break;
  await delay(500);
}

if (!ready) throw new Error('MongoDB readiness deadline exceeded');
