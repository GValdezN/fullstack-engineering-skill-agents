# Operación aislada y cambios recuperables

## Contenido

- Aislamiento antes de ejecutar
- Migraciones y entrega
- Observabilidad y privacidad
- Metodología de orquestación con Docker Compose (Frontend, Backend y Persistencia)
- Puertos sin colisiones y Windows/WSL
- Señales y apagado ordenado
- Operación con evidencia y reanudación


## Aislamiento antes de ejecutar

Mapear propietarios de servicios, redes, bases, volúmenes, puertos, variables, imágenes, proxy, tareas y proveedores. Contenedores distintos no implican aislamiento: pueden compartir redes, credenciales, tags, recursos o un Compose que opera sobre todos.

Crear un entorno QA independiente con nombres, puertos, redes, volúmenes y tags propios. No reutilizar tags de producción para builds de prueba. Aplicar límites de memoria/CPU y concurrencia al tamaño del host; ante OOM detener la carga y diagnosticar. No ejecutar suites pesadas concurrentemente sin presupuesto.

Operar sobre archivo Compose, proyecto y servicio explícitos. Evaluar dependencias antes de usar `--no-deps`; esa opción no vuelve segura una migración incompatible. Evitar `down`, `restart` o `up` global en hosts compartidos. No alterar redes/firewall/proxy de proyectos ajenos como efecto lateral.

Validar configuración de proxy antes de recargar y comprobar resolución DNS ante dependencia ausente y recreación de contenedor. Un test sintáctico no prueba conectividad ni comportamiento. Revisión de permisos/montajes: un socket administrativo montado read-only no necesariamente limita las operaciones de su API.

## Migraciones y entrega

1. Comprobar alcance y autorización de despliegue. Preparar versión/imagen inmutable y diff de configuración sin secretos.
2. Respaldar lo necesario y validar restauración en entorno aislado. Listar un dump no demuestra que pueda restaurarse de punta a punta.
3. Ensayar migración con datos representativos; preferir expand/contract y compatibilidad con la versión anterior. No ejecutar migraciones destructivas por rutina de arranque sin control.
4. Definir rollback de aplicación y estrategia de datos por separado. No restaurar un dump sobre datos nuevos para revertir solo código. Si no hay reversión segura, preparar roll-forward y declararlo.
5. Desplegar solo lo autorizado. Diferenciar código entregado, deploy, flags activos y validación funcional.
6. Verificar hash/versión efectiva, readiness de dependencias, logs y flujo funcional. No asumir que archivo generado, publicado y ejecutado son iguales; compararlos cuando exista pipeline de generación.
7. Observar errores/latencia/colas y activar reversión ante umbrales acordados. Registrar resultado y recursos afectados.

## Observabilidad y privacidad

Distinguir liveness de readiness. Registrar request/correlation ID, estado y error saneado. Medir disponibilidad funcional, latencia, errores, backlog y reintentos relevantes; no confundir visitas, bots y requests con usuarios únicos. Definir retención y minimizar datos personales. Las alertas deben evitar tormentas mediante deduplicación y límites, sin ocultar fallos.

Mantener un estado actual breve con evidencia y una bitácora fechada cuando la tarea lo requiera. Marcar datos históricos supersedidos y separar hechos observados de hipótesis. Una sesión abierta o una marca de modificación no demuestra trabajo continuo ni validación ejecutada.

## Metodología de orquestación con Docker Compose (Frontend, Backend y Persistencia)

### 1. Topología de red y aislamiento perimetral

- **Red privada dedicada:** Orquestar los servicios (`web`, `api`, base de datos y auxiliares) dentro de una red bridge interna propia del proyecto (ej. `internal_net`). Esto habilita resolución DNS automática por nombre de servicio (`http://api:4000`, `db:5432`) sin exponer nombres ni puertos al exterior.
- **Mínimo privilegio de puertos:**
  - El frontend local publica solo loopback, por ejemplo `127.0.0.1:${WEB_HOST_PORT:-3100}:3000`. Exposición LAN/pública requiere configuración explícita.
  - La API backend, base de datos y servicios auxiliares **no deben** exponerse a interfaces públicas (`0.0.0.0`). Si se requiere acceso para depuración o herramientas locales de desarrollo/QA, atar explícitamente a localhost: `127.0.0.1:${API_PORT:-4000}:4000` y `127.0.0.1:${DB_PORT:-5433}:5432`.
- **Integración con host (Host Gateway):** Cuando un contenedor requiera consumir servicios auxiliares que corren directamente en la máquina anfitriona fuera de Docker, configurar `extra_hosts: ["host.docker.internal:host-gateway"]`.

### 2. Construcción multi-etapa (Multi-Stage) y empaquetado seguro

Diseñar Dockerfiles independientes para frontend y backend con separación estricta entre compilación y ejecución:

- **Backend (Node.js API):**
  - *Etapa Build:* Imagen base de compilación (`node:<version>-bookworm-slim` o `alpine`), instalación determinista de dependencias completas (`npm ci`), generación de esquemas/clientes de persistencia (ej. ORM/ODM) y compilación TypeScript (`npm run build`).
  - *Etapa Runtime:* Imagen base mínima/slim. Copiar únicamente artefactos compilados (`dist/`), archivos de definición (`package.json`, lockfile) y dependencias de producción (`npm ci --omit=dev` o `node_modules` de producción).
  - *Seguridad:* Ejecutar siempre bajo un usuario sin privilegios (`USER node`), nunca como root.
  - *Volúmenes persistentes:* Usar volúmenes nombrados para archivos subidos o generados con permisos explícitos de usuario.
  - *Script de entrada (`docker-entrypoint.sh`):*
    1. Comprobar disponibilidad de la base de datos antes de proceder.
    2. Ejecutar migraciones automáticas no destructivas (`migrate deploy` o equivalente).
    3. Ejecutar semillas sintéticas idempotentes si el entorno lo exige.
    4. Traspasar el control al proceso Node mediante `exec node dist/main.js` para propagar señales de terminación (`SIGTERM`, `SIGINT`) y permitir un apagado ordenado.

- **Frontend (Next.js / SSR):**
  - *Etapa Build:* Instalar dependencias, inyectar variables públicas requeridas en compilación (`NEXT_PUBLIC_*`), compilar Next.js en modo standalone (`output: 'standalone'` en `next.config.js`). Esto genera un bundle autónomo con el servidor web mínimo necesario, reduciendo drásticamente el peso de la imagen al incluir solo las dependencias de Node indispensables.
  - *Etapa Runtime:* Imagen ligera (`node:<version>-alpine`), copiar `package.json`, `.next/standalone`, carpetas `.next/static` y `public`. Ejecutar como usuario sin privilegios `USER node` con comando `node server.js` o script de entrada.

### 2.1. Entrypoints mínimos y Standalone

Usar por defecto APIs nativas `node:crypto`, `node:fs`, `node:http` y `node:net` en entrypoints, readiness y healthchecks. Los scripts auxiliares no deben depender accidentalmente del árbol del build. Mantener migraciones y seeds de dominio en la API Node.js, que instala explícitamente sus dependencias productivas; `serverExternalPackages` solo pertenece a Next.js.

En un auxiliar dentro de Next standalone, permitir conectores necesarios declarados en dependencies y externalizados cuando corresponda. `serverExternalPackages` evita bundling, pero NO garantiza por sí solo que un script no trazado y sus dependencias transitivas aparezcan en la imagen. Incluirlos mediante tracing/copia o instalación productiva específica y ejecutar import/resolución y el propio auxiliar dentro de la imagen final, sin mounts ni node_modules del host. Copiar scripts, SQL y manifiestos con permisos correctos. Probar CJS/ESM y extensiones de imports del artefacto real.

No reemplazar hashing seguro por un hash rápido para eliminar dependencias. Hashes precalculados solo para fixtures estáticas sintéticas y algoritmos/parámetros compatibles; nunca credenciales productivas comunes ni contraseñas en claro en logs. Para bootstrap real generar/recibir una contraseña única y usar el algoritmo seguro del sistema.

### 3. Conexión de servicios: Patrón de Mismo Origen (Same-Origin via Rewrites)

En lugar de que el navegador del cliente consulte directamente la API en otro puerto o dominio (lo que obligaría a habilitar CORS permisivo, expondría el puerto de la API y complicaría las cookies de sesión):

- **Proxy Inverso en Frontend:** Configurar reescrituras de rutas en el servidor de frontend (ej. `rewrites()` en `next.config.js`):
  ```javascript
  const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://api:4000';

  module.exports = {
    output: 'standalone',
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: `${API_INTERNAL_URL}/api/:path*`,
        },
      ];
    },
  };
  ```
- **Inyección por entorno en Docker Compose:** Para rewrites de next.config resueltos al compilar, suministrar durante el build (reiniciar con una variable distinta no reescribe las rutas compiladas). Si se necesita configuración runtime, implementar y probar un proxy runtime. Suministrar la dirección interna en la red de Docker:
  ```yaml
  services:
    web:
      build:
        args:
          API_INTERNAL_URL: http://api:4000
  ```
- **Ventajas críticas:**
  1. **Cero CORS para la web:** Para el navegador, todas las llamadas van a `http://<host-web>/api/...`. El servidor frontend las retransmite internamente a `api:4000`.
  2. **Cookies seguras de primer origen:** Las cookies de sesión pueden configurarse como `HttpOnly`, `Secure` y `SameSite=Strict`, reduciendo exposición a CSRF sin reemplazar validación de Origin/token según la operación y evitando el bloqueo de cookies de terceros en navegadores modernos.
  3. **Aislamiento perimetral:** El puerto del backend no necesita estar abierto a Internet; solo es alcanzable dentro de la red interna de contenedores.

### 4. Orquestación y arranque determinista (Healthcheck Chaining)

No utilizar esperas basadas en temporizadores ciegos ni suposiciones de tiempo. Implementar una cadena de salud basada en readiness comprobada:

1. **Persistencia (DB):**
   - Healthcheck nativo (`test: ["CMD-SHELL", "...ping/isready..."]`).
   - Intervalos, timeouts y reintentos definidos (`interval: 5s`, `timeout: 5s`, `retries: 5`, `start_period: 10s`).
2. **Backend API:**
   - Dependencia condicionada: `depends_on: { db: { condition: service_healthy } }`.
   - Endpoint `/health` o `/api/health` en la API que compruebe la conectividad real con la base de datos antes de devolver HTTP 200.
   - Healthcheck en Compose: un script nativo con `fetch(url, { signal: AbortSignal.timeout(2500) })`, comprobación de status y `.catch(() => process.exit(1))`; usar un Node compatible y timeout Compose mayor al de la consulta.
3. **Frontend Web:**
   - Dependencia condicionada: `depends_on: { api: { condition: service_healthy } }`.
   - Healthcheck propio que verifique respuesta del servidor HTTP.
   - Ordena el inicio para que la primera comprobación espere readiness; después del arranque deben manejarse caídas/reconexiones y readiness degradada.

### 5. Una sola plantilla canónica

Usar [docker-compose.template.yml](../assets/docker-compose.template.yml) y la guía [docker-compose.md](docker-compose.md). Completar rutas, scripts e imágenes para cada proyecto y comprobar la configuración efectiva. El Compose base no publica DB/API. La exposición de depuración se añade mediante override opt-in con puertos loopback desplazados; así la guía y la plantilla comparten el mismo contrato.

## Puertos sin colisiones y Windows/WSL

Mantener puertos internos estándar: PostgreSQL 5432, MySQL 3306, MongoDB 27017, Redis 6379. Usar DNS del servicio sin pasar por el host. No publicar DB por defecto. Si herramientas locales lo requieren, usar override explícito y loopback: `127.0.0.1:${PG_HOST_PORT:-5433}:5432`, MySQL 3307:3306, Mongo 27018:27017, Redis 6380:6379. Desplazar también web/API si están ocupados; todos deben ser configurables. Desplazados no significa garantizados libres.

En `.env.example` distinguir `DATABASE_URL_DOCKER` (db:5432) y `DATABASE_URL_LOCAL` (localhost:5433); el backend contenedorizado recibe `DATABASE_URL` desde la primera. No cambiar el puerto interno por una colisión host. En Windows comprobar listeners y rangos TCP excluidos; proponer un puerto libre fuera del rango, sin detener servicios ajenos ni cambiar reservas del sistema. Registrar el puerto efectivo en URLs de prueba y README.

### Compatibilidad Windows y Linux en contenedores:
1. **Finales de línea CRLF vs LF:** En Windows los scripts `.sh` guardados con saltos `CRLF` arrojan el error `/usr/local/bin/app-entrypoint: line 2: \r: command not found` dentro de contenedores Linux. Para evitarlo:
   - Configurar [gitattributes.template](../assets/gitattributes.template) con `*.sh text eol=lf`.
   - O invocar explícitamente con `node entrypoint.mjs` el entrypoint de Node.js [entrypoint.template.mjs](../assets/entrypoint.template.mjs).
2. **Hot-Reloading en Windows/WSL2:** Los eventos de sistema de archivos (inotify) a menudo no se propagan a través de montajes de volúmenes en Windows/WSL. Usar [docker-compose.dev.template.yml](../assets/docker-compose.dev.template.yml) con `WATCHPACK_POLLING=true` cuando el watcher utilizado lo admita; verificar un cambio visible sin reiniciar. Next.js con Turbopack puede requerir otra estrategia según versión. Si los eventos no llegan, preferir archivos dentro del filesystem Linux de WSL o una sincronización compatible; no prometer que WATCHPACK configura todos los watchers.

## Señales y apagado ordenado

Usar [graceful-shutdown.template.mjs](../assets/graceful-shutdown.template.mjs) en la API. Al recibir SIGTERM/SIGINT: marcar readiness false, frenar workers/consumidores, dejar de aceptar HTTP, drenar peticiones en curso y luego cerrar pool y recursos. Hacer el cierre idempotente, con deadline menor que `stop_grace_period`; errores/timeout producen salida no exitosa. Gestionar WebSocket/SSE explícitamente si existen. No copiar solo `pool.end(); process.exit(0)` porque puede interrumpir peticiones que aún usan la base. `exec "$@"` en el entrypoint y CMD en formato exec permiten que el proceso reciba señales. No sustituir el servidor standalone de Next por este patrón sin adaptar su ciclo de vida.

Probar una petición lenta, SIGTERM, rechazo de nuevas conexiones, drenado previo al pool, señal repetida y cierre con timeout. Al morir un proceso, TCP normalmente libera conexiones: no afirmar que siempre quedan huérfanas; el objetivo es evitar trabajo interrumpido y cerrar recursos limpiamente.

## Operación con evidencia y reanudación

Antes de reanudar una sesión/despliegue interrumpido, reconciliar fuente/generador, artefacto publicado, esquema y configuración efectivos. La interrupción no demuestra rollback. Comprobar `.env` → Compose renderizado → variables recibidas por el proceso, sin imprimir secretos. Probar flags OFF/ON y sus dependencias; preparar compatibilidad N/N+1 durante publicaciones parciales o drenar consumidores selectivamente. Detener el cutover si el esquema/contrato del destino no cumple precondiciones.

Clasificar secretos por función: autenticación, firma o cifrado de datos persistidos. Inventariar consumidores y datos cifrados antes de rotar. Una clave de cifrado no se cambia como una contraseña sin plan de recifrado/recuperación y prueba de lectura de datos anteriores.

En monitorización distinguir observación válida, ausencia de dato (`UNKNOWN`) y cambio confirmado. No sustituir último dato válido por null ni anunciar recuperación solo porque regresó una sonda. Separar salud declarada del proveedor, éxito funcional reciente y falta de tráfico. Excluir errores del propio envío de alertas del criterio que dispara nuevas alertas; definir enfriamiento y canal alternativo si el canal monitorizado falla.

Manejar explícitamente errores de clientes ociosos del pool además de errores de consultas activas; no ocultar ni convertir todo error en “desconexión”. Probar caída y recuperación de DB con la app viva: readiness degradada, errores controlados y recuperación sin duplicación. Los advisory locks de sesión requieren la misma conexión dedicada para adquirir/liberar.

Definir semántica, denominador, retención y cardinalidad de cada métrica; no usar PII/URI libre como labels ni confundir requests con usuarios. Una sonda desde el mismo host no prueba conectividad de usuarios externos. Para jobs operativos autorizados verificar programación activa → ejecución → artefacto utilizable → aplicación/restauración → alerta de fallo.

Antes de ampliar accesos por un 401/403, reproducir el protocolo HTTP real (método, redirecciones, cookies y contenido) y distinguir observación de hipótesis. Probar proxy con WebSocket/SSE si se usan: upgrade, cabeceras efectivas, buffering y timeout; la sintaxis válida no garantiza funcionamiento. No cambiar permisos ni autenticación a partir de una causa no demostrada.
