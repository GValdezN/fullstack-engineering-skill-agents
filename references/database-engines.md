# Adaptar persistencia sin mezclar motores

Elegir un solo motor. La plantilla base y el override dev son PostgreSQL; al cambiar motor reemplazar imagen, variables, volumen, healthcheck y puerto opt-in, además del conector. Mantener los servicios `db`, `api`, `web` y sus dependencias de salud. No basta cambiar DATABASE_URL.

| Motor | Dependencia productiva API | URL interna | Debug loopback opcional | Destino de datos |
| --- | --- | --- | --- | --- |
| PostgreSQL | `pg` | `postgresql://app:CLAVE_ENCODED@db:5432/app` | `127.0.0.1:5433:5432` | Según versión oficial seleccionada |
| MySQL | `mysql2` | `mysql://app:CLAVE_ENCODED@db:3306/app` | `127.0.0.1:3307:3306` | `/var/lib/mysql` |
| MongoDB | `mongodb` | `mongodb://app:CLAVE_ENCODED@db:27017/app?authSource=app` | `127.0.0.1:27018:27017` | `/data/db` |

Los puertos host son configurables y no están garantizados libres. Codificar usuario/password como componentes URL y no reutilizar credenciales de ejemplo. Fijar imagen/versionado compatible con el driver, actualizar el lockfile y conservar las dependencias de inicialización en `dependencies` de API. No externalizarlas en Next.js: estos scripts se ejecutan en la API.

## MySQL

Sustituir el bloque `db` por una imagen oficial MySQL versionada con `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_ROOT_PASSWORD` configuradas; la API usa el usuario de aplicación, nunca root. Mantener red `data` y volumen nombrado montado en `/var/lib/mysql`. Definir healthcheck con cliente existente en esa imagen, por ejemplo:

```yaml
healthcheck:
  test: [CMD-SHELL, 'MYSQL_PWD="$${MYSQL_PASSWORD}" mysql --protocol=TCP -h 127.0.0.1 -u "$${MYSQL_USER}" -D "$${MYSQL_DATABASE}" -e "SELECT 1" >/dev/null 2>&1']
  interval: 5s
  timeout: 4s
  start_period: 30s
  retries: 20
```

Copiar `wait-mysql.template.mjs` como `scripts/wait-db.mjs` y `migrate-mysql.template.mjs` como `scripts/migrate.mjs`. Crear `migrations/001_initial.sql` y siguientes; configurar `DATABASE_URL_DOCKER` y quitar variables PostgreSQL. Para debug, cambiar también el override dev a `127.0.0.1:${MYSQL_HOST_PORT:-3307}:3306`.

No atribuir atomicidad a DDL multi-sentencia. Ensayar recuperación de una migración interrumpida y verificar histórico/checksums antes del release. El lock de sesión requiere la misma conexión y permisos de GET_LOCK/RELEASE_LOCK.

## MongoDB

Usar imagen oficial MongoDB versionada, volumen nombrado `/data/db` y red `data`. Configurar autenticación y un bootstrap de volumen vacío que cree un usuario de aplicación restringido a su base. `MONGO_INITDB_DATABASE` por sí sola no crea ese usuario: entregar el script de bootstrap real. Usar credenciales administrativas solo para bootstrap y mantenerlas fuera del entorno API. Elegir `authSource` conforme a la base donde se creó el usuario.

La imagen seleccionada debe incluir `mongosh`. Un healthcheck ejecuta `mongosh` con una URL autenticada configurada en el contenedor DB y `--quiet --eval 'quit(db.runCommand({ping:1}).ok === 1 ? 0 : 1)'`; escapar variables como `$$` en Compose. No imprimir URLs en logs. La API debe comprobar además acceso a sus colecciones/esquema en readiness. Bootstrap debe terminar antes de que la comprobación autenticada pase; no arrancar API por un simple puerto abierto.

Copiar `wait-mongodb.template.mjs` como `scripts/wait-db.mjs` y `migrate-mongodb.template.mjs` como `scripts/migrate.mjs`. Versionar `migrations/001_initial.mjs` y siguientes:

```js
export async function up(db) {
  // Reentrante: repetir sin cambiar nombre/opciones del índice.
  await db.collection('records').createIndex({ externalId: 1 }, { unique: true });
}
```

Definir validadores y backfills según dominio. Antes de crear índice único, detectar duplicados y resolverlos según contrato. Usar replica set también en QA si las operaciones requieren transacciones multidocumento; un standalone no basta. Para debug, sustituir el puerto dev por `127.0.0.1:${MONGO_HOST_PORT:-27018}:27017`.

Consultar [recuperación de migraciones](architecture.md#recuperación-según-motor) para el lock persistente y la separación entre `up` y ledger. No asumir recuperación automática tras muerte del runner.

## Prueba de aceptación del motor elegido

1. Construir la imagen final y ejecutar los scripts sin dependencias del host.
2. Arrancar contra volumen QA vacío; comprobar usuario restringido, esquema e índices.
3. Repetir inicialización y confirmar ausencia de duplicados/modificaciones indebidas.
4. Lanzar dos migradores: uno serializa o falla dentro del deadline, sin doble aplicación.
5. Inyectar fallo intermedio y documentar recuperación; bloquear histórico cambiado o faltante.
6. Recrear servicios conservando volumen y comprobar datos; probar reconexión de API.

Si solo se ejecutaron mocks del driver, registrar integración real como pendiente.

Documentación para la versión elegida: [MySQL2](https://sidorares.github.io/node-mysql2/docs/examples/connections/create-connection), [imagen MySQL](https://hub.docker.com/_/mysql), [imagen Mongo](https://hub.docker.com/_/mongo), [índices MongoDB](https://www.mongodb.com/docs/manual/indexes/).
