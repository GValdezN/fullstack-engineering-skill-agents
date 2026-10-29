# Validar la skill y sus entregas

Usar esta guía al modificar la skill, sus plantillas o el verificador. No ejecutar toda esta evaluación por cada cambio pequeño de una aplicación. Distinguir regresiones de scripts, prueba de la pila sintética y evaluación del comportamiento de un agente.

## 1. Regresión de scripts (Windows y Linux)

Desde la carpeta `fullstack-engineering`:

```text
node --test tests/templates.test.mjs tests/smoke-preparation.test.mjs
```

Comprueba migradores con clientes simulados, cierre HTTP real, entrypoint, preparación aislada de fixtures y negativos del verificador. No requiere npm en el host ni descargar dependencias; sí Node compatible. La prueba de señal POSIX se omite en Windows explícitamente: Windows host no acredita señales Linux. La prueba Linux y los contenedores cubren ese entorno por separado.

El verificador `scripts/check-delivery.mjs` analiza Compose efectivo: separación de servicios, healthchecks activos, cadena de readiness (incluida tarea de migración completada), conectividad web–API y API–DB, separación web–DB, puertos loopback de web y ausencia de puertos publicados API/DB en el Compose base, contextos/Dockerfiles y volumen DB. Detecta bypass de aislamiento por `network_mode`/privileged. Está orientado al contrato local de esta skill; no usarlo como auditor universal de despliegues LAN, proxies externos u otras arquitecturas. Un PASS no evalúa el cuerpo real de un healthcheck, el SQL, credenciales ni conectividad runtime.

## 2. Aplicación mínima y recuperación ejecutable

Requisitos: Node en el host para el orquestador de pruebas, Docker Engine/Desktop accesible y Compose compatible con `up --wait`; acceso a registros de imágenes y npm durante el primer build. Este requisito Node corresponde a la herramienta de evaluación de la skill, no al arranque Docker de las aplicaciones entregadas.

```text
node scripts/run-smoke.mjs
```

El runner crea una copia temporal de `tests/fixtures/smoke-app`, resuelve allí las plantillas canónicas (sin mantener copias independientes del migrador), usa un proyecto Compose único y un puerto loopback asignado por Docker. La fixture contiene lockfiles y versiones concretas. No utiliza datos ni secretos del proyecto del usuario.

Gates ejecutados:

| Gate | Evidencia exigida |
| --- | --- |
| Configuración estática | El verificador acepta la configuración efectiva preparada |
| Build/arranque | Next standalone, API Node y PostgreSQL listos desde volumen vacío |
| Navegador → API → DB | Playwright crea nota, recarga y observa el registro; consulta SQL independiente confirma una sola escritura; entrada vacía devuelve 400 |
| Persistencia | `down` sin borrar volumen, recreación DB/API/web, misma nota por HTTP y SQL |
| Recuperación DB | Parar DB produce readiness 503; arrancarla restaura operación sin recrear API y sin perder nota |
| Backup/restauración | `pg_dump` restaurado con `ON_ERROR_STOP` en otra base de la misma pila QA; nota e histórico de migración presentes |
| Migración interrumpida | Terminar conexión PostgreSQL durante DDL/transacción; comprobar rollback y ledger ausente; corregir, aplicar y repetir sin duplicación |

La restauración usa una base distinta en el mismo contenedor QA: valida el dump lógico, no recuperación de un servidor completo ni desastre entre regiones. El smoke usa PostgreSQL; MySQL/MongoDB requieren integración equivalente del motor elegido. No extrapolar atomicidad de PostgreSQL a esos motores.

El runner elimina exclusivamente contenedores/redes/volúmenes de su proyecto `skill-smoke-*`, también al fallar. No ejecuta prune ni opera sobre stacks existentes. El checkout temporal se conserva al fallar para diagnóstico; no conserva DB QA tras cleanup. Si falla cleanup, el informe identifica el proyecto para limpieza posterior consciente. No ejecutar manualmente sus comandos destructivos sobre bases propias.

Guardar informes JSON fuera de la skill mediante `SMOKE_ARTIFACT_DIR`; por defecto van a la carpeta temporal del sistema, subcarpeta `skill-smoke-reports`. Código 0 = PASS, 1 = FAIL y 2 = BLOCKED por daemon no disponible. No declarar el flujo verificado cuando se devolvió 2. La ejecución normal puede tardar varios minutos por descargas/build.

Para inspeccionar la app antes de ejecutar:

```text
node scripts/run-smoke.mjs --prepare RUTA_NUEVA
```

Desde esa carpeta nueva: `docker compose up --build -d --wait`; consultar puerto con `docker compose port web 3000`. El preparador rechaza carpetas existentes. No copiar la fixture cruda como aplicación completa: el preparador agrega los scripts y configuraciones canónicos necesarios.

## 3. Evaluación de uso por un agente

Los casos versionados están en [use-cases.json](../tests/use-cases.json): app nueva, bug acotado, cambio de base de datos, función pura, módulo, integración externa y coherencia con convenciones del proyecto. Preparar un workspace nuevo por caso con el comando `setup` indicado. Para app nueva comenzar con directorio vacío. Los casos de función, módulo, integración y convenciones usan una copia limpia preparada de la app sintética; su proceso esperado está en [change-engineering.md](change-engineering.md). En el caso convenciones, contrastar el perfil observado con los archivos reales y comprobar nombres/mapeos sin reestructuración ajena al alcance. En el caso función, comprobar que el agente no convierte el cambio en una reconstrucción del sistema; en módulo e integración, que conecta y prueba a los consumidores reales. Usar el prompt exacto con un cliente/agente compatible y la ruta real a esta skill; no asumir un CLI ni un comando de invocación que no se haya comprobado.

Para aislar la evaluación:

1. Entregar al agente únicamente prompt, skill y workspace inicial. No dar la solución ni este checklist como respuesta esperada.
2. Registrar cliente/modelo, versión de skill o checksum del ZIP, entorno, prompt y estado inicial de los archivos. Mantener presupuesto acotado por caso; al vencer, registrar incompleto.
3. Ejecutar los criterios de `acceptance` contra la entrega: revisar diff, levantar desde copia limpia y probar resultados por HTTP/navegador/SQL. No aceptar la afirmación del agente como evidencia.
4. Guardar por criterio `PASS`, `FAIL`, `BLOCKED` o `INCONCLUSIVE`, comando/observación y ubicación de evidencia. Registrar efectos fuera del alcance aunque los tests pasen. El caso falla si hay pérdida de datos, cambio de stack no pedido o afirmación de verificación sin ejecución.
5. Para migración de motor, crear al menos dos notas de texto distinto en origen, incluyendo Unicode; comparar IDs/textos ordenados en destino y confirmar que origen conserva ambos. Repetir transferencia y verificar ausencia de duplicados.
6. Corregir la skill por defectos observados; repetir el caso fallido y las regresiones afectadas. No convertir una preferencia del ejemplo en regla universal.

La preparación automática de fixtures no equivale a evaluación realizada. Sin invocar un agente y observar su resultado, dejar esos casos pendientes. No automatizar invocaciones pagadas, conexiones externas o permisos de otro cliente por inferencia.

## 4. CI de la propia skill

[skill-ci.yml](../assets/skill-ci.yml) se copia a `.github/workflows/skill-validation.yml` en un repositorio cuya raíz contiene `fullstack-engineering/`. Si la estructura difiere, adaptar todas las rutas de comandos y artefactos. Este workflow valida la skill; `assets/ci-pipeline.yml` sigue siendo la plantilla de CI para las aplicaciones generadas.

- Matriz Windows/Linux con Node 22/24 para scripts y preparación.
- Job Linux separado para build Docker, navegador, persistencia, backup y recuperación.
- Reporte JSON subido aun si el smoke falla; ausencia de reporte es error de entrega de evidencia.

Agregar estos archivos no activa CI hasta que exista un repositorio remoto con Actions y el workflow se publique de forma autorizada. Los casos de agente son evaluación explícita aparte, sin consumo automático de APIs/modelos en CI. Revisar versiones Node, dependencias y acciones antes de actualizarlas; mantener alineadas versión de Playwright y su imagen.
