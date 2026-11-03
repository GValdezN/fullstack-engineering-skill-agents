# Operación aislada y cambios recuperables

## Contenido

- Aislamiento antes de ejecutar
- Migraciones y entrega
- Observabilidad y privacidad
- Orquestación con Docker Compose
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

### Request ID para correlación

Generar un ID único por request al inicio del middleware chain y propagarlo en headers de respuesta y logs:

```javascript
function requestId(req, res, next) {
  req.id = crypto.randomBytes(6).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}
```

Incluir el request ID en todas las entradas de log, errores y respuestas de error para correlación end-to-end. Si hay servicios downstream, propagar el ID como header.

### NDJSON para logging estructurado

Para operaciones asíncronas, sincronizaciones y procesos batch, usar Newline-Delimited JSON (un evento JSON por línea):

```javascript
function logEvent(stream, event) {
  stream.write(JSON.stringify({ ...event, ts: new Date().toISOString() }) + '\n');
}
```

Facilita análisis con herramientas estándar (`jq`, `grep`), agregación en sistemas de logs y parsing programático. Nombrar archivos con timestamp del inicio de la operación. No mezclar logs estructurados con `console.log` sin formato en la misma salida.

### Dry-run para operaciones administrativas

Implementar un modo preview para operaciones destructivas o masivas:

```javascript
router.post('/admin/sync', requireAdmin, async (req, res) => {
  const apply = req.query.apply === '1';
  const plan = await computeSyncPlan();
  if (!apply) return res.json({ mode: 'dry-run', plan });
  const result = await executeSyncPlan(plan);
  res.json({ mode: 'applied', result });
});
```

Sin el flag explícito (`?apply=1`), la operación solo muestra qué haría. Para operaciones irreversibles extremas, usar un token de confirmación (ej. `?confirm=BORRAR-TODO`) como safety gate adicional. Proteger la ruta de ejecución con autorización estricta (admin o localhost-only).

## Orquestación con Docker Compose

Para la metodología completa de construcción, red, healthchecks, same-origin y plantillas, leer [docker-compose.md](docker-compose.md). Esta sección cubre principios operativos complementarios, no repetidos allí.

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
