import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getCached, setCache, clearCache } from '../src/cache.mjs';

describe('cache', () => {
  afterEach(async () => {
    await clearCache();
  });

  it('returns null for uncached entries', async () => {
    const result = await getCached('/fake/path.ts', 'const x = 1;');
    assert.equal(result, null);
  });

  it('stores and retrieves cached data', async () => {
    const data = { symbols: [{ name: 'test', kind: 'function' }], imports: [], exports: [] };
    const content = 'function test() {}';

    await setCache('/test/file.ts', content, data);
    const cached = await getCached('/test/file.ts', content);

    assert.ok(cached, 'should return cached data');
    assert.deepEqual(cached.symbols, data.symbols);
  });

  it('invalidates when content changes', async () => {
    const data = { symbols: [{ name: 'test', kind: 'function' }], imports: [], exports: [] };

    await setCache('/test/file.ts', 'version 1', data);
    const cached = await getCached('/test/file.ts', 'version 2');

    assert.equal(cached, null, 'should not return stale cache');
  });

  it('clearCache removes entries', async () => {
    const data = { symbols: [], imports: [], exports: [] };
    await setCache('/test/file.ts', 'content', data);
    await clearCache();
    const cached = await getCached('/test/file.ts', 'content');
    assert.equal(cached, null);
  });
});
