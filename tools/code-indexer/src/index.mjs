export class CodeIndex {
  constructor() {
    this.files = new Map();     // relativePath → { symbols, imports, exports, errors, language }
    this.allSymbols = [];       // flat list for search
    this._cacheStats = { cached: 0, parsed: 0, skipped: 0 };
  }

  addFile(relativePath, extracted, meta = {}) {
    const entry = {
      ...extracted,
      language: meta.language,
      errors: meta.errors ?? 0,
    };
    this.files.set(relativePath, entry);
    for (const sym of extracted.symbols) {
      this.allSymbols.push({ ...sym, file: relativePath });
    }
  }

  setCacheStats(stats) {
    this._cacheStats = { ...stats };
  }

  cacheStats() {
    return { ...this._cacheStats };
  }

  findByName(name) {
    const lower = name.toLowerCase();
    const exact = [];
    const prefix = [];
    const contains = [];

    for (const sym of this.allSymbols) {
      const symLower = sym.name.toLowerCase();
      if (symLower === lower) exact.push(sym);
      else if (symLower.startsWith(lower)) prefix.push(sym);
      else if (symLower.includes(lower)) contains.push(sym);
    }

    return [...exact, ...prefix, ...contains];
  }

  findByFile(relativePath) {
    const entry = this.files.get(relativePath);
    return entry ? entry.symbols : [];
  }

  findByKind(kind) {
    return this.allSymbols.filter(s => s.kind === kind);
  }

  findExported() {
    return this.allSymbols.filter(s => s.exported);
  }

  getFileList() {
    return [...this.files.keys()].sort();
  }

  stats() {
    let totalSymbols = 0;
    let totalErrors = 0;
    for (const [, entry] of this.files) {
      totalSymbols += entry.symbols.length;
      totalErrors += entry.errors;
    }
    return {
      files: this.files.size,
      symbols: totalSymbols,
      errors: totalErrors,
    };
  }

  toJSON() {
    const files = {};
    for (const [path, entry] of this.files) {
      files[path] = entry;
    }
    return { files, stats: this.stats(), cacheStats: this._cacheStats };
  }
}
