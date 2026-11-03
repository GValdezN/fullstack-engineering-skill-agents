import { readFile } from 'node:fs/promises';

export async function getSnippet(filePath, startLine, endLine, options = {}) {
  const { context = 0, maxChars = 8000 } = options;

  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (err) {
    return { error: err.message, lines: [], truncated: false };
  }

  const allLines = source.split('\n');
  const from = Math.max(0, startLine - 1 - context);
  const to = Math.min(allLines.length, endLine + context);
  const selected = allLines.slice(from, to);

  let totalChars = 0;
  let truncated = false;
  const lines = [];

  for (let i = 0; i < selected.length; i++) {
    const lineText = selected[i];
    if (totalChars + lineText.length + 1 > maxChars) {
      truncated = true;
      break;
    }
    lines.push({
      number: from + i + 1,
      text: lineText,
    });
    totalChars += lineText.length + 1;
  }

  return { lines, truncated, from: from + 1, to: from + lines.length };
}
