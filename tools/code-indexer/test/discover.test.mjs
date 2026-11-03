import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

  it('rejects sibling-directory symlinks whose names share the root prefix', async () => {
    const base = await mkdtemp(join(tmpdir(), 'code-indexer-discover-'));
    const root = join(base, 'project');
    const external = join(base, 'project-external');
    try {
      await mkdir(root);
      await mkdir(external);
      await writeFile(join(root, 'inside.js'), 'export function inside() {}');
      await writeFile(join(external, 'outside.js'), 'export function outside() {}');
      await symlink(external, join(root, 'linked-external'), process.platform === 'win32' ? 'junction' : 'dir');

      const paths = (await discoverFiles(root)).map(file => file.relativePath);
      assert.deepEqual(paths, ['inside.js']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('does not revisit directories through internal symlink cycles', async () => {
    const base = await mkdtemp(join(tmpdir(), 'code-indexer-cycle-'));
    const root = join(base, 'project');
    try {
      await mkdir(join(root, 'src'), { recursive: true });
      await writeFile(join(root, 'src', 'inside.js'), 'export function inside() {}');
      await symlink(root, join(root, 'src', 'back'), process.platform === 'win32' ? 'junction' : 'dir');

      const paths = (await discoverFiles(root)).map(file => file.relativePath);
      assert.deepEqual(paths, ['src/inside.js']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
