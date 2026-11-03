import { it } from 'node:test';
import assert from 'node:assert/strict';
import { CodeIndex } from '../src/index.mjs';
import { formatSummary, formatFindResults } from '../src/output.mjs';

it('summary has bounded defaults and permits explicit larger limits', () => {
  const index = new CodeIndex();
  index.addFile('many.js', {
    symbols: Array.from({ length: 100 }, (_, i) => ({
      name: `function${i}`, kind: 'function', startLine: i + 1,
      endLine: i + 1, exported: true, params: [],
    })),
    imports: [],
  });

  const bounded = formatSummary(index);
  assert.match(bounded, /TRUNCATED=true SYMBOLS_SHOWN=60/);
  const expanded = formatSummary(index, { maxSymbols: 100, maxChars: 10000 });
  assert.match(expanded, /TRUNCATED=false SYMBOLS_SHOWN=100/);
});

it('summary limits the body to 6000 characters by default', () => {
  const index = new CodeIndex();
  index.addFile('many.js', {
    symbols: Array.from({ length: 60 }, (_, i) => ({
      name: `function${i}${'x'.repeat(120)}`, kind: 'function',
      startLine: i + 1, endLine: i + 1, exported: true, params: [],
    })),
    imports: [],
  });

  const output = formatSummary(index);
  assert.ok(output.split('\nTRUNCATED=')[0].length <= 6000);
  assert.match(output, /TRUNCATED=true/);
});

it('find limits matches by default and permits explicit expansion', () => {
  const results = Array.from({ length: 100 }, (_, i) => ({
    file: 'src/many.js', name: `function${i}`, startLine: i + 1,
    endLine: i + 1, kind: 'function', exported: true,
  }));
  assert.match(formatFindResults(results), /TRUNCATED=true RESULTS_SHOWN=60/);
  assert.match(formatFindResults(results, { maxResults: 100, maxChars: 12000 }), /TRUNCATED=false RESULTS_SHOWN=100/);
});

it('find limits the body to 6000 characters by default', () => {
  const results = Array.from({ length: 60 }, (_, i) => ({
    file: 'src/many.js', name: `function${i}${'x'.repeat(120)}`,
    startLine: i + 1, endLine: i + 1, kind: 'function', exported: true,
  }));
  const output = formatFindResults(results);
  assert.ok(output.split('\nTRUNCATED=')[0].length <= 6000);
  assert.match(output, /TRUNCATED=true/);
});
