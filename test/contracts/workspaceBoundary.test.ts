import fs from 'node:fs';
import path from 'node:path';

import { type Node, parseSync, Visitor } from 'oxc-parser';
import { describe, expect, it } from 'vitest';

const contractsSourceDir = path.resolve(__dirname, '../../packages/contracts/src');

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function findBoundaryViolations(sourceText: string, filePath: string): string[] {
  const parsed = parseSync(filePath, sourceText);
  if (parsed.errors.length > 0) {
    throw new Error(`Could not parse ${filePath}: ${parsed.errors[0].message}`);
  }
  const violations: string[] = [];

  function checkSpecifier(specifierNode: Node | undefined, importNode: Node): void {
    const precedingText = sourceText.slice(0, importNode.start);
    const line = precedingText.split('\n').length;
    const character = precedingText.length - precedingText.lastIndexOf('\n');
    const location = `${line}:${character}`;
    let specifier: string | undefined;
    if (specifierNode?.type === 'Literal' && typeof specifierNode.value === 'string') {
      specifier = specifierNode.value;
    } else if (
      specifierNode?.type === 'TemplateLiteral' &&
      specifierNode.expressions.length === 0
    ) {
      specifier = specifierNode.quasis[0]?.value.cooked ?? undefined;
    }
    if (specifier === undefined) {
      violations.push(`${location}: computed module specifier is not allowed`);
      return;
    }

    if (specifier === 'zod') {
      return;
    }

    if (
      !(specifier.startsWith('./') || specifier.startsWith('../')) ||
      path.posix.extname(specifier) !== '.js' ||
      specifier.includes('\\')
    ) {
      violations.push(
        `${location}: module ${JSON.stringify(specifier)} must be zod or relative .js`,
      );
      return;
    }

    const target = path.resolve(path.dirname(filePath), specifier);
    const relativeTarget = path.relative(contractsSourceDir, target);
    if (
      relativeTarget === '..' ||
      relativeTarget.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeTarget)
    ) {
      violations.push(`${location}: module ${JSON.stringify(specifier)} escapes contracts/src`);
    }
  }

  new Visitor({
    ImportDeclaration(node) {
      checkSpecifier(node.source, node);
    },
    ExportAllDeclaration(node) {
      checkSpecifier(node.source, node);
    },
    ExportNamedDeclaration(node) {
      if (node.source) {
        checkSpecifier(node.source, node);
      }
    },
    TSImportEqualsDeclaration(node) {
      if (node.moduleReference.type === 'TSExternalModuleReference') {
        checkSpecifier(node.moduleReference.expression, node);
      }
    },
    TSImportType(node) {
      checkSpecifier(node.source, node);
    },
    ImportExpression(node) {
      checkSpecifier(node.source, node);
    },
    CallExpression(node) {
      const callee = node.callee;
      const isRequire =
        (callee.type === 'Identifier' && callee.name === 'require') ||
        (callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'module' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'require');
      if (isRequire) {
        checkSpecifier(node.arguments[0], node);
      }
    },
  }).visit(parsed.program);

  return violations;
}

describe('contracts workspace dependency boundary', () => {
  it('keeps every runtime and declaration dependency inside the portable leaf or zod', () => {
    const files = collectSourceFiles(contractsSourceDir);
    expect(files.length).toBeGreaterThan(0);

    const violations = files.flatMap((file) =>
      findBoundaryViolations(fs.readFileSync(file, 'utf8'), file).map(
        (violation) => `${path.relative(contractsSourceDir, file)}:${violation}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  describe('boundary scanner', () => {
    const fixturePath = path.join(contractsSourceDir, 'nested', 'fixture.ts');

    it('accepts static runtime and type imports within the leaf and exactly zod', () => {
      expect(
        findBoundaryViolations(
          `
            import { z } from 'zod';
            import './sideEffect.js';
            import type { Parent } from '../parent.js';
            export { Child } from './child.js';
            export type { Parent } from '../parent.js';
            export * from './all.js';
            type Child = import('./child.js').Child;
            type Zod = typeof import('zod');
            const child = import('./child.js');
            const lazy = import(\`../parent.js\`);
            const cjs = require('./child.js');
            import parent = require('../parent.js');
            const example = "import('node:fs')";
            // import 'node:fs';
          `,
          fixturePath,
        ),
      ).toEqual([]);
    });

    it.each([
      ['builtin import', "import fs from 'node:fs';"],
      ['bare builtin import', "import 'fs';"],
      ['other package', "export * from '@promptfoo/contracts';"],
      ['zod subpath', "import { z } from 'zod/v4';"],
      ['type-only import', "import type { Stats } from 'node:fs';"],
      ['type-only export', "export type { Stats } from 'node:fs';"],
      ['import type query', "type Stats = import('node:fs').Stats;"],
      ['typeof import query', "type Fs = typeof import('node:fs');"],
      ['dynamic import', "const fs = import('node:fs');"],
      ['require call', "const fs = require('node:fs');"],
      ['module.require call', "const fs = module.require('node:fs');"],
      ['import equals', "import fs = require('node:fs');"],
      ['extensionless import', "import type { Parent } from '../parent';"],
      ['extensionless type query', "type Child = import('./child').Child;"],
      ['TypeScript extension', "export * from './child.ts';"],
      ['absolute path', "import '/tmp/child.js';"],
    ])('rejects %s', (_, source) => {
      const violations = findBoundaryViolations(source, fixturePath);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('must be zod or relative .js');
    });

    it.each([
      "import type { Root } from '../../../../src/types/index.js';",
      "export * from '../../src-sibling/child.js';",
      "type Root = import('../../outside.js').Root;",
      "const outside = import('../../outside.js');",
      "const outside = require('../../outside.js');",
    ])('rejects paths that escape the source directory: %s', (source) => {
      const violations = findBoundaryViolations(source, fixturePath);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('escapes contracts/src');
    });

    it.each([
      'const loaded = import(modulePath);',
      'const loaded = import(`./${name}.js`);',
      "const loaded = require('./' + name + '.js');",
      'const loaded = module.require(modulePath);',
      'const loaded = require();',
    ])('rejects computed or missing module specifiers: %s', (source) => {
      const violations = findBoundaryViolations(source, fixturePath);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('computed module specifier is not allowed');
    });
  });
});
