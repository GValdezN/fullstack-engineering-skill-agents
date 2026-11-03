# Ingeniería por función, módulo o integración

Usar al agregar o modificar una parte de un sistema. El entregable es el cambio funcionando en su contexto real, con un proceso y evidencia ajustados a esa unidad. No transformar cada función en un proyecto fullstack nuevo ni generar infraestructura que el cambio no necesita.

## Elegir la unidad y el tipo de cambio

Identificar dos dimensiones: **unidad** (función, módulo, integración, flujo transversal o aplicación nueva) y **naturaleza** (alta, corrección, ampliación, refactor o migración). Una corrección de una integración sigue necesitando comprobar sus límites externos; un refactor de una función debe preservar el comportamiento acordado.

| Unidad | Delimitar antes de implementar | Verificación según el comportamiento |
| --- | --- | --- |
| Función o utilidad | Firma, entradas/salidas, errores, efectos, consumidores y compatibilidad | Casos normales/límite/inválido que afecten el contrato; consumidores modificados y tipos/build pertinentes |
| Módulo o funcionalidad | Responsabilidad, interfaz pública, reglas, datos propios, permisos y dependencias | Prueba pública del módulo; persistencia real si escribe; contratos con módulos vecinos; flujo visible si modifica UI |
| Integración interna | Productor y consumidor reales, mapeo de campos, autorización y consistencia entre módulos | Contrato de ambos extremos y recorrido real; comprobar efectos y ausencia de escrituras parciales |
| Integración externa | Adaptador, protocolo, autenticación, configuración, límites y efectos remotos | Contratos con errores/timeout; prueba local controlada y sandbox real cuando la aceptación lo exija; evidencia diferenciada |
| Flujo transversal | Secuencia y propiedad de cada paso entre UI, API, dominio, DB y proveedor | Recorrido crítico y fallos parciales en sus límites; regresión de consumidores existentes |
| Aplicación nueva | Arquitectura y primer flujo completo, infraestructura y operación | Contrato de entrega Docker y escalera de pruebas definidos en SKILL.md |

Usar la unidad mínima que satisfaga el requerimiento, ampliando el radio de revisión si aparecen consumidores compartidos, cambios de esquema o contratos públicos. No confundir pocos archivos con poco riesgo. Reutilizar organización, convenciones y herramientas del repositorio; no imponer carpetas, framework, microservicio o formato de documentación nuevos para un módulo.

Antes de elegir nombres, carpetas o interfaces, aplicar [project-conventions.md](project-conventions.md): reconstruir los patrones reales del módulo, sus consumidores y persistencia. Basar el diseño en esas evidencias, preservando los contratos públicos.

## 1. Inspeccionar, descubrir y definir el contrato del cambio

1. Leer instrucciones aplicables del repositorio, estado Git, estructura, manifiestos, lockfiles, scripts, tests, CI, migraciones y configuración sin exponer secretos. Reconstruir las convenciones del área afectada según [project-conventions.md](project-conventions.md) y localizar implementaciones comparables antes de proponer nombres o estructura. Preservar cambios ajenos y no hacer reset destructivo.
2. Localizar implementación actual, llamadas/imports, rutas, esquema, tests y configuración pertinentes. Seguir consumidores reales además de coincidencias de texto; revisar usos indirectos si hay contratos/eventos compartidos. Identificar el camino completo afectado: interfaz → contrato HTTP → servicio de dominio → persistencia → integración externa → resultado visible.
3. Describir comportamiento actual y esperado con ejemplos observables. Traducir el prompt en criterios observables, incluidos casos negativos e invariantes. Para bug, reproducir antes de corregir cuando sea viable; para refactor, registrar qué comportamiento debe conservarse. Distinguir requisitos, supuestos y decisiones pendientes; no inventar requisitos de negocio para llenar huecos.
4. Fijar inclusiones y exclusiones. Separar requisitos explícitos, supuestos rutinarios y decisiones que sí cambian negocio/compatibilidad. Continuar lo independiente si falta una decisión indispensable, sin inventar su respuesta.
5. Definir contrato público: firma o payload, campos obligatorios/opcionales, errores, permisos, fuente de verdad y efectos. Agregar idempotencia, concurrencia o consistencia solo si la operación los necesita.
6. Mapear impacto: `entrada → unidad cambiada → dependencias → consumidores → resultado`. No añadir UI, API o DB a una función pura por completar este mapa.
7. Ejecutar una línea base proporcional al cambio. Registrar fallos preexistentes y ambiente; no adjudicarlos a la implementación nueva ni usarlos para esconder una regresión.
8. Si el usuario pide leer todas las fuentes, leerlas íntegras por bloques contiguos, recuperar cualquier salida truncada y registrar cobertura por archivo/rango. No sustituir lectura completa por búsqueda de palabras o muestreo ni afirmar cobertura que no se realizó.

Para tareas pequeñas, conservar esta ficha en el plan/respuesta. Para módulos, varias integraciones o trabajo de varias sesiones, adaptar [engineering-change.md](../assets/engineering-change.md) en la documentación existente del proyecto, con un identificador estable por cambio. No crear un expediente por archivo ni rellenar secciones irrelevantes.

## 2. Diseñar e implementar una entrega vertical

Derivar del contrato un plan corto y ejecutable. Cada paso debe producir un comportamiento o una comprobación; no dejarlo en una lista genérica de analizar/diseñar/programar. Definir contratos de entrada/salida, autorización del servidor, estados y transiciones válidas antes de conectar pantallas, siguiendo la estructura y convenciones observadas y manteniendo explícitos los mapeos de nombres entre capas. Elegir la fuente de verdad y la estrategia de consistencia.

Leer [resilience.md](resilience.md) cuando haya workflows, sincronización, colas o efectos externos. Aplicar [architecture.md](architecture.md) para datos, seguridad, UI y separación de responsabilidades. Leer [operations.md](operations.md) antes de cambiar contenedores, migraciones o despliegues. Leer [real-time.md](real-time.md) al implementar WebSocket, SSE o comunicación en vivo. Leer [integrations.md](integrations.md) al conectar con APIs externas, proveedores, correo o servicios entre sistemas.

- **Función:** acordar ejemplos y compatibilidad; implementar la función y adaptar llamadas necesarias; comprobar límites y los consumidores afectados. No crear capa HTTP ni rediseñar arquitectura para envolverla.
- **Módulo:** definir interfaz pública e invariantes; implementar dominio/persistencia y adaptadores necesarios; conectar al módulo consumidor o UI; comprobar funcionamiento y regresión del entorno que lo usa. Un módulo sin consumidor conectado no completa una funcionalidad solicitada.
- **Integración interna:** acordar el contrato entre extremos y una fuente de verdad; mapear errores y transformación de datos; conectar productor/consumidor; comprobar éxito, rechazo y consistencia sin efectos parciales.
- **Integración externa:** revisar documentación oficial del protocolo/versionado aplicable; aislar SDK/HTTP en un adaptador; validar configuración y credenciales sin exponerlas; acotar timeout/reintentos y definir reconciliación para efectos inciertos. Si hay webhook, validar autenticidad y deduplicación según proveedor. No enviar mensajes/cobros reales sin autorización de ese efecto.
- **Cambio de esquema o contrato:** planificar compatibilidad con consumidores actuales y secuencia de actualización. Ensayar migración con datos previos y recuperación. Si basta una ampliación compatible, evitar romper consumidores por conveniencia.

Cuando varios módulos cambien, registrar por cada uno responsabilidad y criterio de terminado, además de un criterio para la integración conjunta. No declarar el conjunto verificado porque sus partes aisladas pasan.

## 3. Implementar y verificar proporcionalmente

Implementar persistencia/migración, dominio, API y UI de forma coherente. Validar configuración al arranque con fail-fast si faltan variables requeridas o los valores son inseguros en producción; entregar `.env.example` con valores ficticios y sin secretos. Para un bug, reproducirlo y agregar una prueba que falle por el comportamiento defectuoso. Para funcionalidad nueva, derivar pruebas de los criterios y límites, no copiando la implementación como oráculo. Completar estados de carga, vacío, error, éxito, acceso denegado y recuperación. No dejar botones ficticios, respuestas simuladas, TODO funcionales ni rutas principales desconectadas. Usar parches acotados; no alterar pruebas, interfaces ni configuración ajenas solo para obtener verde.

Ejecutar línea base relevante, implementar y comprobar la unidad antes de ampliar a sus consumidores. Reutilizar tests existentes cuando ya cubren el criterio; agregar pruebas cuando verifiquen comportamiento relevante o una regresión. No escribir tests que repitan el código o creen burocracia para un ajuste trivial.

Elegir capas según los límites cruzados:

- Una función pura no exige DB, navegador ni Docker. Ejecutar pruebas útiles de lógica y consumidores, y checks de tipos/build aplicables.
- Si cambia SQL/esquema/repositorio, probar contra el motor real del proyecto; un mock no acredita persistencia, constraints o transacciones.
- Si cambia contrato HTTP, probar solicitudes reales, errores y el consumidor afectado. Si cambia UI interactiva, verificar estados y recorrido visible pertinentes.
- Si conecta módulos, probar ambos extremos reales; si sustituye un proveedor por un servidor local controlado, declarar explícitamente qué está simulado.
- Si modifica contenedores, dependencias runtime o inicialización, probar la imagen final y los gates Docker afectados. Para cambio acotado sin infraestructura, no exigir recrear una aplicación ni ejecutar el verificador fullstack.

Registrar por criterio: prueba/comando, resultado, entorno y evidencia vigente. `N/A` significa que el cambio no cruza esa capa; `BLOCKED` significa que una capa necesaria no pudo ejecutarse. Una credencial ausente solo bloquea las comprobaciones que la requieren: continuar implementación y verificaciones independientes.

## 4. Iterar y autorrevisar

Repetir este ciclo por cada defecto hasta satisfacer aceptación:

1. Capturar comando, resultado esperado/observado, código de salida, versión y logs relevantes saneados.
2. Clasificar el fallo: producto, prueba, datos, configuración o infraestructura. Reducirlo a un caso reproducible y proponer una hipótesis comprobable.
3. Corregir la causa mínima. Confirmar que la regresión falla antes de la corrección cuando sea posible y pasa después.
4. Ejecutar prueba enfocada y suites afectadas. Si cambia código tras una ejecución, renovar las evidencias invalidadas por ese cambio.
5. Revisar el diff como revisor: ramas sin probar, contratos rotos, autorización, fugas, carreras, idempotencia, migraciones, accesibilidad y fallos parciales. Contrastar con criterios originales.
6. Realizar una pasada adversarial con entradas/casos independientes de los usados para construir el código. Verificar consecuencias persistidas, no solo mensajes de éxito.

No desactivar asserts, saltar suites, inflar timeouts, aceptar snapshots a ciegas ni añadir reintentos para ocultar defectos. Si dos intentos no aportan evidencia nueva, cambiar el método de diagnóstico. Ante bloqueo externo o límite de recursos real, guardar un checkpoint reproducible y continuar lo independiente; informar lo pendiente sin declarar finalización.

## 5. Cerrar con evidencia

Revisar que el cambio cumpla su contrato, preserve lo existente y esté conectado a quien lo utiliza. Comprobar errores, permisos, datos y operación afectados; no ampliar automáticamente a una auditoría de todo el sistema.

Cerrar como **VERIFICADO** solo cuando los criterios se cumplen, los gates aplicables pasan sobre la revisión final y no hay fallos críticos abiertos. Usar **PARCIAL** o **BLOQUEADO** si queda una validación obligatoria pendiente. Registrar:

- Unidad, naturaleza y comportamiento entregado.
- Contratos/dependencias modificados y compatibilidad mantenida o migrada.
- Qué se ejecutó realmente: comando, entorno, revisión/hash, resultado y ubicación de evidencias.
- Pruebas FAIL/BLOCKED/INCONCLUSIVE/SKIP/N/A por separado y su impacto. Un skip no es un pase.
- Estado separado de implementación, verificación local, sandbox externo, despliegue y activación. Un feature flag apagado no es una funcionalidad activa.
- Estado actual canónico y evidencia vigente: marcar historia supersedida; retirar afirmaciones invalidadas por cambios posteriores.
- Riesgos residuales, bloqueo exacto y siguiente acción mínima, si existen.

Distinguir implementación, integración real, despliegue y activación. Si queda un consumidor esencial desconectado o un test obligatorio bloqueado, reportar entrega parcial. No fabricar PASS ni esconder un pendiente bajo «listo para producción». No declarar producción validada por un build, un HTTP 200 o un contenedor healthy.

## Ejemplos de activación

- «Implementa esta función y verifica sus consumidores sin cambiar el resto del módulo».
- «Agrega un módulo de etiquetas y conéctalo al listado existente; conserva los registros actuales».
- «Integra este módulo con el de notificaciones y prueba el contrato entre ambos».
- «Agrega este proveedor mediante un adaptador; prueba con servidor QA y registra qué requiere sandbox real».

No hace falta que el usuario elija una categoría exacta: inferirla del requerimiento y del código, declarar el alcance adoptado y ejecutar el proceso correspondiente.
