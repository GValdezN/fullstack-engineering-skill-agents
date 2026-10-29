# Pruebas con resultados confiables

## Preparar el entorno

Inspeccionar scripts antes de ejecutarlos. Crear DB/volúmenes/puertos aislados con identificador de corrida, fixtures sintéticas y credenciales de QA. Validar host y nombre de base antes de cualquier reset. Nunca confiar solo en que una variable se llame TEST. No usar datos, destinatarios o cuentas reales para probar efectos externos sin autorización específica.

Usar scripts existentes o agregar scripts reales como `test:unit`, `test:module`, `test:integration` y `test:e2e`; no documentar comandos que no existen. Permitir ejecución individual y agregada con códigos de salida correctos. Instalar dependencias necesarias cuando sea viable y autorizado; ausencia inicial no es bloqueo definitivo.

## Capas y oráculos

| Capa | Qué ejercitar | Evidencia mínima |
|---|---|---|
| Unitaria | Regla pura, normalizador, validador, transición | Aserciones independientes en éxito, límite y error |
| Módulo | Servicio con colaboradores internos reales o componente interactivo | Contrato público, interacciones, fallos y estado final |
| Integración | API/servicios/repositorios con motor DB real | Persistencia, constraints, permisos, migración y rollback |
| E2E | Entrada pública/navegador → API → DB → resultado | Flujo observable completo y efectos persistidos |

Vitest o el runner Node sirven para lógica; Testing Library para componentes; Supertest o HTTP real para API; Playwright para navegador. Adaptar a la arquitectura real. Una prueba de módulo no necesita ser una copia de la unitaria: comprobar la composición de responsabilidades por su API pública.

En E2E arrancar el build de Next.js y backend reales contra DB de QA. No interceptar la API propia para fingir que funciona. Doblar proveedores de terceros solo en el límite y etiquetar el resultado **E2E interno con proveedor simulado**. Ejecutar contratos/sandbox reales por separado cuando sean necesarios. Si la aceptación depende del proveedor/dispositivo real, conservarla BLOCKED hasta observarla.

## Matriz de casos

Para cada regla crítica incluir, según aplique:

- Camino normal, vacío, mínimo/máximo, inválido y no autorizado.
- Repetición y doble clic; dos actores simultáneos con barrera controlada, no `sleep` al azar.
- Recursos insuficientes y conflictos de versión; rollback sin efectos parciales.
- Timeout, rechazo de proveedor, respuesta malformada, desconexión y recuperación.
- Crash después de commit y antes de confirmar; reintento sin duplicación.
- Cambios manuales concurrentes; confirmación caducada; transición fuera de orden.
- Sesión vencida/usuario desactivado y acceso cruzado de propietario/tenant.
- Migración limpia, actualización desde versión anterior y seed repetido.
- Recarga/reinicio con persistencia conservada; listas vacías, errores visibles y uso por teclado.

En APIs que escriben, verificar DB y efectos negativos, no solo status/texto. En colas verificar destinatario, orden y exclusión acordada. En exportaciones abrir y revisar el archivo; cuando importe el diseño, renderizarlo. Para límites temporales inyectar reloj/semilla controlados y añadir casos de frontera.

## Evitar falsos verdes

- Registrar cantidad recolectada, PASS, FAIL y SKIP. Cero tests o una suite omitida no cumplen un gate.
- Mantener el código de salida; si se usa `tee`, activar `pipefail`. Esperar todos los procesos y conservar su estado individual.
- No usar `|| true`, mocks globales, assertions triviales ni tests que solo comparan el código consigo mismo.
- No reemplazar el motor real por memoria/SQLite y afirmar integración del motor elegido. Las pruebas rápidas embebidas pueden complementar, no sustituir, semántica real.
- Un corpus sintético diseñado junto al parser mide regresión; añadir casos independientes y no presentar su tamaño como cobertura del mundo real.
- Un retry exitoso no demuestra que la causa de un flaky se resolvió. Registrar intento fallido, aislar causa y verificar corrección. No subir timeouts sin evidencia.
- El porcentaje de cobertura es diagnóstico, no aceptación. Comprobar invariantes y rutas de fallo; fijar umbrales por riesgo del proyecto, sin números arbitrarios universales.

## Evidencia y limpieza

Guardar logs saneados, reportes del runner, traces/capturas de fallos y revisión/hash del código probado. Registrar SO/runtime/DB, configuración no secreta, hora con zona y limitaciones de simulación. No heredar conteos históricos como si fueran actuales.

Limpiar solo recursos de la corrida, cerrar procesos y preservar evidencia necesaria. `finally` no garantiza limpieza tras kill/caída del host: registrar recursos creados para recuperación manual segura. No truncar bases compartidas ni limpiar backups ajenos.

## CI y cierre

Configurar CI reproducible cuando forme parte del proyecto: instalación desde lockfile, lint/tipos/build, unitarias/módulo, servicio DB real, migraciones, integración y E2E con artifacts de fallos. Un fallo debe fallar el job. Separar servicios externos opcionales de gates obligatorios; no volver opcional un gate solo porque falla.

Tras la última corrección ejecutar los gates afectados y los obligatorios. Clasificar PASS, FAIL, BLOCKED, SKIP y N/A con razones; no sumar SKIP a PASS. Si falla infraestructura, diagnosticar recursos/conexión y repetir tras corregir; no atribuir una causa de código sin evidencia.

## Primera capa nativa y contenedores

Preferir `node:test` con `node:assert/strict` para lógica pura, invariantes y contratos HTTP de backend. Ejecutar `node --test` con selección de archivos compatible con la versión Node mantenida del proyecto; usar `.mjs` o JS compilado si TypeScript requiere compilación. No fijar Node 20 por una experiencia histórica ni prometer tiempos universales. Conservar runners existentes si cambiarlos no aporta valor.

Vitest/Testing Library son apropiados cuando se necesitan transformaciones o entorno de componentes; Playwright cubre navegador real, no solo comprobación visual. `node:test` también puede ejecutar integración si conecta realmente HTTP/DB; un servidor fake no la convierte en integración de producción. No sacrificar cobertura para evitar dependencias.

Crear runners Compose para todas las capas, con browser/dependencias en la imagen E2E; propagar exit codes. Ejecutar los scripts de inicio y resolución de módulos dentro del runtime final sin bind mounts. Completar gates DC-01 a DC-09 de docker-compose.md. Guardar evidencia diferenciada de sintaxis, build, arranque, tests y persistencia.

## Fixtures, ejemplos y fuentes independientes

Guardar fixtures sintéticas y oráculos de regresión versionados dentro de `tests/fixtures` o `qa/fixtures`, separados de backups operativos y dumps. Una limpieza de respaldos no puede borrar la capacidad de repetir los tests. No tratar corpus generado por el mismo algoritmo como cobertura independiente del lenguaje real.

Probar copiando literalmente los ejemplos que la aplicación entrega al usuario: ayuda, comandos, plantillas y payloads. Verificar que parser/router/validador aceptan esa salida sin correcciones manuales. Cubrir caracteres Unicode, espacios, plurales, signos, saltos de línea y entradas que no deben interpretarse como comandos.

Usar un lector/sesión independiente para verificar efectos externos persistidos cuando el proveedor use cachés o transacciones de sesión. Ejercitar el runtime real de workflows para ramas vacías, índices de salida y finalizers. Conservar fixtures mínimas independientes de la implementación y pruebas adversariales con negativos. La prueba física/dispositivo o proveedor real sigue pendiente si solo se probó el simulador.

## Aislamiento por caso y límites de observación

Aislar también cada caso: breaker, reloj, caché, lease y estado de fallos intencionales no deben contaminar el siguiente. Correlacionar runId/caseId/actor/operación y ventana temporal; consultas globales pueden contar fallos deliberados de otro test. Verificar precondiciones: un fixture anunciado “varios” contiene varios, “concurrente” coordina al menos dos actores y “otro propietario” usa otra identidad.

Probar la matriz anónimo/propietario/otro propietario/admin/roles con cuentas separadas. Incluir capacidades que deben estar deshabilitadas en producción (rutas demo/debug, seeds y cabeceras de identidad no confiables). No generalizar permisos cliente desde una cuenta que también es administradora.

Usar **INCONCLUSIVE** cuando una prueba sí corrió pero el observador no pudo acreditar el efecto; registrar qué señal faltó. BLOCKED significa que un requisito impidió ejecutarla. Ninguno equivale a PASS. Diferenciar “no observable” de “ausente” y “no entregado”.

Desactivar un flag demo no elimina cuentas o datos ya creados: inventariar y retirar solo fixtures identificadas antes de producción. No desactivar rate limits para esconder interferencia del QA; aislar actores/ventanas y respetar Retry-After. No sumar resultados de diferentes revisiones, ejecuciones de terceros o checks sin conteo como si fueran una única suite actual.

Para validar las plantillas incluidas, ejecutar `node --test tests/templates.test.mjs tests/smoke-preparation.test.mjs` desde la carpeta de la skill. Son pruebas de orquestación con cliente DB simulado y del apagado Node; no acreditan SQL PostgreSQL real, build Docker ni integración de una app generada.

Para probar la pila real y fallos de recuperación, ejecutar `node scripts/run-smoke.mjs` según [skill-validation.md](skill-validation.md). Esa guía también define escenarios de evaluación del agente y la matriz CI de la propia skill.
