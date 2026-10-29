# Integraciones, estados y recuperación verificables

Leer cuando haya workflows, colas, sincronización, formularios de varios pasos o efectos externos. Seleccionar patrones según el riesgo real; no añadir orquestadores ni reglas de negocio que el proyecto no necesita.

## Estado observable antes de actuar

Separar recepción, validación, confirmación, commit local, sincronización externa y entrega de notificación. Un estado del proveedor, un HTTP 200 o una ejecución del workflow exitosa no demuestran el efecto de negocio completo. Definir transiciones y evidencias de cada etapa, incluida su salida de error.

Antes de mutar, resolver identidad canónica, propietario/tenant, entorno, recurso destino y versión de la entidad. Correlacionar solicitud → operación → pasos → efectos → respuesta mediante IDs durables. No inferir identidad por número de fila, nombre visible, texto de una alerta o identificador parcial.

## Escrituras externas no atómicas

1. Validar todo lo necesario y guardar un snapshot durable de decisión: IDs reservados, configuración, referencias, versión y payload confirmado antes del primer efecto. Reutilizarlo en retries; no recalcular asignaciones/precios/identificadores con una referencia que cambió después.
2. Mantener un journal por paso con idempotency key, recurso/identidad, intención, intento, resultado y marca temporal. Diferenciar no iniciado, aplicado, fallido e incierto (`UNKNOWN`). Un timeout puede ocurrir después de que el destino aplique el cambio.
3. No reintentar a ciegas efectos no idempotentes. Consultar el destino por identidad estable; clasificar coincidencia completa, ausencia completa, coincidencia parcial o conflicto. Reponer solo lo faltante cuando sea seguro; conflicto o resultado incierto requiere reconciliación.
4. Hacer readback tras escribir y comparar identidad, cardinalidad y campos contractuales; cuando importe durabilidad, usar otra sesión/lector fuera de la caché que produjo la respuesta. No considerar una lectura de la misma sesión como prueba suficiente de persistencia independiente.
5. Liberar reservas/leases o marcar una incidencia recuperable en todos los caminos. No borrar automáticamente un efecto parcial como compensación si puede eliminar trabajo manual o de terceros. Registrar compensaciones como operaciones verificables.
6. Emitir éxito al usuario solo cuando se verifique la etapa prometida. Si el proveedor queda pendiente, devolver estado honesto y mecanismo de seguimiento; garantizar una respuesta terminal o alerta operable, no dejar el proceso indefinidamente en “procesando”. Deduplicar notificaciones por operación/etapa.

Paralelizar solo efectos independientes; ordenar escrituras sobre el mismo agregado, archivo o rango solapado y probar inversiones del orden. Mantener cortas las transacciones SQL y no esperar red externa dentro de ellas. Un lease durable renovable sí puede proteger una secuencia externa no atómica: usar expiración, heartbeat, fencing/generación y deadline. Probar pérdida del lease, worker viejo, crash a mitad, retry y cambios manuales concurrentes. Un lock solo en memoria no protege múltiples procesos.

## Integraciones tabulares y contratos del destino

Mapear columnas por esquema/encabezado y filas por identidad, no por posición mutable. Clasificar campos propios, manuales, protegidos y calculados; distinguir ausente, null y borrado. Preservar fórmulas, formatos, totales y contenido editorial ajeno. No aplicar dos veces una transformación que calcula el destino. Probar columnas/filas reordenadas, resultados parciales, celdas vacías, cambios manuales antes/durante la operación y claves reutilizadas.

Restringir reconciliación y limpieza por entorno, recurso y operación, no solo por un prefijo que puede repetirse. Una migración con defaults no debe convertir datos históricos en trabajos nuevos: decidir y probar backfill, punto de corte, flags y elegibilidad explícitamente.

## Snapshots de referencia

Validar descarga, MIME/contenido, esquema, conteos, unicidad y consistencia antes de publicar una referencia. Un 200 con HTML de login no es un archivo válido. Escribir temporal, validar y reemplazar atómicamente; lectores ven el snapshot anterior completo o el nuevo completo. Conservar último válido, fecha de origen/obtención, checksum y error saneado. Definir TTL y qué operaciones deben bloquearse si los datos están viejos; no usar stale silenciosamente para decisiones críticas.

Probar fuente caída, redirección/cookies, contenido parcial, esquema incompatible, datos contradictorios, escritor concurrente y lector durante reemplazo. No registrar credenciales ni descargar datos personales como fixtures de regresión.

## Workflows y artefactos generados

Probar el runtime real del orquestador en sandbox, además de funciones aisladas. Verificar ramas vacías, IF/Switch, salidas error/success, contrato de subprocesos, cardinalidad de ítems, índices de salida y nodos de liberación/finalización. Toda ruta terminal debe liberar el recurso o dejar una recuperación durable. Verificar ausencia de trabajos atascados después de éxito, error y salida temprana.

Regenerar determinísticamente y comparar semánticamente ignorando solo campos volátiles documentados. Conservar IDs y cambios ajenos. Publicar componentes afectados y comprobar generado → publicado → versión realmente ejecutada → activo → flujo real. Un import puede no activar un workflow; no inferir activación por presencia.

## Contexto, confirmación y control humano

En formularios o flujos conversacionales, conservar datos aportados previamente, preguntar solo lo faltante y desambiguar antes de asignar entidades. Aceptar números/alias según el estado esperado; no interpretar una referencia libre como confirmación o comando administrativo. Centralizar comandos, alias, permisos, ayuda y ejemplos en un registro coherente; no fuzzy-match de secretos ni códigos de autorización.

Vincular confirmaciones a la versión y al resumen exactos; cualquier edición relevante las invalida. Si hay transferencia a humano/pausa/cancelación, incrementar generación o invalidar trabajos pendientes para que un worker viejo no envíe una respuesta tras el cambio de control. Revalidar autorización y generación inmediatamente antes del efecto externo. Identificar CAS/ETag, idempotency key y fencing que ofrece el proveedor y propagarlos cuando existan. El control local no cancela solicitudes ya en vuelo ni impide por sí solo una aplicación remota tardía. Sin control condicional remoto, serializar por recurso, registrar/bloquear nuevas intenciones mientras el efecto previo sea UNKNOWN y reconciliar antes de aplicar otra. Si las ediciones remotas ajenas no pueden bloquearse, declarar la carrera residual y preparar compensación o roll-forward verificados. Estas reglas se implementan solo si ese control existe en el dominio.

Medir latencia extremo a extremo: colas, batching, polling, retries y pausas se suman. Definir presupuesto y alertas sobre ese total; no alterar retardos acordados sin verificar su finalidad ni atribuir una demora a código sin evidencia.

## Pruebas de aceptación de recuperación

- Caída antes y después del commit; resultado externo aplicado con respuesta perdida.
- Dos workers y expiración del lease; un worker obsoleto intenta finalizar/enviar.
- Todos/ninguno/algunos elementos presentes; conflicto de identidad o modificación manual.
- Referencia cambia entre intento y retry; se conserva el snapshot original.
- Handoff/cancelación entre claim y envío; bloquear nuevos envíos obsoletos y observar/reconciliar efectos de solicitudes ya en vuelo según las garantías reales del proveedor.
- Workflow con cero ítems y salida temprana; no queda trabajo `processing` abandonado.
- Tras error, el usuario y el operador tienen estado y siguiente paso verificables.
