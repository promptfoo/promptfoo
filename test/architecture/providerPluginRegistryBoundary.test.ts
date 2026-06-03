import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  extractModuleSpecifiers,
  normalizePath,
  resolveInternalModule,
} from '../../scripts/architectureUtils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const providerPluginEntryPoint = 'src/provider-plugin.ts';

const providerPluginContractFiles = ['src/providers/registryTypes.ts'];
const providerPluginFamilyFiles = [
  'src/providers/families/aws.ts',
  'src/providers/families/google.ts',
  'src/redteam/providers/registry.ts',
];

function getRuntimeModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const runsAtRuntime =
        clause == null ||
        (!clause.isTypeOnly &&
          (clause.name != null ||
            namedBindings == null ||
            ts.isNamespaceImport(namedBindings) ||
            namedBindings.elements.some((element) => !element.isTypeOnly)));
      if (runsAtRuntime) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const runsAtRuntime =
        !node.isTypeOnly &&
        (!node.exportClause ||
          ts.isNamespaceExport(node.exportClause) ||
          node.exportClause.elements.some((element) => !element.isTypeOnly));
      if (runsAtRuntime) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...new Set(specifiers)];
}

function scanPublicRuntimeGraph(): { files: string[]; violations: string[] } {
  const pending = [providerPluginEntryPoint];
  const visited = new Set<string>();
  const violations: string[] = [];

  while (pending.length > 0) {
    const importer = pending.pop()!;
    if (visited.has(importer)) {
      continue;
    }
    visited.add(importer);

    const source = readFileSync(path.join(repoRoot, importer), 'utf8');
    for (const specifier of getRuntimeModuleSpecifiers(source, importer)) {
      const resolved = resolveInternalModule(repoRoot, importer, specifier);
      if (!resolved) {
        violations.push(`${importer} -> ${specifier}`);
        continue;
      }

      const normalized = normalizePath(resolved);
      if (
        normalized === 'src/index.ts' ||
        normalized === 'src/providers/registry.ts' ||
        normalized === 'src/providers/builtinProviderPlugins.ts' ||
        normalized.startsWith('src/commands/') ||
        normalized.startsWith('src/server/') ||
        normalized.startsWith('src/redteam/')
      ) {
        violations.push(`${importer} -> ${normalized}`);
      }
      pending.push(normalized);
    }
  }

  return { files: [...visited].sort(), violations };
}

describe('provider plugin package boundary', () => {
  it.each(providerPluginContractFiles)('%s has no runtime imports', (relativePath) => {
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const runtimeImports = getRuntimeModuleSpecifiers(source, relativePath);

    expect(runtimeImports).toEqual([]);
  });

  it('keeps the public provider-plugin runtime package-neutral', () => {
    const { files, violations } = scanPublicRuntimeGraph();

    expect(files).toEqual(
      expect.arrayContaining([
        providerPluginEntryPoint,
        'src/providers/pluginRegistry.ts',
        'src/providers/plugins.ts',
        'src/providers/registryTypes.ts',
      ]),
    );
    expect(violations).toEqual([]);
  });

  it.each(
    providerPluginFamilyFiles,
  )('%s does not depend on the CLI, server, or root facade', (relativePath) => {
    const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    const violations = getRuntimeModuleSpecifiers(source, relativePath).filter(
      (specifier) =>
        specifier === '../index' ||
        specifier === '../../index' ||
        specifier.includes('/commands/') ||
        specifier.includes('/server/'),
    );

    expect(violations).toEqual([]);
  });

  it('keeps the plugin contract independent of the broad legacy types barrel', () => {
    const source = readFileSync(path.join(repoRoot, 'src/providers/registryTypes.ts'), 'utf8');
    const violations = extractModuleSpecifiers(source, 'src/providers/registryTypes.ts').filter(
      (specifier) => specifier === '../types/index' || specifier.endsWith('/types/index'),
    );

    expect(violations).toEqual([]);
  });
});
