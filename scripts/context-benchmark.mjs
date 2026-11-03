#!/usr/bin/env node
/**
 * Context benchmark: measures proxy token load per task type across skill variants.
 * Usage: node scripts/context-benchmark.mjs [--output reports/context-benchmark.md]
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    output: { type: 'string', default: 'reports/context-benchmark.md' },
    help:   { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log('Usage: node scripts/context-benchmark.mjs [--output <path>]');
  process.exit(0);
}

const VARIANTS = {
  A: { label: 'Original skill', commit: '1c73575' },
  B: { label: 'Optimized SKILL.md (Phase 1)', commit: '71e8367' },
  C: { label: 'Optimized + AST indexer (current)', commit: '4967e87' },
};

// Reference loading per task type per variant.
// Variant A: monolithic SKILL.md loaded ALL content inline; references are loaded
// based on explicit "Leer [ref]" instructions scattered through the text.
// Variant B/C: uses the routing table for selective loading.

const ROUTING = {
  A: {
    'existing-bug': [
      'change-engineering.md', 'project-conventions.md', 'testing.md',
      'architecture.md', 'operations.md', 'resilience.md',
    ],
    'function-change': [
      'change-engineering.md', 'project-conventions.md', 'testing.md',
      'architecture.md',
    ],
    'module-change': [
      'change-engineering.md', 'project-conventions.md', 'testing.md',
      'architecture.md', 'operations.md',
    ],
    'external-integration': [
      'change-engineering.md', 'resilience.md', 'testing.md',
      'architecture.md', 'operations.md',
    ],
    'new-app': [
      'architecture.md', 'docker-compose.md', 'testing.md',
      'database-engines.md', 'operations.md', 'project-conventions.md',
    ],
    'project-conventions': [
      'project-conventions.md', 'change-engineering.md',
    ],
    'frontend-change': [
      'frontend.md', 'project-conventions.md', 'testing.md',
      'architecture.md',
    ],
    'database-change': [
      'database-engines.md', 'architecture.md', 'testing.md',
      'operations.md',
    ],
    'infrastructure': [
      'operations.md', 'docker-compose.md',
    ],
    'real-time': [
      'architecture.md', 'testing.md', 'resilience.md',
      'operations.md',
    ],
  },
  B: {
    'existing-bug': ['change-engineering.md', 'project-conventions.md'],
    'function-change': ['change-engineering.md', 'project-conventions.md'],
    'module-change': ['change-engineering.md', 'architecture.md', 'project-conventions.md'],
    'external-integration': ['integrations.md', 'resilience.md', 'testing.md'],
    'new-app': ['architecture.md', 'docker-compose.md', 'testing.md'],
    'project-conventions': ['project-conventions.md'],
    'frontend-change': ['frontend.md', 'project-conventions.md'],
    'database-change': ['database-engines.md', 'architecture.md'],
    'infrastructure': ['operations.md', 'docker-compose.md'],
    'real-time': ['real-time.md', 'architecture.md'],
  },
  // C is same routing as B (same SKILL.md routing table) plus optional AST overhead
  C: {
    'existing-bug': ['change-engineering.md', 'project-conventions.md'],
    'function-change': ['change-engineering.md', 'project-conventions.md'],
    'module-change': ['change-engineering.md', 'architecture.md', 'project-conventions.md'],
    'external-integration': ['integrations.md', 'resilience.md', 'testing.md'],
    'new-app': ['architecture.md', 'docker-compose.md', 'testing.md'],
    'project-conventions': ['project-conventions.md'],
    'frontend-change': ['frontend.md', 'project-conventions.md'],
    'database-change': ['database-engines.md', 'architecture.md'],
    'infrastructure': ['operations.md', 'docker-compose.md'],
    'real-time': ['real-time.md', 'architecture.md'],
  },
};

const TASK_TYPES = Object.keys(ROUTING.A);

// AST scan overhead estimate: ~170 bytes per file in a typical project.
// Sample project: 4 files → 677 bytes ≈ 169 B/file.
// Estimate for a medium project of 100 files: ~17KB.
// Only applies to variant C on tasks that benefit from AST inspection.
const AST_BYTES_PER_FILE = 170;
const AST_TYPICAL_FILES = 100;
const AST_OVERHEAD = AST_BYTES_PER_FILE * AST_TYPICAL_FILES;
const AST_TASKS = new Set([
  'existing-bug', 'function-change', 'module-change',
  'external-integration', 'frontend-change', 'database-change',
]);

function gitShow(commit, path) {
  try {
    return execSync(`git show ${commit}:${path}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

function getFileSize(commit, path) {
  const content = gitShow(commit, path);
  return content ? Buffer.byteLength(content, 'utf8') : 0;
}

// Collect sizes
const sizes = {};
for (const [v, { commit }] of Object.entries(VARIANTS)) {
  sizes[v] = { skill: 0, refs: {} };
  sizes[v].skill = getFileSize(commit, 'SKILL.md');

  const refFiles = execSync(`git ls-tree --name-only ${commit} references/`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);

  for (const refPath of refFiles) {
    const name = refPath.replace('references/', '');
    sizes[v].refs[name] = getFileSize(commit, refPath);
  }
}

// Calculate per-task context
function calcTask(variant, task) {
  const s = sizes[variant];
  const refs = ROUTING[variant][task] || [];
  let refBytes = 0;
  for (const r of refs) {
    refBytes += s.refs[r] || 0;
  }
  let ast = 0;
  if (variant === 'C' && AST_TASKS.has(task)) {
    ast = AST_OVERHEAD;
  }
  return {
    skill: s.skill,
    refBytes,
    ast,
    total: s.skill + refBytes + ast,
    refs,
  };
}

// Build results
const results = {};
for (const task of TASK_TYPES) {
  results[task] = {};
  for (const v of ['A', 'B', 'C']) {
    results[task][v] = calcTask(v, task);
  }
}

// Format helpers
function kb(bytes) { return (bytes / 1024).toFixed(1); }
function pct(a, b) {
  if (a === 0) return '—';
  return ((b - a) / a * 100).toFixed(0) + '%';
}
function padR(s, n) { return String(s).padEnd(n); }
function padL(s, n) { return String(s).padStart(n); }

// Generate report
const now = new Date().toISOString().slice(0, 10);
let report = `# Context Benchmark A/B/C

**Fecha:** ${now}
**Plataforma:** ${process.platform} ${process.arch}, Node ${process.version}

## Variantes

| Variante | Descripción | Commit |
|----------|-------------|--------|
| A | ${VARIANTS.A.label} | \`${VARIANTS.A.commit}\` |
| B | ${VARIANTS.B.label} | \`${VARIANTS.B.commit}\` |
| C | ${VARIANTS.C.label} | \`${VARIANTS.C.commit}\` |

## Metodología

Esta medición usa un **proxy de tokens**: el tamaño en bytes del contexto que el agente cargaría en cada tipo de tarea. No es una medición real de tokens de API, sino una estimación del volumen de texto enviado al LLM.

- **SKILL.md** se carga siempre (contexto obligatorio).
- **Referencias** se cargan según la tabla de routing de cada variante.
- **Variante A** (monolítica): SKILL.md contiene la mayoría de las instrucciones inline y además referencia explícitamente las guías aplicables; el agente carga más referencias porque las instrucciones no discriminan por tipo de tarea.
- **Variantes B/C** (router): SKILL.md es compacto y solo carga las referencias pertinentes según la tabla de routing.
- **Variante C** añade una estimación del overhead del índice AST (~${kb(AST_OVERHEAD)} KB) para tareas donde el inspector aporta valor, asumiendo un proyecto de ${AST_TYPICAL_FILES} archivos fuente a ~${AST_BYTES_PER_FILE} bytes/archivo de salida.

## Tamaño de SKILL.md

| Variante | Bytes | KB |
|----------|------:|---:|
| A | ${sizes.A.skill} | ${kb(sizes.A.skill)} |
| B | ${sizes.B.skill} | ${kb(sizes.B.skill)} |
| C | ${sizes.C.skill} | ${kb(sizes.C.skill)} |

Reducción A→B: **${pct(sizes.A.skill, sizes.B.skill)}** (${kb(sizes.A.skill)} KB → ${kb(sizes.B.skill)} KB)
Reducción A→C: **${pct(sizes.A.skill, sizes.C.skill)}** (${kb(sizes.A.skill)} KB → ${kb(sizes.C.skill)} KB)

## Tabla principal de contexto por tipo de tarea

| Tipo de tarea | A (KB) | B (KB) | C (KB) | B vs A | C vs A |
|---------------|-------:|-------:|-------:|-------:|-------:|
`;

let sumA = 0, sumB = 0, sumC = 0;
for (const task of TASK_TYPES) {
  const a = results[task].A.total;
  const b = results[task].B.total;
  const c = results[task].C.total;
  sumA += a; sumB += b; sumC += c;
  report += `| ${task} | ${kb(a)} | ${kb(b)} | ${kb(c)} | ${pct(a, b)} | ${pct(a, c)} |\n`;
}

const avgA = sumA / TASK_TYPES.length;
const avgB = sumB / TASK_TYPES.length;
const avgC = sumC / TASK_TYPES.length;

report += `| **Promedio** | **${kb(avgA)}** | **${kb(avgB)}** | **${kb(avgC)}** | **${pct(avgA, avgB)}** | **${pct(avgA, avgC)}** |\n`;

report += `\n## Desglose por tipo de tarea\n`;

for (const task of TASK_TYPES) {
  report += `\n### ${task}\n\n`;
  for (const v of ['A', 'B', 'C']) {
    const r = results[task][v];
    const refsStr = r.refs.length > 0 ? r.refs.join(', ') : '(ninguna)';
    const astStr = r.ast > 0 ? ` + AST ~${kb(r.ast)} KB` : '';
    report += `- **${v}:** SKILL ${kb(r.skill)} KB + refs ${kb(r.refBytes)} KB${astStr} = **${kb(r.total)} KB** → ${refsStr}\n`;
  }
}

report += `
## Referencias totales por variante

| Variante | Archivos | Total KB |
|----------|----------|---------|
`;

for (const [v, data] of Object.entries(sizes)) {
  const refEntries = Object.values(data.refs);
  const totalRef = refEntries.reduce((a, b) => a + b, 0);
  report += `| ${v} | ${refEntries.length} | ${kb(totalRef)} |\n`;
}

report += `
## Hallazgos

1. **SKILL.md reducido un ${pct(sizes.A.skill, sizes.C.skill).replace('-', '')}**: de ${kb(sizes.A.skill)} KB a ${kb(sizes.C.skill)} KB. Esto reduce el contexto obligatorio en cada interacción.
2. **Contexto promedio por tarea reducido un ${pct(avgA, avgB).replace('-', '')} (B) y ${pct(avgA, avgC).replace('-', '')} (C)**: las variantes optimizadas cargan solo las referencias pertinentes.
3. **Variant A carga más referencias por tarea** porque SKILL.md era monolítico y referenciaba guías sin discriminar por tipo — el agente tenía que leer instrucciones irrelevantes para su tarea actual.
4. **El overhead del AST (Variante C)** es una hipótesis de ~${kb(AST_OVERHEAD)} KB para ${AST_TYPICAL_FILES} archivos. La variante C supera a B en este proxy; falta medir cuánto código evita leer el inspector durante una tarea real.
5. **Tareas simples** (project-conventions, infrastructure) se benefician más del routing selectivo porque cargan menos referencias.
6. **Tareas complejas** (new-app, external-integration) cargan más referencias en ambas variantes, pero la B/C evita cargar las que no aplican.

## Limitaciones

- Esta métrica es un **proxy de tokens**, no una medición real. Los tokens reales dependen del tokenizador del modelo, la proporción código/prosa, y la longitud de la conversación.
- **No mide calidad**: un agente con menos contexto puede necesitar más iteraciones (más llamadas a herramientas, más contexto acumulado). La reducción de contexto inicial no garantiza menos tokens totales.
- **El overhead AST es una estimación** basada en el fixture de 4 archivos extrapolado a ${AST_TYPICAL_FILES}. Proyectos reales varían en densidad de símbolos.
- **El límite actual del resumen** es 60 símbolos y 6000 caracteres de cuerpo. La estimación AST de este informe proviene de una versión anterior sin ese límite y no representa la salida actual ni los tokens totales de un agente.
- **Prompt caching** (Anthropic, OpenAI) puede amortizar el costo de SKILL.md en conversaciones largas. El ahorro real depende de la tasa de cache hit.
- **La variante A no existió con las mismas referencias**: tras la integración de patrones (commit 92acdf7), las referencias crecieron. La comparación usa las referencias que existían en cada commit.
`;

mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, report, 'utf8');
console.log(`Report written to ${args.output}`);
console.log(`Variants: A=${kb(sizes.A.skill)}KB B=${kb(sizes.B.skill)}KB C=${kb(sizes.C.skill)}KB`);
console.log(`Avg context: A=${kb(avgA)}KB B=${kb(avgB)}KB C=${kb(avgC)}KB`);
console.log(`Reduction B vs A: ${pct(avgA, avgB)}, C vs A: ${pct(avgA, avgC)}`);
