import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/parse.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

describe('parseFile', () => {
  it('parses a valid JavaScript file', async () => {
    const result = await parseFile(join(FIXTURES, 'sample-project/src/utils/helpers.js'), '.js');
    assert.ok(result.tree, 'should return a tree');
    assert.equal(result.errors, 0, 'should have no parse errors');
    assert.equal(result.error, null);
  });

  it('parses a valid TypeScript file', async () => {
    const result = await parseFile(join(FIXTURES, 'sample-project/src/services/pricing.ts'), '.ts');
    assert.ok(result.tree, 'should return a tree');
    assert.equal(result.errors, 0);
    assert.equal(result.error, null);
  });

  it('parses a valid TSX file', async () => {
    const result = await parseFile(join(FIXTURES, 'sample-project/src/components/ProductForm.tsx'), '.tsx');
    assert.ok(result.tree, 'should return a tree');
    assert.equal(result.errors, 0);
    assert.equal(result.error, null);
  });

  it('handles files with syntax errors gracefully', async () => {
    const result = await parseFile(join(FIXTURES, 'edge-cases/syntax-error.ts'), '.ts');
    assert.ok(result.tree, 'should still return a tree');
    assert.ok(result.errors > 0, 'should report errors');
    assert.equal(result.error, null, 'should not throw');
  });

  it('returns null for unsupported extensions', async () => {
    const result = await parseFile(join(FIXTURES, 'sample-project/package.json'), '.json');
    assert.equal(result.tree, null);
    assert.ok(result.error?.includes('No grammar'));
  });

  it('returns error for non-existent files', async () => {
    const result = await parseFile(join(FIXTURES, 'nonexistent.js'), '.js');
    assert.equal(result.tree, null);
    assert.ok(result.error);
  });
});
