# Context Benchmark A/B/C

**Fecha:** 2026-11-03
**Plataforma:** linux x64, Node v22.17.0

## Variantes

| Variante | Descripción | Commit |
|----------|-------------|--------|
| A | Original skill | `1c73575` |
| B | Optimized SKILL.md (Phase 1) | `71e8367` |
| C | Optimized + AST indexer (current) | `4967e87` |

## Metodología

Esta medición usa un **proxy de tokens**: el tamaño en bytes del contexto que el agente cargaría en cada tipo de tarea. No es una medición real de tokens de API, sino una estimación del volumen de texto enviado al LLM.

- **SKILL.md** se carga siempre (contexto obligatorio).
- **Referencias** se cargan según la tabla de routing de cada variante.
- **Variante A** (monolítica): SKILL.md contiene la mayoría de las instrucciones inline y además referencia explícitamente las guías aplicables; el agente carga más referencias porque las instrucciones no discriminan por tipo de tarea.
- **Variantes B/C** (router): SKILL.md es compacto y solo carga las referencias pertinentes según la tabla de routing.
- **Variante C** añade una estimación del overhead del índice AST (~16.6 KB) para tareas donde el inspector aporta valor, asumiendo un proyecto de 100 archivos fuente a ~170 bytes/archivo de salida.

## Tamaño de SKILL.md

| Variante | Bytes | KB |
|----------|------:|---:|
| A | 15457 | 15.1 |
| B | 7208 | 7.0 |
| C | 7544 | 7.4 |

Reducción A→B: **-53%** (15.1 KB → 7.0 KB)
Reducción A→C: **-51%** (15.1 KB → 7.4 KB)

## Tabla principal de contexto por tipo de tarea

| Tipo de tarea | A (KB) | B (KB) | C (KB) | B vs A | C vs A |
|---------------|-------:|-------:|-------:|-------:|-------:|
| existing-bug | 75.5 | 28.4 | 45.3 | -62% | -40% |
| function-change | 51.1 | 28.4 | 45.3 | -44% | -11% |
| module-change | 67.7 | 43.7 | 60.6 | -35% | -10% |
| external-integration | 67.7 | 36.0 | 52.9 | -47% | -22% |
| new-app | 80.4 | 54.1 | 54.4 | -33% | -32% |
| project-conventions | 31.7 | 14.8 | 15.2 | -53% | -52% |
| frontend-change | 47.6 | 23.4 | 40.3 | -51% | -15% |
| database-change | 56.2 | 27.4 | 44.3 | -51% | -21% |
| infrastructure | 48.2 | 38.5 | 38.8 | -20% | -19% |
| real-time | 58.9 | 29.0 | 29.3 | -51% | -50% |
| **Promedio** | **58.5** | **32.4** | **42.7** | **-45%** | **-27%** |

## Desglose por tipo de tarea

### existing-bug

- **A:** SKILL 15.1 KB + refs 60.4 KB = **75.5 KB** → change-engineering.md, project-conventions.md, testing.md, architecture.md, operations.md, resilience.md
- **B:** SKILL 7.0 KB + refs 21.3 KB = **28.4 KB** → change-engineering.md, project-conventions.md
- **C:** SKILL 7.4 KB + refs 21.3 KB + AST ~16.6 KB = **45.3 KB** → change-engineering.md, project-conventions.md

### function-change

- **A:** SKILL 15.1 KB + refs 36.0 KB = **51.1 KB** → change-engineering.md, project-conventions.md, testing.md, architecture.md
- **B:** SKILL 7.0 KB + refs 21.3 KB = **28.4 KB** → change-engineering.md, project-conventions.md
- **C:** SKILL 7.4 KB + refs 21.3 KB + AST ~16.6 KB = **45.3 KB** → change-engineering.md, project-conventions.md

### module-change

- **A:** SKILL 15.1 KB + refs 52.6 KB = **67.7 KB** → change-engineering.md, project-conventions.md, testing.md, architecture.md, operations.md
- **B:** SKILL 7.0 KB + refs 36.7 KB = **43.7 KB** → change-engineering.md, architecture.md, project-conventions.md
- **C:** SKILL 7.4 KB + refs 36.7 KB + AST ~16.6 KB = **60.6 KB** → change-engineering.md, architecture.md, project-conventions.md

### external-integration

- **A:** SKILL 15.1 KB + refs 52.6 KB = **67.7 KB** → change-engineering.md, resilience.md, testing.md, architecture.md, operations.md
- **B:** SKILL 7.0 KB + refs 29.0 KB = **36.0 KB** → integrations.md, resilience.md, testing.md
- **C:** SKILL 7.4 KB + refs 29.0 KB + AST ~16.6 KB = **52.9 KB** → integrations.md, resilience.md, testing.md

### new-app

- **A:** SKILL 15.1 KB + refs 65.3 KB = **80.4 KB** → architecture.md, docker-compose.md, testing.md, database-engines.md, operations.md, project-conventions.md
- **B:** SKILL 7.0 KB + refs 47.0 KB = **54.1 KB** → architecture.md, docker-compose.md, testing.md
- **C:** SKILL 7.4 KB + refs 47.0 KB = **54.4 KB** → architecture.md, docker-compose.md, testing.md

### project-conventions

- **A:** SKILL 15.1 KB + refs 16.6 KB = **31.7 KB** → project-conventions.md, change-engineering.md
- **B:** SKILL 7.0 KB + refs 7.8 KB = **14.8 KB** → project-conventions.md
- **C:** SKILL 7.4 KB + refs 7.8 KB = **15.2 KB** → project-conventions.md

### frontend-change

- **A:** SKILL 15.1 KB + refs 32.6 KB = **47.6 KB** → frontend.md, project-conventions.md, testing.md, architecture.md
- **B:** SKILL 7.0 KB + refs 16.3 KB = **23.4 KB** → frontend.md, project-conventions.md
- **C:** SKILL 7.4 KB + refs 16.3 KB + AST ~16.6 KB = **40.3 KB** → frontend.md, project-conventions.md

### database-change

- **A:** SKILL 15.1 KB + refs 41.1 KB = **56.2 KB** → database-engines.md, architecture.md, testing.md, operations.md
- **B:** SKILL 7.0 KB + refs 20.4 KB = **27.4 KB** → database-engines.md, architecture.md
- **C:** SKILL 7.4 KB + refs 20.4 KB + AST ~16.6 KB = **44.3 KB** → database-engines.md, architecture.md

### infrastructure

- **A:** SKILL 15.1 KB + refs 33.1 KB = **48.2 KB** → operations.md, docker-compose.md
- **B:** SKILL 7.0 KB + refs 31.5 KB = **38.5 KB** → operations.md, docker-compose.md
- **C:** SKILL 7.4 KB + refs 31.5 KB = **38.8 KB** → operations.md, docker-compose.md

### real-time

- **A:** SKILL 15.1 KB + refs 43.8 KB = **58.9 KB** → architecture.md, testing.md, resilience.md, operations.md
- **B:** SKILL 7.0 KB + refs 21.9 KB = **29.0 KB** → real-time.md, architecture.md
- **C:** SKILL 7.4 KB + refs 21.9 KB = **29.3 KB** → real-time.md, architecture.md

## Referencias totales por variante

| Variante | Archivos | Total KB |
|----------|----------|---------|
| A | 10 | 95.3 |
| B | 13 | 127.6 |
| C | 13 | 132.1 |

## Hallazgos

1. **SKILL.md reducido un 51%**: de 15.1 KB a 7.4 KB. Esto reduce el contexto obligatorio en cada interacción.
2. **Contexto promedio por tarea reducido un 45% (B) y 27% (C)**: las variantes optimizadas cargan solo las referencias pertinentes.
3. **Variant A carga más referencias por tarea** porque SKILL.md era monolítico y referenciaba guías sin discriminar por tipo — el agente tenía que leer instrucciones irrelevantes para su tarea actual.
4. **El overhead del AST (Variante C)** es una hipótesis de ~16.6 KB para 100 archivos. La variante C supera a B en este proxy; falta medir cuánto código evita leer el inspector durante una tarea real.
5. **Tareas simples** (project-conventions, infrastructure) se benefician más del routing selectivo porque cargan menos referencias.
6. **Tareas complejas** (new-app, external-integration) cargan más referencias en ambas variantes, pero la B/C evita cargar las que no aplican.

## Limitaciones

- Esta métrica es un **proxy de tokens**, no una medición real. Los tokens reales dependen del tokenizador del modelo, la proporción código/prosa, y la longitud de la conversación.
- **No mide calidad**: un agente con menos contexto puede necesitar más iteraciones (más llamadas a herramientas, más contexto acumulado). La reducción de contexto inicial no garantiza menos tokens totales.
- **El overhead AST es una estimación** basada en el fixture de 4 archivos extrapolado a 100. Proyectos reales varían en densidad de símbolos.
- **El límite actual del resumen** es 60 símbolos y 6000 caracteres de cuerpo. La estimación AST de este informe proviene de una versión anterior sin ese límite y no representa la salida actual ni los tokens totales de un agente.
- **Prompt caching** (Anthropic, OpenAI) puede amortizar el costo de SKILL.md en conversaciones largas. El ahorro real depende de la tasa de cache hit.
- **La variante A no existió con las mismas referencias**: tras la integración de patrones (commit 92acdf7), las referencias crecieron. La comparación usa las referencias que existían en cada commit.
