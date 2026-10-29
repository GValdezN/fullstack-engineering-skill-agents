# Fixture de evaluación

Esta app sintética es exclusiva para QA de la skill. Preparar con `node scripts/run-smoke.mjs --prepare RUTA_NUEVA` desde la carpeta de la skill. En la carpeta preparada, ejecutar `docker compose up --build -d --wait`. Docker asigna un puerto loopback libre: consultar `docker compose port web 3000`. API y PostgreSQL no publican puertos. Para ejecutar navegador, persistencia y recuperación automáticamente, usar `node scripts/run-smoke.mjs` desde la skill.

No usar estas credenciales demo en entornos compartidos/productivos. La aplicación no incluye autenticación: solo acepta tráfico loopback y datos sintéticos de la prueba.
