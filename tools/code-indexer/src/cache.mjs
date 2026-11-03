import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CACHE_DIR = join(tmpdir(), 'code-indexer-cache');
const CACHE_VERSION = '1';

function contentHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function cacheKey(filePath, hash) {
  const pathHash = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  return `${CACHE_VERSION}_${pathHash}_${hash.slice(0, 16)}`;
}

async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // already exists
  }
}

export async function getCached(filePath, fileContent) {
  try {
    const hash = contentHash(fileContent);
    const key = cacheKey(filePath, hash);
    const cachePath = join(CACHE_DIR, `${key}.json`);
    const data = await readFile(cachePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function setCache(filePath, fileContent, extracted) {
  try {
    await ensureCacheDir();
    const hash = contentHash(fileContent);
    const key = cacheKey(filePath, hash);
    const cachePath = join(CACHE_DIR, `${key}.json`);
    await writeFile(cachePath, JSON.stringify(extracted), 'utf8');
  } catch {
    // cache write failure is non-fatal
  }
}

export async function clearCache() {
  try {
    const entries = await readdir(CACHE_DIR);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        await unlink(join(CACHE_DIR, entry)).catch(() => {});
      }
    }
  } catch {
    // nothing to clear
  }
}

export function getCacheDir() {
  return CACHE_DIR;
}
