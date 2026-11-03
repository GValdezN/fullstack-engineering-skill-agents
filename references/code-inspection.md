# Inspección de código con AST

Leer cuando se necesite localizar símbolos, entender estructura o navegar una base de código grande. El inspector AST (`tools/code-indexer`) es una herramienta opcional que extrae estructura sintáctica sin ejecutar el código.

## Cuándo usar inspección AST

| Escenario | Usar AST | Motivo |
|---|---|---|
| Área amplia o desconocida | Sí | Localizar funciones, clases y exports sin leer archivos completos |
| Muchas funciones con nombres similares | Sí | Disambiguar por firma, ubicación y exportación |
| Cambio en un archivo pequeño y conocido | No | Lectura directa es más rápida y precisa |
| Tarea trivial (fix typo, renombrar) | No | Búsqueda de texto basta |
| Proyecto con menos de ~20 archivos | No | El overhead no compensa |

## Cuándo no confiar en el AST

- **Imports dinámicos, reflection, dispatch por string:** el análisis estático no los resuelve. Verificar manualmente.
- **Routing declarativo** (archivos como rutas en Next.js, convenciones de framework): no se infiere del AST. Leer la estructura de carpetas.
- **Alias de imports** (paths en tsconfig, webpack resolve): el índice muestra el alias literal, no la ruta final.
- **Archivos generados o compilados:** pueden no reflejar el código fuente real.

Toda relación reportada por el inspector se clasifica como observada, inferida o desconocida. No tratar inferencias como hechos.

## Flujo recomendado

1. `scan` — obtener resumen del proyecto (funciones, clases, exports por archivo).
2. `find` — localizar un símbolo específico por nombre.
3. `symbol` — leer un símbolo con contexto configurable.
4. Leer consumidores reales del símbolo con herramientas de búsqueda.
5. Editar y probar.

Preferir un resumen corto a múltiples volcados del mismo índice; solicitar fragmentos individuales después. El inspector no sustituye las instrucciones de inspección completa cuando el usuario la exija.

## Fallback sin inspector

Si Tree-sitter no está instalado, un archivo no es compatible o falla el análisis, el agente sigue con búsqueda de texto (`Grep`, `Glob`) y lectura directa (`Read`). La skill no queda inutilizada. Registrar la degradación cuando el inspector habría aportado valor.
