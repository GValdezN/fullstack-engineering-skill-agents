import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  contentHash, loadProjectCache, saveProjectCache,
  clearProjectCache, clearAllCaches, enforceSizeLimit,
  getCacheDir, getIndexVersion,
} from '../src/cache.mjs';

const TMP_PROJECT = join(tmpdir(), 'code-indexer-test-project-' + Date.now());

function fakeExtracted(name) {
  return {
    symbols: [{ name, kind: 'function', params: [], startLine: 1, endLine: 5, exported: true }],
    imports: [],
    exports: [],
    _language: 'javascript',
    _errors: 0,
  };
}

describe('cache', () => {
  beforeEach(async () => {
    await mkdir(TMP_PROJECT, { recursive: true });
  });

  afterEach(async () => {
    await clearAllCaches();
    await rm(TMP_PROJECT, { recursive: true, force: true }).catch(() => {});
  });

  it('returns empty state for uncached project', async () => {
    const result = await loadProjectCache('/nonexistent/project');
    assert.equal(result.manifest, null);
    assert.equal(result.entries.size, 0);
  });

  it('saves and loads project cache', async () => {
    const root = '/test/project-save-load';
    const entries = new Map();
    entries.set('src/app.js', {
      hash: contentHash('const x = 1;'),
      data: fakeExtracted('myFunc'),
    });

    await saveProjectCache(root, entries);
    const loaded = await loadProjectCache(root);

    assert.ok(loaded.manifest, 'should have manifest');
    assert.equal(loaded.manifest.version, getIndexVersion());
    assert.equal(loaded.entries.size, 1);
    assert.ok(loaded.entries.has('src/app.js'));
    assert.deepEqual(loaded.entries.get('src/app.js').data.symbols[0].name, 'myFunc');
  });

  it('invalidates when content hash changes (incremental rescan)', async () => {
    const root = '/test/project-incremental';
    const entries = new Map();
    const originalContent = 'function hello() {}';
    entries.set('src/app.js', {
      hash: contentHash(originalContent),
      data: fakeExtracted('hello'),
    });
    entries.set('src/utils.js', {
      hash: contentHash('const a = 1;'),
      data: fakeExtracted('utilA'),
    });

    await saveProjectCache(root, entries);
    const loaded = await loadProjectCache(root);

    // Simulate checking: app.js changed, utils.js didn't
    const changedContent = 'function helloWorld() {}';
    const appEntry = loaded.entries.get('src/app.js');
    const utilEntry = loaded.entries.get('src/utils.js');

    assert.notEqual(appEntry.hash, contentHash(changedContent), 'hash should differ for changed file');
    assert.equal(utilEntry.hash, contentHash('const a = 1;'), 'hash should match for unchanged file');
  });

  it('detects deleted files (not in new entries)', async () => {
    const root = '/test/project-delete';
    const entries = new Map();
    entries.set('src/a.js', { hash: contentHash('a'), data: fakeExtracted('a') });
    entries.set('src/b.js', { hash: contentHash('b'), data: fakeExtracted('b') });

    await saveProjectCache(root, entries);

    // On rescan, only src/a.js is discovered — save without src/b.js
    const newEntries = new Map();
    newEntries.set('src/a.js', { hash: contentHash('a'), data: fakeExtracted('a') });
    await saveProjectCache(root, newEntries);

    const loaded = await loadProjectCache(root);
    assert.equal(loaded.entries.size, 1, 'deleted file should be gone');
    assert.ok(loaded.entries.has('src/a.js'));
    assert.ok(!loaded.entries.has('src/b.js'));
  });

  it('invalidates all entries when index version changes', async () => {
    const root = '/test/project-version';
    const entries = new Map();
    entries.set('src/a.js', { hash: contentHash('a'), data: fakeExtracted('a') });

    await saveProjectCache(root, entries);

    // Tamper with the manifest version
    const { dir } = await loadProjectCache(root);
    const manifestFile = join(dir, '_manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.version = 'old-version';
    await writeFile(manifestFile, JSON.stringify(manifest), 'utf8');

    const loaded = await loadProjectCache(root);
    assert.equal(loaded.manifest, null, 'should discard stale manifest');
    assert.equal(loaded.entries.size, 0, 'should have no entries');
    assert.ok(loaded.stale, 'should flag as stale');
  });

  it('clearProjectCache removes one project', async () => {
    const root = '/test/project-clear-one';
    const entries = new Map();
    entries.set('src/a.js', { hash: 'abc', data: fakeExtracted('a') });
    await saveProjectCache(root, entries);

    await clearProjectCache(root);
    const loaded = await loadProjectCache(root);
    assert.equal(loaded.entries.size, 0);
  });

  it('clearAllCaches removes everything', async () => {
    await saveProjectCache('/proj/1', new Map([['a.js', { hash: 'h1', data: fakeExtracted('a') }]]));
    await saveProjectCache('/proj/2', new Map([['b.js', { hash: 'h2', data: fakeExtracted('b') }]]));

    await clearAllCaches();

    const r1 = await loadProjectCache('/proj/1');
    const r2 = await loadProjectCache('/proj/2');
    assert.equal(r1.entries.size, 0);
    assert.equal(r2.entries.size, 0);
  });

  it('enforceSizeLimit evicts oldest projects first', async () => {
    // Create two projects — "old" and "new"
    const oldRoot = '/test/project-evict-old';
    const newRoot = '/test/project-evict-new';

    const bigData = fakeExtracted('big');
    bigData._padding = 'x'.repeat(10_000);

    await saveProjectCache(oldRoot, new Map([['a.js', { hash: 'h1', data: bigData }]]));
    // Small delay so timestamps differ
    await new Promise(r => setTimeout(r, 50));
    await saveProjectCache(newRoot, new Map([['b.js', { hash: 'h2', data: bigData }]]));

    // Enforce a small limit that forces eviction
    await enforceSizeLimit(1024);

    // The older project should be evicted first
    const oldLoaded = await loadProjectCache(oldRoot);
    const newLoaded = await loadProjectCache(newRoot);

    // At least one should be gone
    const totalRemaining = oldLoaded.entries.size + newLoaded.entries.size;
    assert.ok(totalRemaining < 2, 'at least one project should be evicted');
    // If only one survived, it should be the newer one
    if (totalRemaining === 1) {
      assert.equal(newLoaded.entries.size, 1, 'newer project should survive');
    }
  });

  it('contentHash is consistent', () => {
    const hash1 = contentHash('hello world');
    const hash2 = contentHash('hello world');
    const hash3 = contentHash('hello world!');
    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hash3);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });
});
