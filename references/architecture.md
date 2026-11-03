# Arquitectura y reglas verificables

Para extender un repositorio existente, identificar primero [sus convenciones reales](project-conventions.md), incluidos nombres y mapeos de persistencia. Las decisiones de stack siguientes se aplican a proyectos nuevos; preservar los contratos y organización de sistemas existentes dentro del alcance solicitado.

## Stack y límites

Usar Next.js en `apps/web`, API Node.js en `apps/api` y contratos compartidos en `packages/contracts` si el tamaño justifica un monorepo. En monorepos, usar npm workspaces para compartir scripts y dependencias; mantener lockfile único en la raíz. Preferir un monolito modular antes que microservicios innecesarios. Mantener reglas de negocio en servicios testeables; HTTP, persistencia y proveedores son adaptadores. La orquestación externa no debe duplicar reglas ni escribir tablas saltándose el dominio. En entornos orquestados con contenedores, desacoplar frontend y backend en servicios independientes dentro de una red interna y comunicar cliente con API mediante el patrón Same-Origin (rewrites en frontend hacia el DNS interno), manteniendo el backend aislado del tráfico directo de Internet (ver [operations.md](operations.md)).

Elegir versiones mantenidas y compatibles consultando documentación oficial; fijar dependencias y conservar un lockfile. Reutilizar el gestor y framework Node existentes; para uno nuevo, escoger Express o Fastify según requisitos. No mezclar gestores ni instalar `latest` sin verificar compatibilidad. No fijar en esta skill versiones históricas.

### Acceso a datos: driver directo u ORM

- **Driver directo** (`pg`, `mysql2`, `mongodb`): control total de queries, sin abstracción intermedia. Preferir cuando las consultas son complejas, el equipo domina SQL o se necesita rendimiento ajustado.
- **Prisma**: esquema declarativo, migraciones versionadas y tipado end-to-end. Preferir en proyectos TypeScript cuando la productividad y la seguridad de tipos importan más que el control granular de SQL. Usar singleton para el client (`new PrismaClient()` una sola vez); mapear errores de Prisma (P2002→409 duplicado, P2025→404 no encontrado) en el middleware de errores.
- **Mongoose**: ODM para MongoDB con esquema, hooks, validación y populate. Usar en proyectos MongoDB existentes que ya lo adopten.

No mezclar ORM y driver directo para la misma tabla/colección. En proyectos existentes, mantener el acceso a datos que ya use el repositorio.

## Elegir una base principal

| Motor | Preferir cuando | Verificar |
|---|---|---|
| PostgreSQL | Relaciones, invariantes fuertes, consultas complejas, informes o extensiones especializadas | Constraints, índices, aislamiento, planes y migraciones |
| MySQL | Modelo relacional y ecosistema/operación ya orientados a MySQL | InnoDB, transacciones, collation/utf8mb4, SQL mode e índices |
| MongoDB | Agregados documentales, estructuras variables y acceso centrado en documentos | Validación de esquema, índices únicos, atomicidad y límites de documento |

Sin restricciones y con dominio transaccional relacional, preferir PostgreSQL y documentar por qué. No elegir MongoDB solo porque los datos llegan en JSON. Añadir un segundo motor únicamente ante un requisito explícito que compense consistencia, operación y backups adicionales. Si se requieren transacciones multidocumento en MongoDB, preparar la topología compatible también en QA; no probarlas contra un standalone incompatible.

## Datos y concurrencia

- Representar invariantes en base y dominio: unicidad, referencias, checks, propiedad/tenant y transiciones válidas. No confiar únicamente en validaciones frontend.
- Usar transacciones para cambios inseparables; probar rollback. Para recursos disputados, aplicar bloqueo o update condicional/versionado y comprobar filas afectadas.
- Diseñar idempotencia persistente por operación. Repetir el mismo identificador no debe repetir efectos; mismo identificador con payload distinto debe detectarse. Probar reintento tras pérdida de respuesta después del commit.
- Usar outbox cuando haya que coordinar commit y efectos externos. No prometer exactly-once en una red: combinar entrega al menos una vez, deduplicación y reconciliación.
- No mantener transacciones SQL ni bloqueos transaccionales abiertos mientras se espera una API externa. Para secuencias externas serializadas, usar leases durables con expiración/fencing según resilience.md. Acotar retries a fallos transitorios con backoff, jitter y límite. Para efectos no idempotentes, consultar el resultado antes de reintentar.
- Si hay colas, definir si la exclusión es global, por recurso o por cliente. No imponer una regla comercial universal. Usar claims atómicos, lease/expiración y fencing cuando corresponda; probar crash, recuperación, orden y ausencia de inanición.
- Usar identificadores estables, no posiciones mutables de filas. Releer y validar versión antes de escrituras sensibles; invalidar confirmaciones obsoletas tras cambios de datos.
- Versionar migraciones; ensayar creación limpia y actualización con datos. Sembrar datos sintéticos de forma idempotente. Nunca sobrescribir contenido editorial al repetir un seed.
- Usar decimales o unidades mínimas para dinero y reglas de redondeo explícitas. Guardar instantes con zona definida y probar límites de día/DST en reportes. No asumir que hora del servidor equivale a hora del negocio.

## Seguridad

Autorizar cada operación y objeto en el backend. Probar roles, propiedad, separación entre tenants, usuarios desactivados y sesiones expiradas. Ocultar botones no protege una API. Hashear contraseñas con una biblioteca mantenida; no inventar criptografía ni incluir claves de ejemplo utilizables en producción.

Elegir mecanismo de sesión según amenazas; para cookies configurar HttpOnly, Secure, SameSite y protección CSRF según flujo. En arquitecturas contenerizadas desacopladas, priorizar el patrón Same-Origin (reescrituras de proxy en frontend hacia el backend interno): esto reduce la necesidad de CORS hacia el navegador. Elegir SameSite según flujos de autenticación, OAuth/callback y enlaces externos; no imponer Strict universalmente ni considerar Same-Origin una defensa CSRF suficiente. Si la API se consume fuera de este proxy (ej. clientes móviles o integraciones directas), aplicar CORS estricto únicamente por orígenes autorizados explícitos. Usar consultas parametrizadas, validación de esquema y límites de tamaño/tasa. No devolver datos sensibles en errores, logs ni endpoints públicos. Separar secretos de servidor de variables públicas de Next.js.

### Autenticación con revalidación en DB

No confiar solo en los claims del JWT para roles y estado activo. Revalidar contra DB en cada request o al menos ante operaciones sensibles: el usuario puede haber sido desactivado o su rol cambiado después de emitir el token. Opcionalmente, incluir `session_id` y `token_version` en el payload para soportar revocación selectiva (logout de otros dispositivos, cambio de contraseña) sin necesitar una blacklist de tokens.

### Autenticación en dos capas de middleware

1. **Global, no bloqueante** (`attachAuthIfPresent`): decodifica el token si existe y lo inyecta en `req.user`; no bloquea si no hay token. Permite endpoints semi-públicos que ajustan la respuesta según si hay sesión.
2. **Por ruta, bloqueante** (`requireAuth`, `requireRole`): corta con 401/403. Composición: `requireAuth` → `requireRole('ADMIN')`.

### Protección CSRF en Same-Origin

Cuando se usen cookies httpOnly con SameSite, añadir un header CSRF custom (por ejemplo `X-App-CSRF: 1`) requerido en mutaciones. El navegador lo envía automáticamente desde scripts del mismo origen; un atacante cross-site no puede inyectarlo. Verificar el header en el servidor antes de procesar la mutación.

### Rate limiting diferenciado

Aplicar límites escalonados según el costo de la operación:
- **Global**: límite alto para tráfico general (ej. 300-1500 req/ventana).
- **Endpoints costosos**: límite menor para exportaciones, búsquedas pesadas, importaciones (ej. 20-60 req/ventana).
- **Autenticación**: límite estricto para login, OTP, registro (ej. 5-20 req/ventana más corta).

### Validación de configuración para producción

Implementar una función que valide la configuración al arranque y rechace combinaciones inseguras en producción: secretos débiles o placeholder, simuladores activos, cookies inseguras, datos demo habilitados. Separar APP_ENV (funcional: local/staging/production) de NODE_ENV (optimización de build/runtime).

```javascript
function productionViolations(config) {
  const violations = [];
  if (config.JWT_SECRET === 'changeme' || config.JWT_SECRET.length < 32)
    violations.push('JWT_SECRET es débil o placeholder');
  if (config.APP_ENV === 'production' && config.PROVIDER_MODE === 'mock')
    violations.push('Simulador activo en producción');
  return violations;
}
```

### Autenticación machine-to-machine

Para comunicación entre servicios propios, usar HMAC-SHA256 o esquemas similares en vez de compartir tokens de usuario. Leer [integrations.md](integrations.md) para el patrón completo con firmas, nonces anti-replay y scopes.

En cargas de archivos, validar tamaño y tipo real, generar nombres seguros y evitar path traversal y ejecución. En llamadas a URLs aportadas por usuarios, revisar SSRF. Usar mínimo privilegio para DB y procesos; no montar sockets administrativos en aplicaciones comunes.

## Organización de módulos

### Variantes de estructura

Elegir según complejidad; no imponer la más granular si el proyecto no la necesita:

**A. Layered MVC** — proyectos simples o funcionalidad acotada:
```text
controllers/   routes/   models/   services/   middleware/   utils/
```

**B. Controller-Service-Validator** — cuando se usa Zod/Ajv y la validación merece su propio archivo:
```text
controllers/   services/   validators/   middlewares/   routes/   lib/   config/
```

**C. Modular por dominio** — proyectos con múltiples dominios independientes:
```text
modules/<dominio>/
  <dominio>.routes.ts   <dominio>.service.ts   <dominio>.types.ts   helpers/
integrations/<sistema>/
  types.ts   http-client.ts   mock-client.ts   index.ts
lib/   middleware/   workers/
```

La convención `<dominio>.<capa>.js` (ej. `auth.service.js`, `documents.controller.js`) identifica claramente responsabilidad y dominio. Usar naming consistente dentro del proyecto.

### Composition root y DI manual

Para testing sin framework de inyección: crear una factory `createApp(overrides = {})` que construya el grafo de dependencias, donde cada servicio es una factory que recibe sus colaboradores. En tests, pasar mocks como overrides. No usar singletons ocultos que impidan sustituir dependencias.

### Máquinas de estado para ciclos de vida

Cuando una entidad tiene un ciclo de vida con estados y transiciones definidas (documento, orden, ticket), modelar las transiciones explícitamente:

```javascript
const transitions = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_SIGNED', 'REJECTED', 'EXPIRED'],
  PARTIALLY_SIGNED: ['SIGNED', 'REJECTED', 'EXPIRED'],
};
function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}
```

Validar transiciones en el servicio de dominio antes de persistir. No depender del frontend para impedir transiciones inválidas.

## Interfaz y contratos

Definir errores HTTP consistentes, paginación y filtros. No convertir entradas inválidas en valores nulos silenciosos que destruyan datos. Modelar actualizaciones parciales distinguiendo ausente, vacío y borrado explícito.

Reutilizar tokens/componentes del proyecto sin copiar marcas de ejemplos anteriores. Comprobar responsive, etiquetas, teclado, foco, contraste y reduced motion. Mantener reglas y validaciones equivalentes entre interfaz y servidor, siendo este la autoridad. Probar locale, caracteres Unicode y formatos de fecha/cantidad relevantes.

Cuando se generen PDF, imágenes o descargas, comprobar contenido y representación real, MIME, nombre y apertura; un archivo existente o un 200 no prueban validez. Para procesos de datos/ML, cuando formen parte del alcance, comprobar esquema, procedencia, reproducibilidad, particiones sin fuga y métricas acordadas, sin añadir microservicios no solicitados.

## Ledger de migraciones y readiness por motor

- **PostgreSQL:** Usar [migrate-postgres.template.mjs](../assets/migrate-postgres.template.mjs) y [wait-db.template.mjs](../assets/wait-db.template.mjs). Requiere conector `pg`. Tabla `_schema_migrations(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, executed_at TIMESTAMPTZ NOT NULL DEFAULT now())`. Emplea `pg_try_advisory_lock` y transacciones atómicas `BEGIN...COMMIT` por archivo.
- **MySQL:** Usar [migrate-mysql.template.mjs](../assets/migrate-mysql.template.mjs) y [wait-mysql.template.mjs](../assets/wait-mysql.template.mjs). Requiere conector `mysql2`. Emplea `GET_LOCK` con nombre derivado de la base y registro en `_schema_migrations`. Recordar que el DDL en MySQL ejecuta commit implícito, por lo que la serialización se asegura mediante el lock a nivel de conexión y registro ordenado.
- **MongoDB:** Usar [migrate-mongodb.template.mjs](../assets/migrate-mongodb.template.mjs) y [wait-mongodb.template.mjs](../assets/wait-mongodb.template.mjs). Requiere conector `mongodb`. Emplea scripts `.mjs` versionados que exportan `async function up(db)`, colección `_schema_migrations` y bloqueo atómico en `_migration_locks`.

En todos los motores: rechazar nombres inválidos, versiones duplicadas, checksum modificado, historia aplicada ausente y migraciones fuera de orden. Validar el historial completo antes de aplicar efectos nuevos. Probar sobre el motor real en contenedor; un mock no valida DDL ni locks reales del motor.

### Recuperación según motor

- **MySQL:** el lock se mantiene en una conexión dedicada y se libera al cerrarla. No asumir rollback del DDL: si una sentencia o el registro del ledger falla, puede quedar esquema parcialmente aplicado. Preparar migraciones reentrantes con comprobación del esquema, ensayar fallo intermedio y documentar recuperación manual/roll-forward. No reintentar ciegamente ni marcar una migración aplicada sin comprobar su efecto completo. `multipleStatements` solo se habilita en este runner para SQL versionado de confianza, nunca para entradas HTTP.
- **MongoDB:** `up(db)` y la inserción del ledger no son atómicos en esta plantilla. Diseñar `up` reentrante (`createIndex` con opciones estables, `updateMany` con filtros explícitos) para soportar interrupción antes del ledger. Usar validadores de colección e índices únicos según contratos, comprobar datos existentes antes de endurecerlos y versionar backfills. Importar únicamente `.mjs` propios e inmutables; no cargar código recibido del usuario.
- El lock Mongo no tiene expiración automática: si muere el runner, puede quedar `locked: true`. Ante timeout, verificar que no haya migrador vivo y revisar efectos/ledger antes de liberar manualmente el lock. No usar TTL o robo de lock sin un protocolo de lease/fencing probado: podría permitir dos migradores simultáneos. Errores de autorización/conexión no se convierten en contención.
- Estas pruebas con clientes simulados acreditan el comportamiento del runner, no compatibilidad real del motor. Ejecutar inicialización, repetición, contención y fallo intermedio contra el motor/versionado elegido en QA antes de declarar integración verificada.

Para sustituir el servicio PostgreSQL y configurar los conectores, leer [database-engines.md](database-engines.md).
