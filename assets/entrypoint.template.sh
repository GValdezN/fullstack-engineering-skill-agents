#!/bin/sh
set -eu
# IMPORTANTE en Windows: guardar este archivo con terminaciones de línea LF (no CRLF).
# Como alternativa agnóstica al SO, usar assets/entrypoint.template.mjs.
# Copiar scripts en imagen API. wait-db.mjs debe hacer consulta autenticada,
# retries acotados y deadline; no solo sleep. migrate usa ledger y locking.
node scripts/wait-db.mjs
node scripts/migrate.mjs
if [ "${SEED_DEMO:-false}" = "true" ]; then
  if [ "${NODE_ENV:-production}" = "production" ]; then
    echo 'Demo seed forbidden in production' >&2
    exit 1
  fi
  node scripts/seed.mjs
fi
exec "$@"
