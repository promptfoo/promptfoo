import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { normalizePath, resolveInternalModule } from '../../scripts/architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entryPoint = 'src/assertions/pure.ts';
const builtinModuleNames = new Set(
  builtinModules.flatMap((moduleName) => {
    const normalized = moduleName.replace(/^node:/, '').split('/')[0];
    return [moduleName, normalized];
  }),
);

interface RuntimeImportViolation {
  importer: string;
  specifier: string;
  kind: string;
  resolvedImport?: string;
}

function importDeclarationRunsAtRuntime(node: ts.ImportDeclaration): boolean {
  const importClause = node.importClause;
  if (!importClause) {
    return true;
  }
  if (importClause.isTypeOnly) {
    return false;
  }
  if (importClause.name) {
    return true;
  }
  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return false;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    return true;
  }
  const elements = namedBindings.elements;
  return elements.length === 0 || elements.some((element) => !element.isTypeOnly);
}

function exportDeclarationRunsAtRuntime(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return false;
  }
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
    return true;
  }
  return (
    node.exportClause.elements.length === 0 ||
    node.exportClause.elements.some((element) => !element.isTypeOnly)
  );
}

function getRuntimeModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function addCallSpecifier(node: ts.CallExpression): void {
    const expression = node.expression;
    const isRuntimeLoad =
      expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(expression) && expression.text === 'require') ||
      (ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        ((expression.expression.text === 'require' && expression.name.text === 'resolve') ||
          (expression.expression.text === 'module' && expression.name.text === 'require')));
    if (!isRuntimeLoad) {
      return;
    }
    if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) {
      throw new Error('Pure boundary runtime loads must use one static string specifier');
    }
    specifiers.push(node.arguments[0].text);
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      importDeclarationRunsAtRuntime(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      exportDeclarationRunsAtRuntime(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      addCallSpecifier(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(specifiers)];
}

function getExternalModuleName(specifier: string): string {
  const normalized = specifier.replace(/^node:/, '');
  const segments = normalized.split('/');
  return normalized.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function getForbiddenInternalKind(relativePath: string): string | undefined {
  const forbiddenSegments: Array<[string, RegExp]> = [
    ['providers', /(^|\/)providers(\/|\.ts$)/],
    ['redteam', /(^|\/)redteam(\/|\.ts$)/],
    ['tracing', /(^|\/)tracing(\/|\.ts$)/],
    ['python', /(^|\/)python(\/|\.ts$)/],
    ['ruby', /(^|\/)ruby(\/|\.ts$)/],
    ['node adapter', /^src\/node\//],
  ];

  return forbiddenSegments.find(([, pattern]) => pattern.test(relativePath))?.[0];
}

function scanRuntimeImportGraph(): {
  files: string[];
  violations: RuntimeImportViolation[];
} {
  const pending = [entryPoint];
  const visited = new Set<string>();
  const violations: RuntimeImportViolation[] = [];

  while (pending.length > 0) {
    const importer = pending.pop()!;
    if (visited.has(importer)) {
      continue;
    }
    visited.add(importer);

    const sourceText = fs.readFileSync(path.join(repoRoot, importer), 'utf8');
    for (const specifier of getRuntimeModuleSpecifiers(sourceText, importer)) {
      const resolvedImport = resolveInternalModule(repoRoot, importer, specifier);
      if (resolvedImport) {
        const normalizedImport = normalizePath(resolvedImport);
        const forbiddenKind = getForbiddenInternalKind(normalizedImport);
        if (forbiddenKind) {
          violations.push({
            importer,
            specifier,
            kind: forbiddenKind,
            resolvedImport: normalizedImport,
          });
        }
        pending.push(normalizedImport);
        continue;
      }

      if (specifier.startsWith('.') || specifier === 'src' || specifier.startsWith('src/')) {
        violations.push({ importer, specifier, kind: 'unresolved internal import' });
        continue;
      }

      const externalModuleName = getExternalModuleName(specifier);
      violations.push({
        importer,
        specifier,
        kind: builtinModuleNames.has(externalModuleName) ? 'Node builtin' : 'external package',
      });
    }
  }

  return {
    files: [...visited].sort(),
    violations,
  };
}

describe('pure assertion registry runtime boundary', () => {
  it('recursively stays independent from host-only runtime dependencies', () => {
    const { files, violations } = scanRuntimeImportGraph();

    expect(files).toEqual(
      expect.arrayContaining([
        entryPoint,
        'src/assertions/packs/pure.ts',
        'src/assertions/equals.ts',
        'src/util/invariant.ts',
      ]),
    );
    expect(violations).toEqual([]);
  });

  it.each([
    'import(name)',
    "import('./module', { with: { type: 'json' } })",
    'module.require(name)',
  ])('fails closed for unsupported runtime load: %s', (source) => {
    expect(() => getRuntimeModuleSpecifiers(source, 'fixture.ts')).toThrow(
      'Pure boundary runtime loads must use one static string specifier',
    );
  });
});
