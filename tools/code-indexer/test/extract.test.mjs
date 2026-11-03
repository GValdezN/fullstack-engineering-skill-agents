import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/parse.mjs';
import { extractSymbols } from '../src/extract.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

async function extractFrom(relPath, ext) {
  const fullPath = join(FIXTURES, relPath);
  const { tree } = await parseFile(fullPath, ext);
  assert.ok(tree, `should parse ${relPath}`);
  return extractSymbols(tree, relPath);
}

describe('extractSymbols', () => {
  describe('JavaScript', () => {
    it('extracts exported functions', async () => {
      const { symbols } = await extractFrom('sample-project/src/utils/helpers.js', '.js');
      const fn = symbols.find(s => s.name === 'formatCurrency');
      assert.ok(fn, 'should find formatCurrency');
      assert.equal(fn.kind, 'function');
      assert.equal(fn.exported, true);
      assert.deepEqual(fn.params, ['amount', 'currency']);
    });

    it('extracts arrow functions', async () => {
      const { symbols } = await extractFrom('sample-project/src/utils/helpers.js', '.js');
      const fn = symbols.find(s => s.name === 'clamp');
      assert.ok(fn, 'should find clamp');
      assert.equal(fn.kind, 'function');
      assert.equal(fn.exported, true);
    });

    it('extracts classes with methods', async () => {
      const { symbols } = await extractFrom('sample-project/src/utils/helpers.js', '.js');
      const cls = symbols.find(s => s.name === 'Decimal');
      assert.ok(cls, 'should find Decimal class');
      assert.equal(cls.kind, 'class');
      assert.equal(cls.exported, true);
      assert.ok(cls.methods.length >= 2, 'should have methods');
      assert.ok(cls.methods.some(m => m.name === 'add'), 'should have add method');
    });

    it('identifies local (non-exported) functions', async () => {
      const { symbols } = await extractFrom('sample-project/src/utils/helpers.js', '.js');
      const fn = symbols.find(s => s.name === 'internalHelper');
      assert.ok(fn, 'should find internalHelper');
      assert.equal(fn.exported, false);
    });
  });

  describe('TypeScript', () => {
    it('extracts typed functions', async () => {
      const { symbols } = await extractFrom('sample-project/src/services/pricing.ts', '.ts');
      const fn = symbols.find(s => s.name === 'calculatePrice');
      assert.ok(fn, 'should find calculatePrice');
      assert.equal(fn.exported, true);
      assert.deepEqual(fn.params, ['cost', 'margin']);
    });

    it('extracts classes', async () => {
      const { symbols } = await extractFrom('sample-project/src/services/pricing.ts', '.ts');
      const cls = symbols.find(s => s.name === 'PricingService');
      assert.ok(cls, 'should find PricingService');
      assert.equal(cls.kind, 'class');
      assert.ok(cls.methods.some(m => m.name === 'getPrice'));
      assert.ok(cls.methods.some(m => m.name === 'clearCache'));
    });

    it('extracts imports', async () => {
      const { imports } = await extractFrom('sample-project/src/services/pricing.ts', '.ts');
      assert.ok(imports.length > 0, 'should have imports');
      const decimalImport = imports.find(i => i.source.includes('helpers'));
      assert.ok(decimalImport, 'should import from helpers');
    });
  });

  describe('TSX', () => {
    it('identifies React components', async () => {
      const { symbols } = await extractFrom('sample-project/src/components/ProductForm.tsx', '.tsx');
      const comp = symbols.find(s => s.name === 'ProductForm');
      assert.ok(comp, 'should find ProductForm');
      assert.equal(comp.kind, 'component', 'should be identified as a component');
      assert.equal(comp.exported, true);
    });

    it('identifies arrow function components', async () => {
      const { symbols } = await extractFrom('sample-project/src/components/ProductForm.tsx', '.tsx');
      const comp = symbols.find(s => s.name === 'ProductCard');
      assert.ok(comp, 'should find ProductCard');
      assert.equal(comp.kind, 'component');
      assert.equal(comp.exported, true);
    });

    it('distinguishes local handlers from components', async () => {
      const { symbols } = await extractFrom('sample-project/src/components/ProductForm.tsx', '.tsx');
      const handler = symbols.find(s => s.name === 'handleSubmit');
      assert.ok(handler, 'should find handleSubmit');
      assert.equal(handler.kind, 'function', 'should not be a component');
      assert.equal(handler.exported, false);
    });
  });

  describe('Edge cases', () => {
    it('handles files with syntax errors', async () => {
      const { symbols } = await extractFrom('edge-cases/syntax-error.ts', '.ts');
      // should extract what it can from a partially broken file
      assert.ok(symbols.length > 0, 'should extract some symbols even with errors');
    });

    it('handles unicode identifiers', async () => {
      const { symbols } = await extractFrom('edge-cases/unicode-names.mjs', '.mjs');
      assert.ok(symbols.some(s => s.name === 'calcularPrecio'), 'should find Spanish names');
      assert.ok(symbols.some(s => s.name === 'Ñandú'), 'should handle Ñ');
    });

    it('handles re-exports', async () => {
      const { exports } = await extractFrom('sample-project/src/index.ts', '.ts');
      assert.ok(exports.length > 0, 'should find re-exports');
      assert.ok(exports.some(e => e.name === 'calculatePrice'), 'should re-export calculatePrice');
    });
  });
});
