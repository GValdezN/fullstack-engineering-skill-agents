function getParams(paramsNode) {
  if (!paramsNode) return [];
  const params = [];
  for (let i = 0; i < paramsNode.namedChildCount; i++) {
    const child = paramsNode.namedChild(i);
    const name = child.type === 'identifier'
      ? child.text
      : child.type === 'required_parameter' || child.type === 'optional_parameter'
        ? (child.childForFieldName('pattern')?.text ?? child.text)
        : child.type === 'rest_pattern' || child.type === 'rest_element'
          ? `...${child.namedChild(0)?.text ?? ''}`
          : child.text;
    params.push(name.split(':')[0].split('=')[0].trim());
  }
  return params;
}

function isExported(node) {
  return node.parent?.type === 'export_statement';
}

function isDefaultExport(node) {
  const p = node.parent;
  if (p?.type !== 'export_statement') return false;
  return p.children.some(c => c.type === 'default');
}

function isCapitalized(name) {
  return /^[A-Z]/.test(name);
}

function looksLikeComponent(node) {
  if (!node) return false;
  const body = node.type === 'arrow_function'
    ? node.childForFieldName('body')
    : node.type === 'function' || node.type === 'function_declaration'
      ? node.childForFieldName('body')
      : null;
  if (!body) return false;
  return containsJSX(body);
}

function containsJSX(node) {
  if (!node) return false;
  if (node.type.startsWith('jsx_')) return true;
  if (node.type === 'parenthesized_expression') {
    return containsJSX(node.namedChild(0));
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    if (containsJSX(node.namedChild(i))) return true;
  }
  return false;
}

function extractMethods(classBody) {
  const methods = [];
  if (!classBody) return methods;
  for (let i = 0; i < classBody.namedChildCount; i++) {
    const member = classBody.namedChild(i);
    if (member.type === 'method_definition' || member.type === 'public_field_definition') {
      const nameNode = member.childForFieldName('name');
      const params = member.childForFieldName('parameters');
      if (nameNode) {
        methods.push({
          name: nameNode.text,
          params: params ? getParams(params) : [],
          startLine: member.startPosition.row + 1,
          endLine: member.endPosition.row + 1,
        });
      }
    }
  }
  return methods;
}

export function extractSymbols(tree, filePath) {
  const symbols = [];
  const imports = [];
  const exports = [];
  const root = tree.rootNode;

  function visit(node) {
    switch (node.type) {
      case 'function_declaration': {
        const name = node.childForFieldName('name')?.text;
        const params = getParams(node.childForFieldName('parameters'));
        const exported = isExported(node);
        const isDefault = isDefaultExport(node);
        const kind = exported && name && isCapitalized(name) && looksLikeComponent(node) ? 'component' : 'function';
        if (name) {
          symbols.push({
            name, kind, params,
            startLine: (exported ? node.parent : node).startPosition.row + 1,
            endLine: (exported ? node.parent : node).endPosition.row + 1,
            exported, isDefault, file: filePath,
          });
        }
        break;
      }

      case 'class_declaration': {
        const name = node.childForFieldName('name')?.text;
        const body = node.childForFieldName('body');
        const exported = isExported(node);
        const isDefault = isDefaultExport(node);
        if (name) {
          symbols.push({
            name, kind: 'class',
            methods: extractMethods(body),
            startLine: (exported ? node.parent : node).startPosition.row + 1,
            endLine: (exported ? node.parent : node).endPosition.row + 1,
            exported, isDefault, file: filePath,
          });
        }
        break;
      }

      case 'lexical_declaration':
      case 'variable_declaration': {
        for (let i = 0; i < node.namedChildCount; i++) {
          const declarator = node.namedChild(i);
          if (declarator.type !== 'variable_declarator') continue;
          const nameNode = declarator.childForFieldName('name');
          const value = declarator.childForFieldName('value');
          if (!nameNode || !value) continue;

          const name = nameNode.text;
          const exported = isExported(node);
          const isDefault = isDefaultExport(node);

          if (value.type === 'arrow_function' || value.type === 'function') {
            const params = getParams(value.childForFieldName('parameters'));
            const kind = exported && isCapitalized(name) && looksLikeComponent(value) ? 'component' : 'function';
            symbols.push({
              name, kind, params,
              startLine: (exported ? node.parent : node).startPosition.row + 1,
              endLine: (exported ? node.parent : node).endPosition.row + 1,
              exported, isDefault, file: filePath,
            });
          } else if (value.type === 'class') {
            const body = value.childForFieldName('body');
            symbols.push({
              name, kind: 'class',
              methods: extractMethods(body),
              startLine: (exported ? node.parent : node).startPosition.row + 1,
              endLine: (exported ? node.parent : node).endPosition.row + 1,
              exported, isDefault, file: filePath,
            });
          }
        }
        break;
      }

      case 'import_statement': {
        const source = node.childForFieldName('source')?.text?.replace(/['"]/g, '');
        const specifiers = [];
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child.type === 'import_clause') {
            for (let j = 0; j < child.namedChildCount; j++) {
              const spec = child.namedChild(j);
              if (spec.type === 'identifier') {
                specifiers.push({ name: spec.text, isDefault: true });
              } else if (spec.type === 'named_imports') {
                for (let k = 0; k < spec.namedChildCount; k++) {
                  const imp = spec.namedChild(k);
                  if (imp.type === 'import_specifier') {
                    const imported = imp.childForFieldName('name')?.text;
                    const alias = imp.childForFieldName('alias')?.text;
                    if (imported) specifiers.push({ name: alias || imported, original: imported, isDefault: false });
                  }
                }
              } else if (spec.type === 'namespace_import') {
                const name = spec.namedChild(0)?.text;
                if (name) specifiers.push({ name, isNamespace: true });
              }
            }
          }
        }
        if (source) {
          imports.push({ source, specifiers, startLine: node.startPosition.row + 1 });
        }
        break;
      }

      case 'export_statement': {
        const decl = node.childForFieldName('declaration');
        if (!decl) {
          // re-export or named export list
          const source = node.childForFieldName('source')?.text?.replace(/['"]/g, '');
          for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child.type === 'export_clause') {
              for (let j = 0; j < child.namedChildCount; j++) {
                const spec = child.namedChild(j);
                if (spec.type === 'export_specifier') {
                  const name = spec.childForFieldName('name')?.text;
                  const alias = spec.childForFieldName('alias')?.text;
                  if (name) exports.push({ name: alias || name, original: name, source, startLine: node.startPosition.row + 1 });
                }
              }
            }
          }
        }
        // declarations inside exports are handled when visiting the child node
        break;
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      visit(node.namedChild(i));
    }
  }

  visit(root);
  return { symbols, imports, exports };
}
