import { readFile, writeFile, mkdir, readdir, unlink, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CACHE_BASE = join(tmpdir(), 'code-indexer-cache');
const INDEX_VERSION = '2';
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function projectDir(rootPath) {
  return join(CACHE_BASE, sha256(rootPath).slice(0, 24));
}

function manifestPath(dir) {
  return join(dir, '_manifest.json');
}

function entryFilename(relativePath) {
  return sha256(relativePath).slice(0, 24) + '.json';
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

function readManifest(dir) {
  return readFile(manifestPath(dir), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
}

async function writeManifest(dir, manifest) {
  await writeFile(manifestPath(dir), JSON.stringify(manifest), 'utf8');
}

export function contentHash(content) {
  return sha256(content);
}

export function getCacheDir() {
  return CACHE_BASE;
}

export function getIndexVersion() {
  return INDEX_VERSION;
}

/**
 * Load the persistent per-project index.
 * Returns { manifest, entries } where entries maps relativePath → cached extraction data.
 * If the version mismatches or no cache exists, returns an empty state.
 */
export async function loadProjectCache(rootPath) {
  const dir = projectDir(rootPath);
  const manifest = await readManifest(dir);

  if (!manifest || manifest.version !== INDEX_VERSION) {
    return { dir, manifest: null, entries: new Map(), stale: !!manifest };
  }

  const entries = new Map();
  for (const [relPath, meta] of Object.entries(manifest.files)) {
    try {
      const data = JSON.parse(await readFile(join(dir, meta.cacheFile), 'utf8'));
      entries.set(relPath, { hash: meta.hash, data });
    } catch {
      // corrupted entry, skip — will be re-parsed
    }
  }

  return { dir, manifest, entries, stale: false };
}

/**
 * Save the full project cache atomically: manifest + one file per source file.
 */
export async function saveProjectCache(rootPath, fileEntries, opts = {}) {
  const dir = projectDir(rootPath);
  await ensureDir(dir);

  const filesRecord = {};
  for (const [relPath, { hash, data }] of fileEntries) {
    const fname = entryFilename(relPath);
    filesRecord[relPath] = { hash, cacheFile: fname };
    await writeFile(join(dir, fname), JSON.stringify(data), 'utf8');
  }

  const manifest = {
    version: INDEX_VERSION,
    rootPath,
    updatedAt: new Date().toISOString(),
    files: filesRecord,
  };
  await writeManifest(dir, manifest);
}

/**
 * Remove a project's entire cache.
 */
export async function clearProjectCache(rootPath) {
  const dir = projectDir(rootPath);
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // already gone
  }
}

/**
 * Remove all cached projects.
 */
export async function clearAllCaches() {
  try {
    await rm(CACHE_BASE, { recursive: true, force: true });
  } catch {
    // nothing to clear
  }
}

/**
 * Enforce a total size limit on the cache directory.
 * Evicts entire project directories (oldest updatedAt first) until under maxBytes.
 */
export async function enforceSizeLimit(maxBytes = DEFAULT_MAX_BYTES) {
  let entries;
  try {
    entries = await readdir(CACHE_BASE, { withFileTypes: true });
  } catch {
    return;
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(CACHE_BASE, entry.name);
    const manifest = await readManifest(dir);
    let size = 0;
    try {
      const files = await readdir(dir);
      for (const f of files) {
        const s = await stat(join(dir, f));
        size += s.size;
      }
    } catch {
      continue;
    }
    projects.push({
      name: entry.name,
      dir,
      size,
      updatedAt: manifest?.updatedAt ?? '1970-01-01',
    });
  }

  const totalSize = projects.reduce((sum, p) => sum + p.size, 0);
  if (totalSize <= maxBytes) return;

  projects.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  let freed = 0;
  const target = totalSize - maxBytes;
  for (const proj of projects) {
    if (freed >= target) break;
    try {
      await rm(proj.dir, { recursive: true, force: true });
      freed += proj.size;
    } catch {
      // best effort
    }
  }
}
