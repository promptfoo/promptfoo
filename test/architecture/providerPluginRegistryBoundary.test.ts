import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Node, parseSync, Visitor } from 'oxc-parser';
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
  const { program, errors } = parseSync(filePath, sourceText);
  if (errors.length > 0) {
    throw new Error(`Cannot parse ${filePath}: ${errors[0].message}`);
  }
  const specifiers: string[] = [];
  function addStaticLoad(source: Node | undefined, hasExtraArguments = false): void {
    if (hasExtraArguments || source?.type !== 'Literal' || typeof source.value !== 'string') {
      throw new Error('Provider plugin runtime loads must use one static string specifier');
    }
    specifiers.push(source.value);
  }
  new Visitor({
    ImportDeclaration(node) {
      if (
        node.importKind !== 'type' &&
        (node.specifiers.length === 0 ||
          node.specifiers.some(
            (specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type',
          ))
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

  it.each(providerPluginFamilyFiles)(
    '%s does not depend on the CLI, server, or root facade',
    (relativePath) => {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      const violations = getRuntimeModuleSpecifiers(source, relativePath).filter(
        (specifier) =>
          specifier === '../index' ||
          specifier === '../../index' ||
          specifier.includes('/commands/') ||
          specifier.includes('/server/'),
      );

      expect(violations).toEqual([]);
    },
  );

  it('keeps the plugin contract independent of the broad legacy types barrel', () => {
    const source = readFileSync(path.join(repoRoot, 'src/providers/registryTypes.ts'), 'utf8');
    const violations = extractModuleSpecifiers(source, 'src/providers/registryTypes.ts').filter(
      (specifier) => specifier === '../types/index' || specifier.endsWith('/types/index'),
    );

    expect(violations).toEqual([]);
  });

  it.each([
    'import(name)',
    "import('./module', { with: { type: 'json' } })",
    'module.require(name)',
  ])('fails closed for unsupported runtime load: %s', (source) => {
    expect(() => getRuntimeModuleSpecifiers(source, 'fixture.ts')).toThrow(
      'Provider plugin runtime loads must use one static string specifier',
    );
  });
});
