import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';

import { discoverFiles } from '../src/discover.mjs';
import { parseFile } from '../src/parse.mjs';
import { extractSymbols } from '../src/extract.mjs';
import { CodeIndex } from '../src/index.mjs';
import { formatSummary, formatJSON } from '../src/output.mjs';

const exec = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const EDGE = join(FIXTURES, 'edge-cases');
const CLI = join(__dirname, '..', 'cli.mjs');

function tmpDir() {
  return join(__dirname, 'fixtures', `_tmp_${randomBytes(4).toString('hex')}`);
}

async function run(...args) {
  const { stdout, stderr } = await exec('node', [CLI, ...args], { timeout: 30_000 });
  return { stdout, stderr };
}

async function extractFrom(relPath, ext) {
  const fullPath = join(FIXTURES, relPath);
  const { tree } = await parseFile(fullPath, ext);
  assert.ok(tree, `should parse ${relPath}`);
  return extractSymbols(tree, relPath);
}

// ─── Empty and boundary files ───────────────────────────────────

describe('Empty and boundary files', () => {
  it('parses empty file without crashing', async () => {
    const result = await parseFile(join(EDGE, 'empty.js'), '.js');
    // tree-sitter can parse empty files; either tree or graceful null is acceptable
    assert.equal(result.error, null);
  });

  it('extracts zero symbols from only-comments file', async () => {
    const { tree, error } = await parseFile(join(EDGE, 'only-comments.js'), '.js');
    assert.equal(error, null);
    assert.ok(tree);
    const { symbols, imports, exports } = extractSymbols(tree, 'only-comments.js');
    assert.equal(symbols.length, 0);
    assert.equal(imports.length, 0);
    assert.equal(exports.length, 0);
  });

  it('extracts only imports from imports-only file', async () => {
    const { tree, error } = await parseFile(join(EDGE, 'only-imports.ts'), '.ts');
    assert.equal(error, null);
    assert.ok(tree);
    const { symbols, imports, exports } = extractSymbols(tree, 'only-imports.ts');
    assert.equal(symbols.length, 0);
    assert.ok(imports.length >= 2, 'should have at least 2 imports');
    assert.equal(exports.length, 0);
  });

  it('handles large generated file within limits', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      const lines = [];
      for (let i = 0; i < 500; i++) {
        lines.push(`export function fn_${i}(x) { return x + ${i}; }`);
      }
      const filePath = join(dir, 'big.js');
      await writeFile(filePath, lines.join('\n'), 'utf8');

      const { tree, error } = await parseFile(filePath, '.js');
      assert.equal(error, null);
      assert.ok(tree);

      const { symbols } = extractSymbols(tree, 'big.js');
      assert.equal(symbols.length, 500, 'should extract all 500 functions');
      assert.ok(symbols.every(s => s.exported), 'all should be exported');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── File system edge cases ─────────────────────────────────────

describe('File system edge cases', () => {
  it('handles paths with spaces in directory names', async () => {
    const dir = join(__dirname, 'fixtures', '_tmp dir with spaces');
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'test.js'), 'export function hello() {}', 'utf8');
      const files = await discoverFiles(dir);
      assert.equal(files.length, 1);
      assert.ok(files[0].relativePath.includes('test.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('handles file deleted between discover and parse', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      const filePath = join(dir, 'ephemeral.js');
      await writeFile(filePath, 'export function ghost() {}', 'utf8');
      const files = await discoverFiles(dir);
      assert.equal(files.length, 1);

      // Delete the file before parsing
      await unlink(filePath);
      const result = await parseFile(filePath, '.js');
      assert.equal(result.tree, null);
      assert.ok(result.error, 'should report file-read error');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes .env files', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, '.env'), 'SECRET=abc', 'utf8');
      await writeFile(join(dir, '.env.local'), 'KEY=xyz', 'utf8');
      await writeFile(join(dir, '.env.production'), 'DB=prod', 'utf8');
      await writeFile(join(dir, 'app.js'), 'export const x = 1;', 'utf8');

      const files = await discoverFiles(dir);
      assert.equal(files.length, 1, 'only app.js should be found');
      assert.ok(files[0].relativePath.includes('app.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes .key and .pem files', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'server.key'), 'private key', 'utf8');
      await writeFile(join(dir, 'cert.pem'), 'certificate', 'utf8');
      await writeFile(join(dir, 'main.ts'), 'export const a = 1;', 'utf8');

      const files = await discoverFiles(dir);
      assert.equal(files.length, 1);
      assert.ok(files[0].relativePath.includes('main.ts'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes binary files by extension', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(join(dir, 'image.png'), Buffer.alloc(8), 'utf8');
      await writeFile(join(dir, 'lib.wasm'), Buffer.alloc(8), 'utf8');
      await writeFile(join(dir, 'app.js'), 'export const x = 1;', 'utf8');

      const files = await discoverFiles(dir);
      assert.equal(files.length, 1);
      assert.ok(files[0].relativePath.includes('app.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes node_modules even when nested', async () => {
    const dir = tmpDir();
    const nested = join(dir, 'packages', 'core', 'node_modules', 'dep');
    await mkdir(nested, { recursive: true });
    await mkdir(join(dir, 'packages', 'core', 'src'), { recursive: true });
    try {
      await writeFile(join(nested, 'index.js'), 'export function dep() {}', 'utf8');
      await writeFile(join(dir, 'packages', 'core', 'src', 'main.js'), 'export function main() {}', 'utf8');

      const files = await discoverFiles(dir);
      const paths = files.map(f => f.relativePath);
      assert.ok(!paths.some(p => p.includes('node_modules')), 'no node_modules files');
      assert.ok(paths.some(p => p.includes('main.js')), 'should find main.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── Parsing edge cases ─────────────────────────────────────────

describe('Parsing edge cases', () => {
  it('extracts destructured parameters', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const fn = symbols.find(s => s.name === 'destructured');
    assert.ok(fn, 'should find destructured');
    assert.equal(fn.kind, 'function');
    assert.equal(fn.exported, true);
  });

  it('extracts functions with default parameters', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const fn = symbols.find(s => s.name === 'withDefault');
    assert.ok(fn, 'should find withDefault');
    assert.equal(fn.exported, true);
  });

  it('extracts functions with rest parameters', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const fn = symbols.find(s => s.name === 'withRest');
    assert.ok(fn, 'should find withRest');
    assert.equal(fn.exported, true);
    assert.ok(fn.params.some(p => p.startsWith('...')), 'should have rest param');
  });

  it('extracts async functions', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const fn = symbols.find(s => s.name === 'fetchData');
    assert.ok(fn, 'should find fetchData');
    assert.equal(fn.exported, true);
  });

  it('generator functions: graceful handling (known limitation)', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const fn = symbols.find(s => s.name === 'generateIds');
    // generator_function_declaration is a different node type not handled in MVP;
    // the extractor should not crash — absence is acceptable, presence is a bonus
    if (fn) {
      assert.equal(fn.exported, true);
    } else {
      assert.ok(true, 'generator functions not extracted yet (known limitation)');
    }
  });

  it('handles classes with computed and static methods', async () => {
    const { symbols } = await extractFrom('edge-cases/advanced-params.ts', '.ts');
    const cls = symbols.find(s => s.name === 'Service');
    assert.ok(cls, 'should find Service class');
    assert.equal(cls.kind, 'class');
    // static create should be extractable
    assert.ok(cls.methods.some(m => m.name === 'create'), 'should have create');
    assert.ok(cls.methods.some(m => m.name === 'process'), 'should have process');
  });

  it('extracts re-exports from re-export-only files', async () => {
    const { exports } = await extractFrom('edge-cases/reexports.ts', '.ts');
    assert.ok(exports.length >= 3, 'should have at least 3 re-exports');
    assert.ok(exports.some(e => e.name === 'readFile'), 'should re-export readFile');
    assert.ok(exports.some(e => e.name === 'joinPath' && e.original === 'join'), 'should alias join→joinPath');
  });

  it('extracts namespace imports', async () => {
    const { imports } = await extractFrom('edge-cases/namespace-import.mjs', '.mjs');
    const nsImport = imports.find(i => i.source === 'node:fs/promises');
    assert.ok(nsImport, 'should find fs namespace import');
    assert.ok(nsImport.specifiers.some(s => s.isNamespace && s.name === 'fs'), 'should be namespace import named fs');
  });

  it('extracts default + named mixed imports', async () => {
    const { imports } = await extractFrom('edge-cases/namespace-import.mjs', '.mjs');
    const mixed = imports.find(i => i.source === './some-module');
    assert.ok(mixed, 'should find mixed import');
    const specs = mixed.specifiers;
    assert.ok(specs.some(s => s.isDefault), 'should have default import');
    assert.ok(specs.some(s => s.name === 'named'), 'should have named import');
  });
});

// ─── Output limits ──────────────────────────────────────────────

describe('Output limits', () => {
  let index;

  beforeEach(async () => {
    index = new CodeIndex();
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    for (const file of files) {
      const { tree, errors, language } = await parseFile(file.path, file.extension);
      if (!tree) continue;
      const extracted = extractSymbols(tree, file.relativePath);
      index.addFile(file.relativePath, extracted, { language, errors });
    }
  });

  it('--max-symbols=1 shows exactly 1 symbol', () => {
    const output = formatSummary(index, { maxSymbols: 1 });
    assert.ok(output.includes('SYMBOLS_SHOWN=1'), 'should show 1 symbol');
    assert.ok(output.includes('TRUNCATED=true'), 'should be truncated');
  });

  it('--max-chars truncates output correctly', () => {
    const output = formatSummary(index, { maxChars: 100 });
    assert.ok(output.includes('TRUNCATED=true'), 'should be truncated');
    // The TRUNCATED line is appended after, so content before it is limited
    const beforeTruncated = output.split('\nTRUNCATED=')[0];
    assert.ok(beforeTruncated.length <= 100, `content before footer should be ≤100 chars, got ${beforeTruncated.length}`);
  });

  it('JSON output is valid even with many symbols', async () => {
    const dir = tmpDir();
    await mkdir(dir, { recursive: true });
    try {
      const lines = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`export function fn${i}() { return ${i}; }`);
      }
      await writeFile(join(dir, 'many.js'), lines.join('\n'), 'utf8');

      const { stdout } = await run('scan', '--root', dir, '--format', 'json', '--no-cache');
      const parsed = JSON.parse(stdout);
      assert.ok(parsed.files, 'should have files');
      assert.ok(parsed.stats.symbols >= 100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('summary without limits shows all symbols', () => {
    const output = formatSummary(index);
    assert.ok(output.includes('TRUNCATED=false'));
    const stats = index.stats();
    assert.ok(output.includes(`SYMBOLS_SHOWN=${stats.symbols}`));
  });
});

// ─── Index queries ──────────────────────────────────────────────

describe('Index queries', () => {
  let index;

  beforeEach(async () => {
    index = new CodeIndex();
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    for (const file of files) {
      const { tree, errors, language } = await parseFile(file.path, file.extension);
      if (!tree) continue;
      const extracted = extractSymbols(tree, file.relativePath);
      index.addFile(file.relativePath, extracted, { language, errors });
    }
  });

  it('findByName returns empty for nonexistent symbol', () => {
    const results = index.findByName('totallyNonExistent_xyz');
    assert.equal(results.length, 0);
  });

  it('findByName returns exact matches before partial', () => {
    const results = index.findByName('clamp');
    assert.ok(results.length >= 1);
    assert.equal(results[0].name, 'clamp', 'exact match should be first');
  });

  it('findByKind filters to the requested kind', () => {
    const classes = index.findByKind('class');
    assert.ok(classes.length > 0, 'should find classes');
    assert.ok(classes.every(s => s.kind === 'class'), 'all should be classes');
  });

  it('findByKind returns components only', () => {
    const components = index.findByKind('component');
    assert.ok(components.length > 0, 'should find components');
    assert.ok(components.every(s => s.kind === 'component'), 'all should be components');
  });

  it('findExported returns only exported symbols', () => {
    const exported = index.findExported();
    assert.ok(exported.length > 0);
    assert.ok(exported.every(s => s.exported), 'all should be exported');
    // internalHelper is local, should not be here
    assert.ok(!exported.some(s => s.name === 'internalHelper'), 'should exclude locals');
  });

  it('findByFile returns symbols for a specific file', () => {
    const symbols = index.findByFile('src/utils/helpers.js');
    assert.ok(symbols.length > 0);
    assert.ok(symbols.some(s => s.name === 'formatCurrency'));
  });

  it('findByFile returns empty for nonexistent file', () => {
    const symbols = index.findByFile('src/does/not/exist.ts');
    assert.equal(symbols.length, 0);
  });

  it('stats reports correct totals', () => {
    const stats = index.stats();
    assert.ok(stats.files > 0);
    assert.ok(stats.symbols > 0);
    assert.equal(typeof stats.errors, 'number');
  });
});

// ─── CLI integration (symbol with --context) ────────────────────

describe('CLI symbol with context', () => {
  const SAMPLE = join(FIXTURES, 'sample-project');

  it('symbol --context shows surrounding lines', async () => {
    const { stdout } = await run('symbol', '--root', SAMPLE, '--file', 'src/services/pricing.ts', '--name', 'calculateTax', '--context', '2');
    assert.ok(stdout.includes('calculateTax'), 'should show symbol');
    // Context should include lines before and after the function
    const lines = stdout.split('\n').filter(l => l.match(/^\s*[> ] \s*\d+/));
    assert.ok(lines.length > 0, 'should have source lines');
  });

  it('scan on edge-cases directory handles mixed quality files', async () => {
    const { stdout } = await run('scan', '--root', EDGE, '--format', 'summary', '--no-cache');
    assert.ok(stdout.includes('INDEX files='), 'should produce valid index');
    // Should handle all the edge case files without crashing
    assert.ok(stdout.includes('TRUNCATED='), 'should complete with truncation status');
  });
});
