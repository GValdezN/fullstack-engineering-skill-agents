import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(__dirname, '..', 'cli.mjs');
const SAMPLE = join(__dirname, 'fixtures', 'sample-project');

async function run(...args) {
  const { stdout, stderr } = await exec('node', [CLI, ...args], { timeout: 30_000 });
  return { stdout, stderr };
}

describe('CLI', () => {
  it('scan --format summary produces valid output', async () => {
    const { stdout } = await run('scan', '--root', SAMPLE, '--format', 'summary', '--no-cache');
    assert.ok(stdout.includes('INDEX files='), 'should start with INDEX line');
    assert.ok(stdout.includes('calculatePrice'), 'should list calculatePrice');
    assert.ok(stdout.includes('TRUNCATED='), 'should include truncation status');
  });

  it('scan --format json produces valid JSON', async () => {
    const { stdout } = await run('scan', '--root', SAMPLE, '--format', 'json', '--no-cache');
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.files, 'should have files object');
    assert.ok(parsed.stats, 'should have stats');
    assert.equal(typeof parsed.stats.files, 'number');
    assert.equal(typeof parsed.stats.symbols, 'number');
  });

  it('scan --max-symbols limits output', async () => {
    const { stdout } = await run('scan', '--root', SAMPLE, '--format', 'summary', '--max-symbols', '3', '--no-cache');
    assert.ok(stdout.includes('SYMBOLS_SHOWN=3'), 'should show exactly 3 symbols');
    assert.ok(stdout.includes('TRUNCATED=true'), 'should be marked as truncated');
  });

  it('find locates a symbol', async () => {
    const { stdout } = await run('find', '--root', SAMPLE, '--name', 'calculatePrice');
    assert.ok(stdout.includes('calculatePrice'), 'should find the symbol');
    assert.ok(stdout.includes('pricing.ts'), 'should show the file');
  });

  it('find reports when symbol is not found', async () => {
    const { stdout } = await run('find', '--root', SAMPLE, '--name', 'nonExistentSymbol');
    assert.ok(stdout.includes('No symbols found'), 'should report not found');
  });

  it('symbol shows source with context', async () => {
    const { stdout } = await run('symbol', '--root', SAMPLE, '--file', 'src/services/pricing.ts', '--name', 'calculatePrice');
    assert.ok(stdout.includes('calculatePrice'), 'should show symbol info');
    assert.ok(stdout.includes('exported'), 'should show export status');
    assert.ok(stdout.includes('return'), 'should show source code');
  });

  it('--help shows usage', async () => {
    const { stdout } = await run('--help');
    assert.ok(stdout.includes('code-indexer'), 'should show tool name');
    assert.ok(stdout.includes('scan'), 'should list scan command');
    assert.ok(stdout.includes('find'), 'should list find command');
  });
});
