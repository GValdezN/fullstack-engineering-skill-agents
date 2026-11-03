# Inspección de código con AST

Leer cuando se necesite localizar símbolos, entender estructura o navegar una base de código grande antes de implementar. El inspector AST (`tools/code-indexer`) es una herramienta opcional que extrae estructura sintáctica sin ejecutar el código del proyecto inspeccionado.

## Cuándo usar inspección AST

| Escenario | Usar AST | Motivo |
|---|---|---|
| Codebase desconocido o amplio (>50 archivos) | Sí | Localizar funciones, clases y exports sin leer archivos completos |
| Muchas funciones con nombres similares | Sí | Disambiguar por firma, ubicación y estado de exportación |
| Entender límites de módulo | Sí | Ver qué exporta cada módulo y sus dependencias de imports |
| Encontrar todos los consumidores de una función | Sí+Grep | El índice localiza la definición; Grep localiza los usos |
| Cambio en un archivo pequeño y conocido (<200 líneas) | No | Lectura directa es más rápida y precisa |
| Tarea trivial (fix typo, renombrar variable) | No | Búsqueda de texto basta |
| Proyecto con menos de ~20 archivos fuente | No | El overhead del escaneo no compensa |
| Cambios solo de configuración (env, Docker, CI) | No | El inspector analiza código, no configuración |

La decisión de usar el inspector depende del tamaño del proyecto y la ambigüedad de la tarea. No ejecutarlo por defecto; evaluar primero si aporta valor.

## Cuándo no confiar en el AST

- **Imports dinámicos, reflection, dispatch por string:** el análisis estático no los resuelve. Verificar manualmente.
- **Routing declarativo** (archivos como rutas en Next.js, convenciones de framework): no se infiere del AST. Leer la estructura de carpetas.
- **Alias de imports** (paths en tsconfig, webpack resolve): el índice muestra el alias literal, no la ruta final.
- **Archivos generados o compilados:** pueden no reflejar el código fuente real.
- **Tipos TypeScript semánticos:** el parser extrae estructura sintáctica (nombres, firmas, rangos), no tipos resueltos ni inferidos.

Toda relación reportada por el inspector se clasifica como observada, inferida o desconocida. No tratar inferencias como hechos.

## Flujo recomendado

```text
scan → find → symbol → leer consumidores → editar → probar
```

1. **`scan`** — obtener resumen del proyecto (funciones, clases, exports por archivo). Usar una vez al inicio de la tarea.
2. **`find`** — localizar un símbolo específico por nombre cuando se sabe qué buscar.
3. **`symbol`** — leer el código fuente de un símbolo con contexto configurable.
4. **Leer consumidores** — usar `Grep` para encontrar usos reales del símbolo en el proyecto.
5. **Editar y probar** — con el contexto completo, implementar el cambio y verificar.

## Presupuesto de contexto

- Preferir **1 resumen corto** a múltiples volcados del mismo índice.
- Solicitar fragmentos individuales con `symbol` después de localizar con `find`.
- No re-escanear si el índice es reciente y no ha cambiado la estructura del proyecto.
- No volcar un JSON completo al contexto del agente: usar `--format summary` y `--max-symbols` para limitar.
- El inspector es un complemento de las herramientas habituales, no un reemplazo. Si un `Read` directo resuelve la duda, preferirlo.

## Referencia del CLI

Requiere instalación previa: `npm ci --prefix tools/code-indexer`.

### scan — Escanear estructura del proyecto

```bash
node tools/code-indexer/cli.mjs scan --root /ruta/al/proyecto --format summary
node tools/code-indexer/cli.mjs scan --root /ruta/al/proyecto --format json --output /tmp/index.json
node tools/code-indexer/cli.mjs scan --root /ruta/al/proyecto --format summary --max-symbols 30
```

Opciones:
- `--root <path>` — raíz del proyecto (requerido)
- `--format summary|json` — formato de salida (default: summary)
- `--max-symbols <n>` — limitar número de símbolos en summary
- `--max-chars <n>` — limitar caracteres totales de salida
- `--no-cache` — no usar caché
- `--output <file>` — escribir a archivo en vez de stdout

Ejemplo de salida summary:
```text
INDEX files=142 symbols=387 errors=0
src/services/pricing.ts
  calculatePrice(cost,margin)     L42–78  exported
  calculateTax(amount)            L80–92  local
src/components/ProductForm.tsx
  ProductForm({ onSubmit })       L12–104 exported  component
TRUNCATED=false SYMBOLS_SHOWN=387
```

### find — Buscar un símbolo por nombre

```bash
node tools/code-indexer/cli.mjs find --root /ruta/al/proyecto --name calculatePrice
```

Opciones:
- `--root <path>` — raíz del proyecto (requerido)
- `--name <symbol>` — nombre del símbolo a buscar (requerido)

Devuelve coincidencias exactas primero, luego parciales, con archivo, línea, tipo y estado de exportación.

### symbol — Leer código fuente de un símbolo

```bash
node tools/code-indexer/cli.mjs symbol --root /ruta/al/proyecto --file src/services/pricing.ts --name calculatePrice
node tools/code-indexer/cli.mjs symbol --root /ruta/al/proyecto --file src/services/pricing.ts --name calculatePrice --context 10
```

Opciones:
- `--root <path>` — raíz del proyecto (requerido)
- `--file <ruta-relativa>` — archivo que contiene el símbolo (requerido)
- `--name <symbol>` — nombre del símbolo (requerido)
- `--context <n>` — líneas de contexto alrededor del símbolo (default: 3)

### cache-clear — Limpiar caché

```bash
node tools/code-indexer/cli.mjs cache-clear
```

## Lenguajes soportados

| Extensión | Lenguaje | Gramática |
|---|---|---|
| `.js`, `.mjs`, `.cjs` | JavaScript | tree-sitter-javascript |
| `.jsx` | JavaScript JSX | tree-sitter-javascript |
| `.ts` | TypeScript | tree-sitter-typescript |
| `.tsx` | TypeScript JSX | tree-sitter-typescript (TSX) |

Archivos con otras extensiones se ignoran. La cobertura de Python, C y otros lenguajes es extensión futura.

## Seguridad

- El inspector **solo lee** archivos; nunca ejecuta código del proyecto inspeccionado.
- No sigue symlinks fuera de la raíz del proyecto.
- Excluye automáticamente: `.git`, `node_modules`, `.next`, `dist`, `build`, `coverage`, `.env*`, `*.key`, `*.pem`, archivos binarios.
- Limita el tamaño de archivos a parsear (>1 MB se ignoran).
- No almacena código fuente completo en caché, solo estructura y hashes.
- No envía datos al exterior.

## Fallback sin inspector

Si Tree-sitter no está instalado, un archivo no es compatible o falla el análisis, el agente sigue con búsqueda de texto (`Grep`, `Glob`) y lectura directa (`Read`). La skill no queda inutilizada. Registrar la degradación cuando el inspector habría aportado valor.

El fallback equivalente para cada comando:
- `scan` → `Glob` para listar archivos + `Grep` para buscar exports/funciones
- `find` → `Grep` con el nombre del símbolo
- `symbol` → `Read` del archivo con offset/limit en el rango relevante
