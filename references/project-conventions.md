# Reconocer y extender las convenciones del proyecto

Leer antes de modificar un repositorio existente. Reconstruir cómo se implementó la zona afectada y continuar sus convenciones con evidencia. No imponer nombres preferidos por el agente, ni deducir reglas globales a partir de un archivo aislado.

## 1. Inspección dirigida

Partir del módulo solicitado y seguir sus consumidores/dependencias. Usar búsquedas por archivos, símbolos y referencias; leer implementaciones completas cuando sean necesarias para entender el contrato. Revisar instrucciones del repositorio y después las fuentes pertinentes:

| Área | Qué identificar | Fuentes que contrastar |
| --- | --- | --- |
| Organización | Carpetas por dominio/capa/feature, puntos de entrada, dependencias permitidas, módulos compartidos | Árbol, imports, exports, composición de servicios y módulos vecinos comparables |
| Código | Idioma de identificadores, camelCase/snake_case/PascalCase, prefijos/sufijos, singular/plural, abreviaturas, sync/async | Funciones/clases/componentes del área, tipos, tests y llamadas reales |
| Archivos y tooling | Extensiones, casing de rutas, aliases, barrel exports, módulos ESM/CJS, gestor de paquetes, formato/lint | Manifiestos, lockfile, tsconfig/jsconfig, reglas de lint/format y archivos reales |
| Método de implementación | Manejo de errores, validación, inyección/composición, acceso a datos, autorización, logging y transacciones | Un recorrido funcional comparable desde su entrada hasta sus efectos y su prueba |
| API y eventos | Rutas, versión, verbos, payloads, DTOs, códigos de error, paginación y nombres de eventos | Productores, validadores, consumidores, contratos publicados y tests |
| Persistencia | Motor/ORM/driver, base y esquema lógico, tablas/colecciones, campos, claves, relaciones, índices, constraints y migraciones | Esquema ORM, migraciones, SQL/repositorios y metadatos de QA accesibles |
| Pruebas y operación | Ubicación/sufijos de tests, fixtures, runners, variables de entorno, servicios Compose y readiness | Scripts existentes, CI, configuración efectiva saneada y pruebas cercanas |

No inferir nombres de base, usuarios, tablas o variables desde ejemplos de documentación si el código usa otros. No imprimir secretos para identificar motor o configuración. Inspeccionar metadatos de una base solo con acceso autorizado y operaciones de lectura; no consultar filas privadas para descubrir convenciones. La falta de acceso a DB no impide reconocer lo que sí consta en migraciones/código: marcar el esquema runtime como no contrastado.

## 2. Resolver la convención aplicable

- Respetar primero decisiones explícitas del usuario e instrucciones aplicables. Para detalles de implementación, contrastar configuración activa, contratos públicos y código mantenido del módulo; la documentación histórica puede estar desactualizada.
- Usar implementaciones cercanas y comparables para inferir patrones locales. Distinguir código propio, generado, legado y dependencias de terceros; no copiar estos últimos como norma del proyecto.
- Registrar cada conclusión como **declarada**, **observada** o **propuesta**. Adjuntar archivos/símbolos concretos cuando sea relevante. Un patrón contradictorio o sin evidencia suficiente queda pendiente, no se presenta como regla confirmada.
- Si hay estilos mezclados, seguir el contrato y patrón vigente en la zona afectada. Explicar discrepancias que cambian la decisión; no normalizar todo el repositorio ni bloquear una corrección rutinaria por variaciones cosméticas.
- Si falta una convención, elegir una coherente con el entorno y explicar la propuesta brevemente. Preguntar solo si la decisión altera negocio, compatibilidad o arquitectura de forma material.
- Preservar invariantes y seguridad aunque el código vecino tenga un defecto. No copiar validaciones insuficientes, filtraciones o autorización ausente por «consistencia». Corregir lo necesario dentro del alcance y señalar lo externo pendiente.

La metodología observada debe describir hechos: por ejemplo, controladores delegan a servicios que llaman repositorios, o módulos por funcionalidad con SQL encapsulado. No etiquetar un proyecto como DDD, Clean Architecture o microservicios sin evidencia ni añadir esas capas para justificar la etiqueta.

## 3. Perfil breve y trazabilidad de nombres

Para cambios acotados, mantener el perfil en el plan/resumen; para módulos o varias sesiones, usar el apartado de convenciones de [engineering-change.md](../assets/engineering-change.md) o la documentación existente del proyecto. No crear otro manual si ya existe uno vigente. Leer solo las áreas afectadas; ampliar el muestreo ante contradicciones relevantes.

Registrar las decisiones que guían el cambio:

| Convención / decisión | Evidencia del proyecto | Estado | Cómo se aplica al cambio |
| --- | --- | --- | --- |

Si un dato cambia de nombre o representación entre capas, registrar explícitamente su recorrido:

```text
entrada de UI → campo del contrato → propiedad de dominio → columna/colección → respuesta
```

Los nombres pueden ser diferentes si existe mapeo intencional y comprobado; no exigir el mismo casing en SQL, JavaScript y JSON. Verificar tipos, nulabilidad, valores por defecto, unidades, identificadores y significado en cada paso. No crear dos conceptos distintos por interpretar como equivalentes campos de nombres parecidos.

## 4. Implementar como extensión del sistema

- Reutilizar validadores, servicios, repositorios, componentes, tipos y utilidades existentes cuando representen el mismo contrato. Comprobar sus efectos y permisos antes de usarlos; no duplicar lógica porque el nombre no coincide con el que se esperaba encontrar.
- Colocar el código y los tests en las ubicaciones del módulo; mantener casing de imports compatible con Linux además de Windows. Conservar gestor, extensiones y sistema de módulos. No introducir TypeScript o un framework distinto en un módulo JavaScript sin necesidad y autorización para ese alcance.
- Mantener nombres públicos, columnas/tablas/colecciones y claves existentes. Agregar datos siguiendo la convención local y con migración cuando corresponda. No renombrar una base, tabla o columna solo por estética ni editar una migración aplicada.
- Si el requerimiento necesita un cambio incompatible, planificar consumidores, mapeos y migración de datos antes de aplicarlo. Diferenciar rename, copia y transformación; comprobar los datos preservados y la estrategia de recuperación.
- Revisar diferencias entre esquema ORM, histórico de migraciones y DB runtime. No ejecutar sincronización destructiva o regenerar esquema automáticamente para silenciar drift; documentar la diferencia y resolver únicamente lo autorizado.
- En un proyecto nuevo, proponer una convención compacta y aplicarla en su primer flujo completo. Las preferencias de stack para proyectos nuevos no justifican migrar un repositorio existente.

## 5. Verificar coherencia del cambio

Revisar que ubicación/nombres/imports, contratos, mapeos y persistencia respeten el perfil observado. Ejecutar checks existentes de formato/tipos/lint aplicables. Cuando cambien mapeos o datos, probar escritura y lectura completas, incluyendo ausente/null y compatibilidad de consumidores relevantes.

Si cambia una firma/export, comprobar llamadas/imports afectados; si cambia un nombre público, buscar usos en contratos, UI, SQL, tests, fixtures y configuración pertinentes. Distinguir nombres históricos legítimos en migraciones de referencias rotas: una búsqueda de texto no sustituye las pruebas de comportamiento.

Al cerrar, mencionar las convenciones reutilizadas y cualquier desviación necesaria. No declarar que se auditó toda la arquitectura o toda la base si solo se inspeccionó el módulo. Mantener nombres y reglas específicas dentro del proyecto; la skill conserva este procedimiento general.
