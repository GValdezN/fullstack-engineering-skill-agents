import { Client } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
const deadline = Date.now() + 60000;
let ready = false;
while (Date.now() < deadline) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try { await client.connect(); await client.query('SELECT 1'); ready = true; }
  catch { /* Retry without logging connection strings or credentials. */ }
  finally { await client.end().catch(() => {}); }
  if (ready) break;
  await delay(500);
}
if (!ready) throw new Error('Database readiness deadline exceeded');
