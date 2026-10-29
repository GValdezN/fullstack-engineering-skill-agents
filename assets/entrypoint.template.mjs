// Invocar con node entrypoint.mjs; no depende del shebang ni de finales LF.
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

let activeChild;
let stopping;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping ??= signal;
    activeChild?.kill(signal);
  });
}

async function run(command, args) {
  if (stopping) throw new Error('Startup interrupted');
  return new Promise((resolve, reject) => {
    activeChild = spawn(command, args, { stdio: 'inherit' });
    activeChild.once('error', reject);
    activeChild.once('close', (code, signal) => {
      activeChild = undefined;
      if (stopping || signal) {
        process.exitCode = 128 + (constants.signals[stopping || signal] || 1);
        reject(new Error('Process interrupted'));
      } else if (code !== 0) {
        process.exitCode = code ?? 1;
        reject(new Error('Child process failed'));
      } else resolve();
    });
  });
}

try {
  const args = process.argv.slice(2);
  if (!args.length) throw new Error('Application command required');
  if (process.env.SEED_DEMO === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed forbidden in production');
  }
  // Obligatorios: los archivos ausentes bloquean el arranque.
  await run(process.execPath, ['scripts/wait-db.mjs']);
  await run(process.execPath, ['scripts/migrate.mjs']);
  if (process.env.SEED_DEMO === 'true') await run(process.execPath, ['scripts/seed.mjs']);
  await run(args[0], args.slice(1));
} catch {
  // Los hijos imprimen su diagnóstico; no repetir URLs/credenciales en errores.
  console.error('Entrypoint failed: check command, initialization scripts and child logs');
  process.exitCode ||= stopping ? 128 + (constants.signals[stopping] || 1) : 1;
}
