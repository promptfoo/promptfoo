import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Node, parseSync, Visitor } from 'oxc-parser';
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

function getRuntimeModuleSpecifiers(sourceText: string, filePath: string): string[] {
  const { program, errors } = parseSync(filePath, sourceText);
  if (errors.length > 0) {
    throw new Error(`Cannot parse ${filePath}: ${errors[0].message}`);
  }
  const specifiers: string[] = [];
  function addStaticLoad(source: Node | undefined, hasExtraArguments = false): void {
    if (hasExtraArguments || source?.type !== 'Literal' || typeof source.value !== 'string') {
      throw new Error('Pure boundary runtime loads must use one static string specifier');
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
  it('ignores type-only imports while following runtime imports and re-exports', () => {
    expect(
      getRuntimeModuleSpecifiers(
        `
      import type { Host } from './host-types';
      import { type OtherHost } from './other-host-types';
      export type { TypeOnly } from './exported-types';
      export { type AnotherType } from './another-type';
      import { type Config, run } from './mixed';
      import './side-effect';
      export * from './re-export';
      export { runAgain } from './named-export';
      const dynamic = import('./dynamic');
      const commonjs = require('./commonjs');
    `,
        'fixture.ts',
      ),
    ).toEqual([
      './mixed',
      './side-effect',
      './re-export',
      './named-export',
      './dynamic',
      './commonjs',
    ]);
  });

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
