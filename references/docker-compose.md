# Docker Compose: contrato de entrega obligatorio

## Contenido

- 1. Resultado esperado
- 2. Arranque local sin dependencias ocultas
- 3. Servicios, red y URLs
- 4. Orden de inicialización y salud
- 5. Dockerfiles y datos durables
- 6. Desarrollo, QA y producción
- 7. Verificación obligatoria
- 8. Comandos de operación que debe tener el proyecto
- Documentación oficial para verificar detalles
- Plantillas incluidas


## 1. Resultado esperado

Entregar una aplicación que una persona pueda descargar, preparar una vez y levantar desde la raíz con `docker compose up --build -d`. No confundir entregar un ejemplo YAML con dockerizar el código real. Crear todos los Dockerfiles, scripts, configuraciones, lockfiles y carpetas que ese Compose referencia.

Para proyectos nuevos, usar esta distribución orientativa y adaptar nombres coherentemente:

```text
apps/web/                 Next.js, package.json, lockfile, Dockerfile, .dockerignore
apps/api/                 Node.js, package.json, lockfile, Dockerfile, .dockerignore
apps/api/migrations/      esquema y registro de versiones
apps/api/scripts/         migración, seed y health si se necesitan
infra/                    proxy u otras configuraciones realmente utilizadas
docker-compose.yml        ejecución local con imágenes construidas, sin código del host montado
docker-compose.dev.yml    override explícito para hot reload
docker-compose.qa.yml     pila de pruebas independiente y desechable
.env.example              configuración inicial, sin secretos reales
.gitignore                excluye .env, .env.qa, datos, dumps y evidencias sensibles
README.md                 guía de uso reproducible del proyecto generado
```

En monorepos con lockfile único, usar el contexto raíz y COPY de workspaces correctos; no exigir un lockfile ficticio por paquete. Elegir UNA base entre PostgreSQL, MySQL y MongoDB. Añadir cache, workers, correo local o proxy solo si los flujos lo necesitan. No copiar servicios ni nombres de proyectos de referencia.

## 2. Arranque local sin dependencias ocultas

Documentar exactamente estas etapas con comandos que existan:

1. Docker Engine/Docker Desktop funcionando y Compose v2 compatible con las opciones usadas.
2. Copiar `.env.example` a `.env` o ejecutar un inicializador que no sobrescriba configuración existente. Generar secretos aleatorios cuando hagan falta, usando un contenedor si no hay Node en el host. No pedir instalar Node, npm o DB local para este flujo.
3. Ejecutar `docker compose config --quiet` y `docker compose up --build -d`.
4. Esperar readiness de todos los servicios de larga duración y éxito de tareas de inicialización; abrir la URL documentada y verificar un flujo real.

Permitir defaults exclusivamente locales y sintéticos para una demo aislada. Publicar por loopback por defecto; marcar esos valores como no aptos para producción. Si se genera un admin inicial, permitir configurarlo de forma segura, no imprimir contraseñas en logs y no crear cuentas demo en producción. Fallar de forma clara ante variables productivas ausentes o valores de ejemplo. La falta de claves opcionales de terceros no debe bloquear toda la app: deshabilitar esa función y explicar su alcance; no fingir envíos o pagos.

No requerir dominio, certificado, nube ni red externa preexistentes para levantar local. Preparar el primer arranque contra un volumen vacío y el siguiente contra el volumen ya inicializado. Los scripts de `docker-entrypoint-initdb.d` normalmente solo actúan en una base vacía: no son un sistema de migraciones para actualizaciones.

## 3. Servicios, red y URLs

Separar `web` (Next.js), `api` (Node.js) y `db` (motor elegido). Usar nombres DNS de servicio para tráfico interno, como `api:4000` y `db:5432`; nunca IP fija de contenedor. Escuchar en `0.0.0.0` dentro del contenedor para recibir tráfico de la red Docker.

El navegador no resuelve `http://api:4000`. Preferir una entrada del mismo origen con `/api` hacia el backend mediante un proxy o mecanismo Next.js implementado y probado. Si se exponen dos puertos locales, configurar la URL pública del frontend y CORS/cookies coherentemente. Para LAN, `localhost` apunta al dispositivo del visitante; definir un origen alcanzable y verificarlo. Nunca publicar DNS interno ni secretos como variables `NEXT_PUBLIC_*`.

Distinguir variables de build de variables runtime: `NEXT_PUBLIC_*` se incorpora al bundle durante `next build`; cambiar `.env` y reiniciar no modifica ese bundle. Evitar necesitar DB o secretos productivos durante el build. Si Next prerenderiza datos dinámicos, ajustar el render/cache conscientemente, no conectar el build a producción. Documentar cuándo reconstruir y cuándo recrear; `docker compose restart` no aplica nuevas variables de Compose.

Definir red por proyecto. No fijar `container_name` ni nombres globales de volúmenes/redes que impidan instancias simultáneas. Un nombre de proyecto distinto no aísla recursos con `name:` global ni recursos `external`. Para dev/QA usar puertos configurables o sin publicar y proyectos distintos. Publicar la DB solo si hace falta depurar, mediante override opt-in y loopback; por defecto solo acceso interno.

## 4. Orden de inicialización y salud

Definir este contrato, sin depender de pausas arbitrarias:

- La base tiene healthcheck con herramienta incluida en su imagen y una consulta adecuada. Un puerto abierto no prueba autenticación/esquema.
- La migración espera a `db` con `condition: service_healthy`; termina con exit code 0 o bloquea la aplicación. Ejecutarla como tarea de una sola ejecución (`restart: "no"`) con `service_completed_successfully`, o mediante entrypoint equivalente que espere, migre y haga `exec` del proceso.
- Si se usa tarea separada, garantizar su ejecución también al actualizar una app/esquema; no reutilizar un contenedor viejo completado como evidencia de nuevas migraciones. Empaquetar migraciones con la imagen/versionado y ensayar actualización.
- El seed mínimo requerido sigue a las migraciones; debe ser idempotente y preservar datos editados, passwords y roles existentes. Fixtures extensas se limitan a dev/QA.
- API readiness verifica conectividad real y esquema listo; liveness solo indica que el proceso vive. Web tiene su healthcheck real. No exponer secretos en respuestas.
- `depends_on` ordena el inicio, pero no reemplaza manejo de desconexiones después del arranque. Implementar reconexión/reintentos acotados y probar recuperación.

Healthchecks deben usar binarios existentes (por ejemplo fetch de Node en imágenes compatibles), timeout, intervalo, start_period y retries razonables. Si un comando debe expandirse dentro del contenedor, usar correctamente `$$` para no consumir la variable en Compose. `restart: unless-stopped` puede ser apropiado para servicios, pero no reinicia automáticamente un contenedor solo por estar unhealthy; no prometer autocuración que no se implementó.

## 5. Dockerfiles y datos durables

Crear builds multi-etapa con instalación reproducible desde lockfile y dependencias de compilación separadas del runtime. Usar versiones mantenidas y compatibles, fijadas; no copiar tags antiguos de los ejemplos ni usar `latest` para un release. Añadir `.dockerignore` al contexto efectivo a partir de [dockerignore.template](../assets/dockerignore.template): excluir `.env` reales, `.git`, `node_modules`, `.next`, dumps, volúmenes locales y evidencias sensibles, conservando plantillas y archivos necesarios para build.

Para Next.js con `output: 'standalone'` (ver [next.config.template.mjs](../assets/next.config.template.mjs)), copiar el output trazado, `.next/static` y `public` cuando exista. En monorepo ajustar tracing/rutas reales y probar el comando final. Ejecutar el servidor standalone o `next start` coherente con el output; no servir una app con SSR como export estático por conveniencia. Evitar copiar paths que no existen.

Para Node.js, compilar TypeScript en build, conservar migraciones/scripts requeridos, usar el entrypoint real y manejar SIGTERM/cierre de conexiones. Usar [entrypoint.template.mjs](../assets/entrypoint.template.mjs) invocado explícitamente con `node entrypoint.mjs` (sin depender del shebang), o [entrypoint.template.sh](../assets/entrypoint.template.sh) asegurando terminaciones de línea LF mediante [gitattributes.template](../assets/gitattributes.template). La alternativa Node requiere copiar `entrypoint.mjs` y cambiar el Dockerfile a `ENTRYPOINT ["node", "entrypoint.mjs"]`; mantiene un proceso padre que propaga SIGTERM/SIGINT al hijo directo. El CMD debe ejecutar Node directamente para evitar capas shell; usar `init: true` para recolección de procesos. No equivale a `exec`: probar señales y tiempo de apagado dentro de la imagen final. Ejecutar web/API sin root, permisos de escritura mínimos y `init` cuando corresponda. No imponer read-only sin declarar directorios de cache/uploads/tmp que el runtime necesita.

Usar volúmenes nombrados para DB y uploads u otros datos durables. No guardar uploads solo en la capa efímera. Verificar ruta de datos del motor y versión elegidos, ownership y permisos, especialmente al cambiar tags. Separar caches reconstruibles de datos que necesitan backup. Persistencia no es respaldo: generar receta de backup y restauración aislada, y probarla cuando sea parte del alcance.

## 6. Desarrollo, QA y producción

**Base local:** imágenes compiladas, arranque completo, datos persistentes; no depender de código montado ni carpetas fuera del repositorio.

**Desarrollo:** override explícito con hot reload a partir de [docker-compose.dev.template.yml](../assets/docker-compose.dev.template.yml). Evitar que un bind mount tape `node_modules` de la imagen o mezcle binarios del host/WSL/Windows declarando volúmenes anónimos o nombrados específicos para `/app/node_modules` y `/app/.next`. Usar el target `development` de ambos Dockerfiles: no ejecuta el build productivo. La plantilla monta volúmenes nombrados con `nocopy: true` y ejecuta `npm ci` dentro del contenedor al arrancar para sincronizar el lockfile, sin copiar dependencias del host. No ejecutar instalaciones concurrentes sobre el mismo volumen. El comando de API espera y migra antes de `npm run dev`; adaptar el comando real de cada paquete para escuchar en `0.0.0.0`. Documentar: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`. Este override es PostgreSQL: al elegir otro motor, sustituir el puerto de depuración y los scripts; no conservar el mapeo 5432.

**QA:** preferir un Compose independiente para impedir heredar puertos/volúmenes de la app. Usar proyecto único por corrida, DB real, fixtures sintéticas, SMTP externo desactivado y sin destinatarios reales. Incluir runners para unitarias, módulos, integración y Playwright E2E, con browsers y dependencias del sistema en la imagen. Fijar versión del runner coherente con el lockfile. El E2E debe navegar a la pila compilada y ejercitar API/DB reales. Usar perfiles o comandos one-shot para no arrancar los tests con la aplicación normal.

**Producción:** si está solicitada, entregar configuración completa y explícita sin mounts de código, servicios dev ni credenciales demo, con proxy/TLS y DB sin publicar. No asumir que `ports: []` borra puertos heredados: verificar la configuración fusionada o usar archivo productivo independiente. Si se usan tags `!reset`/`!override`, documentar la versión Compose mínima requerida. No crear ni tocar DNS/certificados/servidores ajenos solo por generar esos archivos.

En proxy compartido, añadir únicamente el vhost/red del proyecto autorizado; no hacer depender el arranque del proxy de todas las apps. Validar sintaxis y comportamiento cuando un upstream falta o cambia IP. Confiar en cabeceras de proxy solo desde proxies conocidos y revisar cookies/URLs/rate limits bajo HTTPS.

## 7. Verificación obligatoria

Registrar cada gate separadamente en [el registro de verificación](../assets/verification-record.md):

| Gate | Ejecutar | Condición para PASS |
|---|---|---|
| DC-01 | `docker compose config --quiet` y análisis de configuración efectiva | Servicios, rutas, interpolación, redes y volúmenes válidos; sin secretos impresos |
| DC-02 | Build en copia limpia sin artefactos host | Imágenes se construyen desde manifiestos y lockfile |
| DC-03 | Arranque con volúmenes QA nuevos | DB lista, migración/seed exitosos, servicios listos dentro del timeout |
| DC-04 | Navegador → API → DB | Crear/consultar una entidad sintética y comprobar persistencia real |
| DC-05 | Reiniciar API y repetir seed/arranque | Sin duplicación, pérdida ni cambios inesperados |
| DC-06 | Recrear API y DB conservando volúmenes QA | Datos persistidos antes/después iguales según el contrato |
| DC-07 | Tests por runners de Compose | Unitarias, módulos, integración y E2E pasan con exit codes reales |
| DC-08 | Levantar dos proyectos QA con puertos distintos | Sin colisiones ni recursos compartidos involuntariamente |
| DC-09 | Logs y apagado de QA | Evidencia saneada, sin errores ocultos; solo recursos de la corrida afectados |

En apps con uploads, DC-06 también conserva un archivo y su checksum tras recrear API. Reiniciar solo el backend NO demuestra persistencia al recrear la base. Probar recuperación de conexiones después de reiniciar DB; no depender de un nuevo seed que enmascare la pérdida de datos.

La validación YAML o `config` es estática; no demuestra build, readiness ni funcionalidad. Si falta Docker o acceso al daemon, marcar los gates de ejecución BLOCKED y entregar igualmente Compose/Dockerfiles/runners terminados. No cambiar permisos del socket, usar privileged o alterar el host como atajo.

## 8. Comandos de operación que debe tener el proyecto

Documentar el comando exacto de cada entorno y directorio. En proyecto standalone local: `docker compose ps`, `logs --tail=100 api`, `stop`, `start` y `down` sin `-v` son operaciones habituales; explicar que `down` conserva volúmenes nombrados. No usar `down -v` para detener normalmente. Reset destructivo solo en entorno desechable identificado y con autorización explícita.

Cambios en Compose/env requieren `up -d`/recreación de los servicios afectados; cambios en código compilado requieren rebuild. En Compose compartido, elegir archivo/proyecto/servicios explícitos y valorar `--no-deps`; el comando global de arranque fácil se refiere al proyecto autónomo, no al servidor compartido.

No truncar logs del daemon mediante cron ni usar `docker system prune` como limpieza. Configurar rotación por servicio, límites de recursos medidos y retención; los límites reducen interferencia, no garantizan ausencia de pérdida ni aislamiento del host. Comparar configuración efectiva de archivos y contenedores: montar un archivo reemplazado por el editor puede conservar un inode anterior.

## Documentación oficial para verificar detalles

- [Inicio y dependencias de Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Servicios y healthchecks](https://docs.docker.com/reference/compose-file/services/)
- [Containerizar Next.js](https://docs.docker.com/guides/nextjs/)
- [Variables y self-hosting de Next.js](https://nextjs.org/docs/app/guides/self-hosting)

Consultar la versión aplicada al proyecto; estas referencias no sustituyen ejecutar la configuración generada.

## Plantillas incluidas

Copiar y adaptar desde `assets/`:
- `docker-compose.template.yml`, `docker-compose.dev.template.yml`
- `dockerignore.template`, `gitattributes.template`
- `api.Dockerfile.template`, `web.Dockerfile.template`, `next.config.template.mjs`
- `entrypoint.template.mjs` (Node.js agnóstico a CRLF) y `entrypoint.template.sh`
- `wait-db.template.mjs` / `migrate-postgres.template.mjs` (PostgreSQL)
- `wait-mysql.template.mjs` / `migrate-mysql.template.mjs` (MySQL)
- `wait-mongodb.template.mjs` / `migrate-mongodb.template.mjs` (MongoDB)
- `graceful-shutdown.template.mjs`, `env.template.example` y `ci-pipeline.yml`

Son piezas de generación, no una aplicación lista: resolver tags/rutas, crear lockfiles/scripts/seed/tests, configurar standalone y same-origin, definir runners QA y validar el resultado. Para backend JS sin build y monorepos adaptar COPY/CMD/contextos. Añadir .dockerignore real. La plantilla de persistencia se sustituye por el motor elegido, no se añaden motores innecesarios.

El entrypoint usa `pg` explícitamente instalado en la API; no requiere externalización Next. Los scripts nativos sin conector bastan para health HTTP o TCP, pero una comprobación TCP no acredita acceso a DB. En CI fijar acciones a commits revisados para mayor reproducibilidad y ajustar versiones; los tags de plantilla son orientativos. Preparación QA no debe depender de `.env.qa` antes de generarlo.
