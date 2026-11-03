const grammarCache = new Map();

const EXTENSION_MAP = {
  '.js':  { pkg: 'tree-sitter-javascript', key: 'default', label: 'javascript' },
  '.mjs': { pkg: 'tree-sitter-javascript', key: 'default', label: 'javascript' },
  '.cjs': { pkg: 'tree-sitter-javascript', key: 'default', label: 'javascript' },
  '.jsx': { pkg: 'tree-sitter-javascript', key: 'default', label: 'javascript-jsx' },
  '.ts':  { pkg: 'tree-sitter-typescript', key: 'typescript', label: 'typescript' },
  '.tsx': { pkg: 'tree-sitter-typescript', key: 'tsx', label: 'tsx' },
};

export function supportedExtensions() {
  return Object.keys(EXTENSION_MAP);
}

export function languageLabel(ext) {
  return EXTENSION_MAP[ext]?.label ?? null;
}

export async function getGrammar(ext) {
  const entry = EXTENSION_MAP[ext];
  if (!entry) return null;

  const cacheKey = `${entry.pkg}:${entry.key}`;
  if (grammarCache.has(cacheKey)) return grammarCache.get(cacheKey);

  try {
    const mod = await import(entry.pkg);
    const grammar = entry.key === 'default' ? mod.default : mod.default[entry.key];
    grammarCache.set(cacheKey, grammar);
    return grammar;
  } catch (err) {
    console.error(`Failed to load grammar for ${ext}: ${err.message}`);
    return null;
  }
}
