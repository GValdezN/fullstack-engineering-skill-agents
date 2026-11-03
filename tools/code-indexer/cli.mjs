#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { discoverFiles } from './src/discover.mjs';
import { parseFile } from './src/parse.mjs';
import { extractSymbols } from './src/extract.mjs';
import { CodeIndex } from './src/index.mjs';
import { getSnippet } from './src/snippets.mjs';
import {
  contentHash, loadProjectCache, saveProjectCache,
  clearAllCaches, enforceSizeLimit,
} from './src/cache.mjs';
import { formatSummary, formatJSON, formatFindResults } from './src/output.mjs';

function usage() {
  console.log(`code-indexer — AST-based code structure indexer

Commands:
  scan         Scan a project and output its structure
  find         Search for a symbol by name
  symbol       Show a specific symbol with source context
  cache-clear  Remove all cached indices

Options (scan):
  --root <path>           Project root (required)
  --format summary|json   Output format (default: summary)
  --max-symbols <n>       Limit symbols in summary
  --max-chars <n>         Limit total output characters
  --no-cache              Skip cache entirely
  --cache-max-size <mb>   Max cache size in MB (default: 50)
  --output <file>         Write output to file instead of stdout

Options (find):
  --root <path>           Project root (required)
  --name <symbol>         Symbol name to search for (required)

Options (symbol):
  --root <path>           Project root (required)
  --file <relative-path>  File containing the symbol (required)
  --name <symbol>         Symbol name (required)
  --context <n>           Lines of context around the symbol (default: 3)

Examples:
  node cli.mjs scan --root ./my-project --format summary
  node cli.mjs find --root ./my-project --name calculatePrice
  node cli.mjs symbol --root ./my-project --file src/services/pricing.ts --name calculatePrice
`);
}

async function buildIndex(root, options = {}) {
  const { useCache = true, cacheMaxSize } = options;
  const files = await discoverFiles(root);
  const index = new CodeIndex();

  let cached = 0;
  let parsed = 0;
  let skipped = 0;

  let projectCache = null;
  if (useCache) {
    projectCache = await loadProjectCache(root);
    if (projectCache.stale) {
      // version changed — discard, re-parse everything
      projectCache.entries = new Map();
    }
  }

  const discoveredPaths = new Set(files.map(f => f.relativePath));
  const newEntries = new Map();

  for (const file of files) {
    // Check incremental cache
    if (useCache && projectCache) {
      const cachedEntry = projectCache.entries.get(file.relativePath);
      if (cachedEntry) {
        let currentContent;
        try {
          currentContent = await readFile(file.path, 'utf8');
        } catch {
          skipped++;
          continue;
        }
        const currentHash = contentHash(currentContent);
        if (cachedEntry.hash === currentHash) {
          // Cache hit
          index.addFile(file.relativePath, cachedEntry.data, {
            language: cachedEntry.data._language,
            errors: cachedEntry.data._errors,
          });
          newEntries.set(file.relativePath, { hash: currentHash, data: cachedEntry.data });
          cached++;
          continue;
        }
      }
    }

    // Parse the file
    const { tree, errors, language, source } = await parseFile(file.path, file.extension);
    if (!tree) {
      skipped++;
      continue;
    }

    const extracted = extractSymbols(tree, file.relativePath);
    index.addFile(file.relativePath, extracted, { language, errors });

    if (useCache && source) {
      const hash = contentHash(source);
      const cacheData = { ...extracted, _language: language, _errors: errors };
      newEntries.set(file.relativePath, { hash, data: cacheData });
    }

    parsed++;
  }

  // Persist the updated cache (only files that still exist on disk)
  if (useCache && newEntries.size > 0) {
    try {
      await saveProjectCache(root, newEntries);
      if (cacheMaxSize != null) {
        await enforceSizeLimit(cacheMaxSize * 1024 * 1024);
      } else {
        await enforceSizeLimit();
      }
    } catch {
      // cache save failure is non-fatal
    }
  }

  index.setCacheStats({ cached, parsed, skipped });
  return index;
}

async function cmdScan(args) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      format: { type: 'string', default: 'summary' },
      'max-symbols': { type: 'string' },
      'max-chars': { type: 'string' },
      'no-cache': { type: 'boolean', default: false },
      'cache-max-size': { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  });

  if (!values.root) {
    console.error('Error: --root is required');
    process.exit(1);
  }

  const root = resolve(values.root);
  const useCache = !values['no-cache'];
  const cacheMaxSize = values['cache-max-size'] ? Number(values['cache-max-size']) : undefined;
  const index = await buildIndex(root, { useCache, cacheMaxSize });

  let result;
  if (values.format === 'json') {
    result = formatJSON(index);
  } else {
    result = formatSummary(index, {
      maxSymbols: values['max-symbols'] ? Number(values['max-symbols']) : undefined,
      maxChars: values['max-chars'] ? Number(values['max-chars']) : undefined,
    });
  }

  if (values.output) {
    await writeFile(values.output, result, 'utf8');
    console.log(`Output written to ${values.output}`);
  } else {
    console.log(result);
  }
}

async function cmdFind(args) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      name: { type: 'string' },
    },
    strict: true,
  });

  if (!values.root || !values.name) {
    console.error('Error: --root and --name are required');
    process.exit(1);
  }

  const root = resolve(values.root);
  const index = await buildIndex(root);
  const results = index.findByName(values.name);
  console.log(formatFindResults(results));
}

async function cmdSymbol(args) {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      file: { type: 'string' },
      name: { type: 'string' },
      context: { type: 'string', default: '3' },
    },
    strict: true,
  });

  if (!values.root || !values.file || !values.name) {
    console.error('Error: --root, --file, and --name are required');
    process.exit(1);
  }

  const root = resolve(values.root);
  const index = await buildIndex(root);
  const fileSymbols = index.findByFile(values.file);
  const match = fileSymbols.find(s => s.name === values.name);

  if (!match) {
    console.error(`Symbol '${values.name}' not found in ${values.file}`);
    const similar = index.findByName(values.name);
    if (similar.length) {
      console.error(`\nDid you mean one of these?`);
      for (const s of similar.slice(0, 5)) {
        console.error(`  ${s.file}  ${s.name}  L${s.startLine}–${s.endLine}`);
      }
    }
    process.exit(1);
  }

  const fullPath = resolve(root, values.file);
  const snippet = await getSnippet(fullPath, match.startLine, match.endLine, {
    context: Number(values.context),
  });

  console.log(`${values.file}  ${match.name}  ${match.kind}  L${match.startLine}–${match.endLine}  ${match.exported ? 'exported' : 'local'}`);
  if (match.params) console.log(`Params: ${match.params.join(', ') || '(none)'}`);
  if (match.methods) console.log(`Methods: ${match.methods.map(m => m.name).join(', ')}`);
  console.log('---');

  if (snippet.error) {
    console.error(`Error reading source: ${snippet.error}`);
  } else {
    for (const line of snippet.lines) {
      const marker = (line.number >= match.startLine && line.number <= match.endLine) ? '>' : ' ';
      console.log(`${marker} ${String(line.number).padStart(4)} | ${line.text}`);
    }
    if (snippet.truncated) console.log('... (truncated)');
  }
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'scan':  await cmdScan(rest); break;
  case 'find':  await cmdFind(rest); break;
  case 'symbol': await cmdSymbol(rest); break;
  case 'cache-clear':
    await clearAllCaches();
    console.log('Cache cleared.');
    break;
  case '--help': case '-h': case undefined:
    usage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}
