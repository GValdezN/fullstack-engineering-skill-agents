import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverFiles } from '../src/discover.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

describe('discoverFiles', () => {
  it('finds JS/TS/TSX files in sample project', async () => {
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    const paths = files.map(f => f.relativePath);

    assert.ok(paths.includes('src/services/pricing.ts'), 'should find .ts files');
    assert.ok(paths.includes('src/components/ProductForm.tsx'), 'should find .tsx files');
    assert.ok(paths.includes('src/utils/helpers.js'), 'should find .js files');
    assert.ok(paths.includes('src/index.ts'), 'should find index.ts');
  });

  it('returns correct metadata for each file', async () => {
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    const pricing = files.find(f => f.relativePath === 'src/services/pricing.ts');

    assert.ok(pricing, 'pricing.ts should be found');
    assert.equal(pricing.extension, '.ts');
    assert.ok(pricing.size > 0, 'size should be positive');
    assert.ok(pricing.path.endsWith('pricing.ts'), 'path should be absolute');
  });

  it('excludes non-JS files like package.json', async () => {
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    const paths = files.map(f => f.relativePath);
    assert.ok(!paths.some(p => p.endsWith('.json')), 'should not include .json files');
  });

  it('finds edge case files', async () => {
    const files = await discoverFiles(join(FIXTURES, 'edge-cases'), { includeEmpty: true });
    const paths = files.map(f => f.relativePath);

    assert.ok(paths.includes('syntax-error.ts'), 'should find files with syntax errors');
    assert.ok(paths.includes('unicode-names.mjs'), 'should find .mjs files');
  });

  it('returns sorted results', async () => {
    const files = await discoverFiles(join(FIXTURES, 'sample-project'));
    const paths = files.map(f => f.relativePath);
    const sorted = [...paths].sort();
    assert.deepEqual(paths, sorted);
  });
});
