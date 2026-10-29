# Cambio: <identificador y nombre>

Usar para módulos o cambios con varios límites; adaptar a la documentación del proyecto y retirar apartados no aplicables. Para una función pequeña, una ficha breve en el plan puede bastar. No escribir PASS antes de ejecutar.

## Alcance y aceptación

- Unidad: función / módulo / integración interna / integración externa / flujo.
- Naturaleza: alta / corrección / ampliación / refactor / migración.
- Comportamiento actual → esperado:
- Incluye / excluye:
- Supuestos y decisiones pendientes:

| ID | Entrada o condición | Resultado observable | Efecto permitido / prohibido |
| --- | --- | --- | --- |

## Convenciones del área afectada

| Convención / decisión | Archivo o símbolo de evidencia | Declarada / observada / propuesta | Aplicación al cambio |
| --- | --- | --- | --- |

- Estructura y recorrido de implementación comparable:
- Nombres, tipos y mapeos UI/API/dominio/persistencia pertinentes:
- Discrepancias relevantes y decisión adoptada:

## Contrato e impacto

- Interfaz pública: firma, payload, errores y compatibilidad.
- Productor/consumidor y puntos reales de conexión:
- Reglas, permisos y fuente de verdad:
- Datos/configuración afectados; migración o recuperación si aplica:
- Dependencias compartidas y regresiones que deben comprobarse:

## Implementación y verificación

| Criterio | Cambio concreto | Prueba o comprobación | Entorno | Resultado / evidencia |
| --- | --- | --- | --- | --- |

- Capas aplicables y motivo de exclusión de otras:
- Orden de implementación y conexión de la unidad:
- Fallos observados y correcciones:

Resultados: PASS / FAIL / BLOCKED / INCONCLUSIVE / SKIP / N/A, con motivo cuando corresponda. Para más detalle reutilizar verification-record.md; no mantener dos registros contradictorios.

## Entrega

- Uso: comando o recorrido real para consumir el cambio.
- Estado: VERIFICADO / PARCIAL / BLOQUEADO.
- Implementado y conectado:
- Integraciones simuladas / reales comprobadas:
- No comprobado, impacto y siguiente acción:
- Despliegue/activación si fueron solicitados y ejecutados:
