import Parser from 'tree-sitter';
import { readFile } from 'node:fs/promises';
import { getGrammar } from './grammars.mjs';

const parserInstance = new Parser();

function countErrors(node) {
  let errors = 0;
  if (node.type === 'ERROR' || node.isMissing) errors++;
  for (let i = 0; i < node.childCount; i++) {
    errors += countErrors(node.child(i));
  }
  return errors;
}

export async function parseFile(filePath, ext) {
  const grammar = await getGrammar(ext);
  if (!grammar) return { tree: null, errors: 0, language: null, error: `No grammar for ${ext}` };

  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (err) {
    return { tree: null, errors: 0, language: null, error: err.message };
  }

  try {
    parserInstance.setLanguage(grammar);
    const tree = parserInstance.parse(source);
    const errors = countErrors(tree.rootNode);
    return { tree, errors, language: grammar.name || ext, error: null, source };
  } catch (err) {
    return { tree: null, errors: 0, language: null, error: err.message };
  }
}
