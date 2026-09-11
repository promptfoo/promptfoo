import { type Node, parseSync, Visitor } from 'oxc-parser';

export function getRuntimeModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const { program, errors } = parseSync(filePath, sourceText);
  if (errors.length > 0) {
    throw new Error(`Cannot parse ${filePath}: ${errors[0].message}`);
  }
  const specifiers: string[] = [];
  function addStaticLoad(source: Node | undefined, hasExtraArguments = false): void {
    if (hasExtraArguments || source?.type !== 'Literal' || typeof source.value !== 'string') {
      throw new Error('Runtime loads must use one static string specifier');
    }
    specifiers.push(source.value);
  }
  new Visitor({
    ImportDeclaration(node) {
      if (node.importKind === 'type') {
        return;
      }
      if (
        node.specifiers.length === 0 ||
        node.specifiers.some(
          (specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type',
        )
      ) {
        specifiers.push(node.source.value);
      }
    },
    ExportNamedDeclaration(node) {
      if (
        node.exportKind !== 'type' &&
        node.source &&
        (node.specifiers.length === 0 ||
          node.specifiers.some((specifier) => specifier.exportKind !== 'type'))
      ) {
        specifiers.push(node.source.value);
      }
    },
    ExportAllDeclaration(node) {
      if (node.exportKind !== 'type') {
        specifiers.push(node.source.value);
      }
    },
    ImportExpression(node) {
      addStaticLoad(node.source, node.options != null);
    },
    TSImportEqualsDeclaration(node) {
      if (node.importKind !== 'type' && node.moduleReference.type === 'TSExternalModuleReference') {
        specifiers.push(node.moduleReference.expression.value);
      }
    },
    CallExpression(node) {
      const callee = node.callee;
      if (
        (callee.type === 'Identifier' && callee.name === 'require') ||
        (callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.property.type === 'Identifier' &&
          ((callee.object.name === 'require' && callee.property.name === 'resolve') ||
            (callee.object.name === 'module' && callee.property.name === 'require')))
      ) {
        addStaticLoad(node.arguments[0], node.arguments.length !== 1);
      }
    },
  }).visit(program);
  return [...new Set(specifiers)];
}
