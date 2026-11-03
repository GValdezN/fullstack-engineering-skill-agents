import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

describe('context-benchmark sanity', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'skill-benchmark-'));
  const reportPath = join(tempDir, 'context-benchmark.md');

  after(() => rmSync(tempDir, { recursive: true, force: true }));

  it('benchmark script exists and is valid JS', () => {
    const scriptPath = join(root, 'scripts', 'context-benchmark.mjs');
    assert.ok(existsSync(scriptPath), 'scripts/context-benchmark.mjs missing');
    // Check it parses without error
    execFileSync(process.execPath, ['--check', scriptPath]);
  });

  it('benchmark produces a non-empty report', () => {
    execFileSync(process.execPath, ['scripts/context-benchmark.mjs', '--output', reportPath], { cwd: root });
    assert.ok(existsSync(reportPath), 'report file missing after run');
    const stat = statSync(reportPath);
    assert.ok(stat.size > 500, `report too small: ${stat.size} bytes`);
  });

  it('report contains expected sections', () => {
    const content = readFileSync(reportPath, 'utf8');
    assert.ok(content.includes('# Context Benchmark A/B/C'), 'missing title');
    assert.ok(content.includes('## Metodología'), 'missing methodology');
    assert.ok(content.includes('## Tabla principal'), 'missing main table');
    assert.ok(content.includes('## Hallazgos'), 'missing findings');
    assert.ok(content.includes('## Limitaciones'), 'missing limitations');
  });

  it('report contains all task types', () => {
    const content = readFileSync(reportPath, 'utf8');
    const tasks = [
      'existing-bug', 'function-change', 'module-change',
      'external-integration', 'new-app', 'project-conventions',
      'frontend-change', 'database-change', 'infrastructure', 'real-time',
    ];
    for (const task of tasks) {
      assert.ok(content.includes(task), `missing task type: ${task}`);
    }
  });
});
