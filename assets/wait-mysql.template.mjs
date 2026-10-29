// Espera determinista y autenticada para MySQL; la API debe instalar mysql2.
import mysql from 'mysql2/promise';
import { setTimeout as delay } from 'node:timers/promises';

const deadline = Date.now() + 60000;
let ready = false;

while (Date.now() < deadline) {
  let conn;
  try {
    conn = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
      connectTimeout: 3000,
    });
    await conn.query('SELECT 1');
    ready = true;
  } catch {
    // Reintentar sin loguear credenciales
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
  if (ready) break;
  await delay(500);
}

if (!ready) throw new Error('MySQL readiness deadline exceeded');
