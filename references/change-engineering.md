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

## 1. Descubrir y definir el contrato del cambio

1. Localizar implementación actual, llamadas/imports, rutas, esquema, tests y configuración pertinentes. Seguir consumidores reales además de coincidencias de texto; revisar usos indirectos si hay contratos/eventos compartidos.
2. Describir comportamiento actual y esperado con ejemplos observables. Para bug, reproducir antes de corregir cuando sea viable; para refactor, registrar qué comportamiento debe conservarse.
3. Fijar inclusiones y exclusiones. Separar requisitos explícitos, supuestos rutinarios y decisiones que sí cambian negocio/compatibilidad. Continuar lo independiente si falta una decisión indispensable, sin inventar su respuesta.
4. Definir contrato público: firma o payload, campos obligatorios/opcionales, errores, permisos, fuente de verdad y efectos. Agregar idempotencia, concurrencia o consistencia solo si la operación los necesita.
5. Mapear impacto: `entrada → unidad cambiada → dependencias → consumidores → resultado`. No añadir UI, API o DB a una función pura por completar este mapa.

Para tareas pequeñas, conservar esta ficha en el plan/respuesta. Para módulos, varias integraciones o trabajo de varias sesiones, adaptar [engineering-change.md](../assets/engineering-change.md) en la documentación existente del proyecto, con un identificador estable por cambio. No crear un expediente por archivo ni rellenar secciones irrelevantes.

## 2. Diseñar el proceso específico

Derivar del contrato un plan corto y ejecutable. Cada paso debe producir un comportamiento o una comprobación; no dejarlo en una lista genérica de analizar/diseñar/programar.

- **Función:** acordar ejemplos y compatibilidad; implementar la función y adaptar llamadas necesarias; comprobar límites y los consumidores afectados. No crear capa HTTP ni rediseñar arquitectura para envolverla.
- **Módulo:** definir interfaz pública e invariantes; implementar dominio/persistencia y adaptadores necesarios; conectar al módulo consumidor o UI; comprobar funcionamiento y regresión del entorno que lo usa. Un módulo sin consumidor conectado no completa una funcionalidad solicitada.
- **Integración interna:** acordar el contrato entre extremos y una fuente de verdad; mapear errores y transformación de datos; conectar productor/consumidor; comprobar éxito, rechazo y consistencia sin efectos parciales.
- **Integración externa:** revisar documentación oficial del protocolo/versionado aplicable; aislar SDK/HTTP en un adaptador; validar configuración y credenciales sin exponerlas; acotar timeout/reintentos y definir reconciliación para efectos inciertos. Si hay webhook, validar autenticidad y deduplicación según proveedor. No enviar mensajes/cobros reales sin autorización de ese efecto.
- **Cambio de esquema o contrato:** planificar compatibilidad con consumidores actuales y secuencia de actualización. Ensayar migración con datos previos y recuperación. Si basta una ampliación compatible, evitar romper consumidores por conveniencia.

Cuando varios módulos cambien, registrar por cada uno responsabilidad y criterio de terminado, además de un criterio para la integración conjunta. No declarar el conjunto verificado porque sus partes aisladas pasan.

## 3. Implementar y verificar proporcionalmente

Ejecutar línea base relevante, implementar y comprobar la unidad antes de ampliar a sus consumidores. Reutilizar tests existentes cuando ya cubren el criterio; agregar pruebas cuando verifiquen comportamiento relevante o una regresión. No escribir tests que repitan el código o creen burocracia para un ajuste trivial.

Elegir capas según los límites cruzados:

- Una función pura no exige DB, navegador ni Docker. Ejecutar pruebas útiles de lógica y consumidores, y checks de tipos/build aplicables.
- Si cambia SQL/esquema/repositorio, probar contra el motor real del proyecto; un mock no acredita persistencia, constraints o transacciones.
- Si cambia contrato HTTP, probar solicitudes reales, errores y el consumidor afectado. Si cambia UI interactiva, verificar estados y recorrido visible pertinentes.
- Si conecta módulos, probar ambos extremos reales; si sustituye un proveedor por un servidor local controlado, declarar explícitamente qué está simulado.
- Si modifica contenedores, dependencias runtime o inicialización, probar la imagen final y los gates Docker afectados. Para cambio acotado sin infraestructura, no exigir recrear una aplicación ni ejecutar el verificador fullstack.

Registrar por criterio: prueba/comando, resultado, entorno y evidencia vigente. `N/A` significa que el cambio no cruza esa capa; `BLOCKED` significa que una capa necesaria no pudo ejecutarse. Una credencial ausente solo bloquea las comprobaciones que la requieren: continuar implementación y verificaciones independientes.

## 4. Revisar y cerrar la unidad

Revisar que el cambio cumpla su contrato, preserve lo existente y esté conectado a quien lo utiliza. Comprobar errores, permisos, datos y operación afectados; no ampliar automáticamente a una auditoría de todo el sistema.

Cerrar con:

- Unidad, naturaleza y comportamiento entregado.
- Contratos/dependencias modificados y compatibilidad mantenida o migrada.
- Criterios satisfechos con evidencia, pruebas no aplicables y bloqueos pendientes.
- Comando o recorrido para usar la función/módulo/integración; configuración o migración necesaria si existe.

Distinguir implementación, integración real, despliegue y activación. Si queda un consumidor esencial desconectado o un test obligatorio bloqueado, reportar entrega parcial. No fabricar PASS ni esconder un pendiente bajo «listo para producción».

## Ejemplos de activación

- «Implementa esta función y verifica sus consumidores sin cambiar el resto del módulo».
- «Agrega un módulo de etiquetas y conéctalo al listado existente; conserva los registros actuales».
- «Integra este módulo con el de notificaciones y prueba el contrato entre ambos».
- «Agrega este proveedor mediante un adaptador; prueba con servidor QA y registra qué requiere sandbox real».

No hace falta que el usuario elija una categoría exacta: inferirla del requerimiento y del código, declarar el alcance adoptado y ejecutar el proceso correspondiente.
