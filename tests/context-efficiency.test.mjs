import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const SKILL_MAX_KB = 8;
const REFERENCE_MAX_KB = 25;
const MAX_FORWARD_REF_DEPTH = 5;

describe('Context efficiency constraints', () => {
  describe('SKILL.md size', () => {
    it(`should be under ${SKILL_MAX_KB} KB`, async () => {
      const st = await stat(join(ROOT, 'SKILL.md'));
      const kb = st.size / 1024;
      assert.ok(kb < SKILL_MAX_KB, `SKILL.md is ${kb.toFixed(1)} KB, should be under ${SKILL_MAX_KB} KB`);
    });
  });

  describe('Reference file sizes', () => {
    it(`each reference should be under ${REFERENCE_MAX_KB} KB`, async () => {
      const refDir = join(ROOT, 'references');
      const entries = await readdir(refDir);
      const mdFiles = entries.filter(f => f.endsWith('.md'));

      const violations = [];
      for (const file of mdFiles) {
        const st = await stat(join(refDir, file));
        const kb = st.size / 1024;
        if (kb >= REFERENCE_MAX_KB) {
          violations.push(`${file}: ${kb.toFixed(1)} KB`);
        }
      }

      assert.equal(violations.length, 0, `Files over ${REFERENCE_MAX_KB} KB:\n  ${violations.join('\n  ')}`);
    });
  });

  describe('Link integrity', () => {
    it('all markdown links in SKILL.md resolve to existing files', async () => {
      const content = await readFile(join(ROOT, 'SKILL.md'), 'utf8');
      // Match [text](path) links, excluding http(s) URLs
      const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
      const broken = [];

      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        // Skip external URLs and anchors
        if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) continue;
        // Remove anchors from local links
        const filePath = target.split('#')[0];
        if (!filePath) continue;

        const fullPath = resolve(ROOT, filePath);
        try {
          await stat(fullPath);
        } catch {
          broken.push(`[${match[1]}](${target})`);
        }
      }

      assert.equal(broken.length, 0, `Broken links in SKILL.md:\n  ${broken.join('\n  ')}`);
    });

    it('all markdown links in references resolve to existing files', async () => {
      const refDir = join(ROOT, 'references');
      const entries = await readdir(refDir);
      const mdFiles = entries.filter(f => f.endsWith('.md'));

      const broken = [];
      for (const file of mdFiles) {
        const content = await readFile(join(refDir, file), 'utf8');
        const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkPattern.exec(content)) !== null) {
          const target = match[2];
          if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) continue;
          const filePath = target.split('#')[0];
          if (!filePath) continue;

          const fullPath = resolve(refDir, filePath);
          try {
            await stat(fullPath);
          } catch {
            broken.push(`${file}: [${match[1]}](${target})`);
          }
        }
      }

      assert.equal(broken.length, 0, `Broken links in references:\n  ${broken.join('\n  ')}`);
    });
  });

  describe('Reference chain depth', () => {
    it(`no reference has more than ${MAX_FORWARD_REF_DEPTH} levels of forward references`, async () => {
      const refDir = join(ROOT, 'references');
      const entries = await readdir(refDir);
      const mdFiles = entries.filter(f => f.endsWith('.md'));

      // Build adjacency map: file → set of referenced .md files in same dir
      const graph = new Map();
      for (const file of mdFiles) {
        const content = await readFile(join(refDir, file), 'utf8');
        const refs = new Set();
        const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkPattern.exec(content)) !== null) {
          const target = match[2].split('#')[0];
          if (target.startsWith('http://') || target.startsWith('https://')) continue;
          // Only count .md files in references/
          const base = target.replace(/^\.\//, '');
          if (mdFiles.includes(base)) {
            refs.add(base);
          }
        }
        graph.set(file, refs);
      }

      // DFS longest acyclic chain from each file
      function longestChain(node, visited) {
        const refs = graph.get(node) || new Set();
        let max = 0;
        for (const ref of refs) {
          if (!visited.has(ref)) {
            visited.add(ref);
            max = Math.max(max, 1 + longestChain(ref, visited));
            visited.delete(ref);
          }
        }
        return max;
      }

      const violations = [];
      for (const start of mdFiles) {
        const depth = longestChain(start, new Set([start]));
        if (depth > MAX_FORWARD_REF_DEPTH) {
          violations.push(`${start}: longest chain = ${depth} (max ${MAX_FORWARD_REF_DEPTH})`);
        }
      }

      assert.equal(violations.length, 0, `Deep reference chains:\n  ${violations.join('\n  ')}`);
    });
  });
});
