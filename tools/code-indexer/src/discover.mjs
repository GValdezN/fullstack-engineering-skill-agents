import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import { join, relative, extname, resolve, isAbsolute, sep } from 'node:path';

const ALWAYS_SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'coverage',
  '.nyc_output', '.cache', '.turbo', '.parcel-cache', '__pycache__',
]);

const SECRET_PATTERNS = [
  /^\.env/, /\.key$/, /\.pem$/, /\.p12$/, /\.pfx$/, /\.jks$/,
  /^id_rsa/, /^id_ed25519/, /credentials/i, /secret/i,
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.node',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.wasm', '.bin', '.dat',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

function isSecretFile(name) {
  return SECRET_PATTERNS.some(p => p.test(name));
}

function parseGitignore(content) {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(pattern => {
      const negated = pattern.startsWith('!');
      const clean = negated ? pattern.slice(1) : pattern;
      const dirOnly = clean.endsWith('/');
      const base = dirOnly ? clean.slice(0, -1) : clean;
      return { pattern: base, negated, dirOnly };
    });
}

function matchesGitignorePattern(relativePath, name, isDir, rules) {
  let ignored = false;
  for (const rule of rules) {
    const target = rule.pattern.includes('/') ? relativePath : name;
    const pat = rule.pattern.replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*').replace(/\?/g, '.');
    const re = new RegExp(`^${pat}$|/${pat}$|^${pat}/`);
    if (re.test(target) || re.test(target + '/')) {
      if (rule.dirOnly && !isDir) continue;
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export async function discoverFiles(root, options = {}) {
  const resolvedRoot = resolve(root);
  const realRoot = await realpath(resolvedRoot);
  const results = [];
  const visitedDirs = new Set();

  let gitignoreRules = [];
  try {
    const gi = await readFile(join(resolvedRoot, '.gitignore'), 'utf8');
    gitignoreRules = parseGitignore(gi);
  } catch {
    // no .gitignore
  }

  async function walk(dir) {
    const realDir = await realpath(dir);
    if (visitedDirs.has(realDir)) return;
    visitedDirs.add(realDir);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(resolvedRoot, fullPath).replace(/\\/g, '/');

      if (entry.isSymbolicLink()) {
        try {
          const realTarget = await realpath(fullPath);
          const targetRelative = relative(realRoot, realTarget);
          if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) continue;
        } catch {
          continue;
        }
      }

      if (entry.isDirectory() || (entry.isSymbolicLink())) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        if (matchesGitignorePattern(relPath, entry.name, true, gitignoreRules)) continue;

        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) await walk(fullPath);
        } catch {
          // skip inaccessible dirs
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;
      if (isSecretFile(entry.name)) continue;
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      if (matchesGitignorePattern(relPath, entry.name, false, gitignoreRules)) continue;

      try {
        const s = await stat(fullPath);
        if (s.size > MAX_FILE_SIZE) continue;
        if (s.size === 0 && !options.includeEmpty) continue;

        results.push({
          path: fullPath,
          relativePath: relPath,
          extension: ext,
          size: s.size,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  await walk(resolvedRoot);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}
