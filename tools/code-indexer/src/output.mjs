export function formatSummary(index, options = {}) {
  const { maxSymbols = 60, maxChars = 6000 } = options;
  const stats = index.stats();
  const cs = index.cacheStats();
  const lines = [];
  let symbolCount = 0;
  let truncated = false;

  lines.push(`INDEX files=${stats.files} symbols=${stats.symbols} errors=${stats.errors}`);

  for (const filePath of index.getFileList()) {
    const entry = index.files.get(filePath);
    if (!entry.symbols.length && !entry.imports.length) continue;

    const fileHeader = filePath;
    lines.push(fileHeader);

    for (const sym of entry.symbols) {
      if (symbolCount >= maxSymbols) { truncated = true; break; }

      const range = `L${sym.startLine}–${sym.endLine}`;
      const exp = sym.exported ? (sym.isDefault ? 'default' : 'exported') : 'local';
      let line;

      if (sym.kind === 'class') {
        const methodNames = sym.methods?.map(m => m.name).join(', ') || '';
        line = `  ${sym.name}  ${range}  ${exp}  class{${methodNames}}`;
      } else {
        const params = sym.params?.join(',') || '';
        line = `  ${sym.name}(${params})  ${range}  ${exp}`;
        if (sym.kind === 'component') line += '  component';
      }

      lines.push(line);
      symbolCount++;
    }

    if (truncated) break;
  }

  let result = lines.join('\n');

  if (result.length > maxChars) {
    result = result.slice(0, maxChars);
    truncated = true;
  }

  result += `\nTRUNCATED=${truncated} SYMBOLS_SHOWN=${symbolCount}`;
  if (cs.cached || cs.parsed || cs.skipped) {
    result += ` CACHED=${cs.cached} PARSED=${cs.parsed} SKIPPED=${cs.skipped}`;
  }
  return result;
}

export function formatJSON(index) {
  return JSON.stringify(index.toJSON(), null, 2);
}

export function formatFindResults(results, options = {}) {
  if (!results.length) return 'No symbols found.';

  const { maxResults = 60, maxChars = 6000 } = options;
  const lines = [`Found ${results.length} symbol(s):\n`];
  let shown = 0;
  for (const sym of results) {
    if (shown >= maxResults) break;
    const range = `L${sym.startLine}–${sym.endLine}`;
    const exp = sym.exported ? 'exported' : 'local';
    const params = sym.params ? `(${sym.params.join(', ')})` : '';
    const line = `  ${sym.file}  ${sym.name}${params}  ${range}  ${sym.kind}  ${exp}`;
    if (lines.join('\n').length + 1 + line.length > maxChars) break;
    lines.push(line);
    shown++;
  }
  lines.push(`TRUNCATED=${shown < results.length} RESULTS_SHOWN=${shown}`);
  return lines.join('\n');
}
