import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reportDependencyOwnership } from '../../scripts/reportDependencyOwnership';

import type { LayerConfig } from '../../scripts/architectureUtils';

let root: string;
const config: LayerConfig = {
  publicFacade: 'src/index.ts',
  aliases: { '@app': 'src/app/src', '@promptfoo': 'src' },
  layers: [{ name: 'runtime', roots: ['src'], allowedDependencies: [] }],
};

function write(file: string, text: string) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

function json(file: string, value: unknown) {
  write(file, JSON.stringify(value));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-ownership-'));
  json('package.json', {
    name: 'promptfoo',
    type: 'module',
    dependencies: { shared: '1' },
    workspaces: ['src/app', 'packages/*'],
  });
  json('src/app/package.json', { name: 'app', private: true, devDependencies: { react: '1' } });
  json('packages/contracts/package.json', {
    name: '@promptfoo/contracts',
    dependencies: { zod: '1' },
  });
  json('architecture/dependency-ownership.json', {
    manifestOwners: {
      'package.json': 'root/runtime',
      'src/app/package.json': 'app/browser',
      'packages/contracts/package.json': 'contracts',
    },
  });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('dependency ownership report', () => {
  it('attributes declarations and undeclared imports to their own workspace', () => {
    write('src/index.ts', "import 'shared';");
    write('src/app/src/index.tsx', "import 'react'; import 'shared/subpath'; import 'missing';");
    write('packages/contracts/src/index.ts', "export * from 'zod';");
    const report = reportDependencyOwnership(root, config);
    expect(report.coverage.manifests).toEqual([
      'package.json',
      'packages/contracts/package.json',
      'src/app/package.json',
    ]);
    expect(
      report.declarations.find(
        (entry) => entry.manifest === 'src/app/package.json' && entry.dependency === 'react',
      ),
    ).toMatchObject({ owner: 'app/browser', sections: ['devDependencies'], scopes: ['source'] });
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        manifest: 'src/app/package.json',
        dependency: 'missing',
        declaredElsewhere: [],
      }),
      expect.objectContaining({
        manifest: 'src/app/package.json',
        dependency: 'shared',
        declaredElsewhere: ['package.json'],
      }),
    ]);
    expect(report.rows).toEqual([
      { dependency: 'shared', kind: 'dependency', owner: 'runtime', layers: 'runtime', files: 1 },
    ]);
  });

  it('keeps unaudited packages out of root ownership under configured source roots', () => {
    json('package.json', {
      dependencies: { shared: '1' },
      workspaces: ['src/app', 'packages/contracts'],
    });
    write('src/runtime.ts', "import 'shared'; import 'missing-root';");
    write('packages/unowned/index.ts', "import 'shared';");
    write('internal/runtime.ts', "import 'shared';");
    for (const directory of ['packages/owned', 'internal/owned']) {
      json(`${directory}/package.json`, { dependencies: { foreign: '1' } });
      write(`${directory}/src/index.ts`, "import 'foreign'; import 'shared';");
    }
    const report = reportDependencyOwnership(root, {
      ...config,
      layers: [
        { name: 'runtime', roots: ['src', 'packages', 'internal'], allowedDependencies: [] },
      ],
    });
    expect(report.rows).toEqual([
      { dependency: 'shared', kind: 'dependency', owner: 'runtime', layers: 'runtime', files: 3 },
    ]);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual(['missing-root']);
    expect(report.coverage.sourceFiles).toBe(3);
  });

  it.each([
    { patterns: ['packages/*', '!packages/skip'], included: ['contracts'] },
    { patterns: ['!packages/skip', 'packages/*'], included: ['contracts'] },
    {
      patterns: ['packages/*', '!packages/skip', 'packages/skip'],
      included: ['contracts', 'skip'],
    },
    { patterns: ['./packages/*/', '!/packages/skip/'], included: ['contracts'] },
    { patterns: ['!!packages/*', '!!!packages/skip'], included: ['contracts'] },
    { patterns: ['packages/./contracts'], included: [] },
    {
      patterns: ['packages/*', '!packages/**', '!packages/skip', 'packages/skip'],
      included: ['contracts'],
    },
  ])('matches npm workspace exclusions for $patterns', ({ patterns, included }) => {
    json('package.json', { workspaces: { packages: patterns } });
    json('packages/skip/package.json', { name: 'skip', dependencies: { ignored: '1' } });
    write('packages/skip/src/index.ts', "import 'skip-only';");
    json('architecture/dependency-ownership.json', {
      manifestOwners: Object.fromEntries(
        ['package.json', ...included.map((name) => `packages/${name}/package.json`)].map(
          (manifest) => [manifest, 'owner'],
        ),
      ),
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.coverage.manifests).toEqual([
      'package.json',
      ...included.map((name) => `packages/${name}/package.json`),
    ]);
    expect(report.unassignedManifests).toEqual([]);
    expect(report.annotationErrors).toEqual([]);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual(
      included.includes('skip') ? ['skip-only'] : [],
    );
  });

  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['CRLF', '\r\n'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
  ])('reports literal and computed import lines with %s terminators', (_name, terminator) => {
    write(
      'src/index.ts',
      [
        '// Unicode 🌍 comment',
        "import 'shared';",
        'import(candidate);',
        "import('missing');",
      ].join(terminator),
    );
    const report = reportDependencyOwnership(root, config);
    expect(
      report.declarations.find((entry) => entry.dependency === 'shared')?.references[0].line,
    ).toBe(2);
    expect(report.computedImports[0].line).toBe(3);
    expect(report.undeclaredUsages[0].references[0].line).toBe(4);
  });

  it.each(['build', 'dist', 'coverage', '.docusaurus', '__mocks__'])(
    'discovers a declared workspace beneath %s without scanning its generated output',
    (directory) => {
      const workspace = `${directory}/pkg`;
      json('package.json', { workspaces: [workspace] });
      json(`${workspace}/package.json`, { name: 'nested', dependencies: { runtime: '1' } });
      json('architecture/dependency-ownership.json', {
        manifestOwners: { 'package.json': 'root', [`${workspace}/package.json`]: 'nested' },
      });
      write(`${workspace}/src/index.ts`, "import 'runtime';");
      write(`${workspace}/build/generated.ts`, 'import {');
      const report = reportDependencyOwnership(root, config);
      expect(report.coverage.manifests).toEqual(
        [`${workspace}/package.json`, 'package.json'].sort(),
      );
      expect(report.unassignedManifests).toEqual([]);
      expect(
        report.declarations.find((entry) => entry.dependency === 'runtime')?.references,
      ).toEqual([expect.objectContaining({ file: `${workspace}/src/index.ts`, scope: 'source' })]);
    },
  );

  it.each(['dist/pkg', 'dist/test/pkg', 'packages/pkg', 'test/pkg', 'tests/pkg', '__tests__/pkg'])(
    'keeps handwritten and generated declarations distinct for workspace %s',
    (workspace) => {
      json('package.json', { workspaces: [workspace], dependencies: { 'root-types': '1' } });
      json(`${workspace}/package.json`, { name: 'child', dependencies: { 'child-types': '1' } });
      json('architecture/dependency-ownership.json', {
        manifestOwners: { 'package.json': 'root', [`${workspace}/package.json`]: 'child' },
      });
      write('dist/root.d.ts', "import 'root-types';");
      write(`${workspace}/src/index.ts`, 'export const value = 1;');
      write(`${workspace}/src/env.d.ts`, "import 'child-types';");
      write(`${workspace}/dist/index.d.ts`, "import 'child-types';");
      const report = reportDependencyOwnership(root, config);
      expect(report.coverage.sourceFiles).toBe(2);
      expect(report.coverage.generatedDeclarations).toEqual(
        ['dist/root.d.ts', `${workspace}/dist/index.d.ts`].sort(),
      );
      expect(report.declarations.find((entry) => entry.dependency === 'child-types')).toMatchObject(
        {
          manifest: `${workspace}/package.json`,
          references: [
            expect.objectContaining({ file: `${workspace}/dist/index.d.ts`, scope: 'declaration' }),
            expect.objectContaining({ file: `${workspace}/src/env.d.ts`, scope: 'declaration' }),
          ],
        },
      );
      expect(report.undeclaredUsages).toEqual([]);
    },
  );

  it('honors configured ignored roots across workspace, configured, and emitted declaration scans', () => {
    write('src/keep.ts', "import 'shared';");
    for (const file of [
      'src/ignored/index.ts',
      'src/app/src/excluded/index.ts',
      'tools/ignored/index.ts',
      'dist/src/ignored/index.d.ts',
    ]) {
      write(file, 'import {');
    }
    const report = reportDependencyOwnership(root, {
      ...config,
      ignoredRoots: [
        './src/ignored/',
        'src/app/src/excluded',
        'tools/../tools/ignored',
        'dist/src/ignored',
      ],
      layers: [...config.layers, { name: 'tools', roots: ['tools'], allowedDependencies: [] }],
    });
    expect(report.coverage.sourceFiles).toBe(1);
    expect(report.coverage.generatedDeclarations).toEqual([]);
    expect(report.undeclaredUsages).toEqual([]);
  });

  it('records leading triple-slash package type references with workspace and scope attribution', () => {
    json('package.json', {
      workspaces: ['src/app'],
      devDependencies: { '@types/node': '1', '@types/acme__client': '1' },
    });
    json('src/app/package.json', { name: 'app', devDependencies: { vite: '1' } });
    write('node_modules/@types/acme__client/index.d.ts', 'export interface Client {}');
    write(
      'src/app/src/env.d.ts',
      [
        `/* ${'漢字é😀'.repeat(40)} */`,
        '/// <reference types="vite/client" />',
        "/// <reference types='node' />",
        '/// <reference types="@acme/client" />',
      ].join('\n'),
    );
    write(
      'src/app/src/browser.test.ts',
      '/// <reference types="@vitest/browser/matchers" />\nexport {};',
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.declarations.find((entry) => entry.dependency === 'vite')?.references).toEqual([
      expect.objectContaining({
        kind: 'type',
        specifier: 'vite/client',
        scope: 'declaration',
        line: 2,
      }),
    ]);
    expect(
      report.undeclaredUsages.map((entry) => [
        entry.dependency,
        entry.manifest,
        entry.references[0].scope,
        entry.references[0].kind,
        entry.references[0].line,
      ]),
    ).toEqual([
      ['@types/acme__client', 'src/app/package.json', 'declaration', 'type', 4],
      ['@types/node', 'src/app/package.json', 'declaration', 'type', 3],
      ['@vitest/browser', 'src/app/package.json', 'test', 'type', 1],
    ]);
    expect(report.runtimeDeclarationGaps).toEqual([]);
  });

  it.each([' // reason', ' trailing prose', ' // <reference types="ignored-tail" />'])(
    'recognizes a type directive followed by %s',
    (suffix) => {
      write('src/env.d.ts', `/// <reference types="missingref" />${suffix}\nexport {};`);
      const report = reportDependencyOwnership(root, config);
      expect(report.undeclaredUsages).toEqual([
        expect.objectContaining({
          dependency: 'missingref',
          references: [expect.objectContaining({ kind: 'type', scope: 'declaration', line: 1 })],
        }),
      ]);
      expect(report.runtimeDeclarationGaps).toEqual([]);
    },
  );

  it('ignores triple-slash lookalikes and directives following a statement', () => {
    write(
      'src/index.ts',
      [
        '/* /// <reference types="block-comment" /> */',
        '// <reference types="ordinary-comment" />',
        '/// <reference path="types=\'attribute-value\'" />',
        `const text = '/// <reference types="string-content" />';`,
        '/// <reference types="late-directive" />',
      ].join('\n'),
    );
    write('src/directive.ts', '"use strict";\n/// <reference types="after-prologue" />');
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([]);
  });

  it('reports an undeclared @types package for a referenced runtime dependency', () => {
    json('package.json', { dependencies: { foo: '1' } });
    write('node_modules/@types/foo/index.d.ts', 'export interface Foo {}');
    write('src/env.d.ts', '/// <reference types="foo" />');

    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({ dependency: '@types/foo' }),
    ]);
  });

  it('reads JSDoc @import declarations as type usage', () => {
    write('src/index.js', "/** @import { Foo } from 'jsdoc-types' */");

    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({ dependency: 'jsdoc-types' }),
    ]);
  });

  it('attributes type directives to installed DefinitelyTyped packages without declarations', () => {
    json('package.json', { dependencies: { shared: '1' } });
    json('node_modules/shared/package.json', { name: 'shared', main: 'index.js' });
    write('node_modules/shared/index.js', 'module.exports = {};');
    json('node_modules/@types/shared/package.json', { name: '@types/shared', types: 'index.d.ts' });
    write('node_modules/@types/shared/index.d.ts', 'export interface Shared {}');
    write('src/env.d.ts', '/// <reference types="shared" />');
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: '@types/shared',
        references: [expect.objectContaining({ specifier: 'shared', kind: 'type' })],
      }),
    ]);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual(
      [],
    );
  });

  it.each(['absent', 'stub'])(
    'ignores an %s DefinitelyTyped entry when a package supplies types',
    (entry) => {
      json('package.json', {
        dependencies: { shared: '1' },
        devDependencies: { '@types/shared': '1' },
      });
      json('node_modules/shared/package.json', { name: 'shared', types: 'index.d.ts' });
      write('node_modules/shared/index.d.ts', 'export interface Shared {}');
      if (entry === 'stub') {
        json('node_modules/@types/shared/package.json', { name: '@types/shared' });
      }
      write('src/env.d.ts', '/// <reference types="shared" />');
      const report = reportDependencyOwnership(root, config);
      expect(report.undeclaredUsages).toEqual([]);
      expect(report.declarations.find((item) => item.dependency === 'shared')?.references).toEqual([
        expect.objectContaining({ specifier: 'shared', kind: 'type' }),
      ]);
      expect(
        report.declarations.find((item) => item.dependency === '@types/shared')?.references,
      ).toEqual([]);
    },
  );

  it('preserves exact computed expressions after long Unicode prefixes', () => {
    write(
      'src/index.ts',
      `/* ${'漢字é😀'.repeat(40)} */\nconst value = 1;\nimport(candidate);\nimport('shared');`,
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.computedImports).toEqual([
      expect.objectContaining({ expression: 'import(candidate)', line: 3 }),
    ]);
    expect(
      report.declarations.find((entry) => entry.dependency === 'shared')?.references[0].line,
    ).toBe(4);
  });

  it.each(['./tools/', 'tools/../tools/'])('classifies normalized source root %s', (sourceRoot) => {
    json('package.json', { dependencies: { shared: '1' }, devDependencies: { runtime: '1' } });
    write('tools/index.ts', "import 'shared'; import 'runtime';");
    const report = reportDependencyOwnership(root, {
      ...config,
      layers: [{ name: 'runtime', roots: [sourceRoot], allowedDependencies: [] }],
    });
    expect(report.runtimeDeclarationGaps.map((entry) => entry.dependency)).toEqual(['runtime']);
    expect(report.rows).toContainEqual({
      dependency: 'shared',
      kind: 'dependency',
      owner: 'runtime',
      layers: 'runtime',
      files: 1,
    });
  });

  it('discovers configured production roots outside conventional source directories', () => {
    json('package.json', {
      workspaces: ['packages/*', 'src/app'],
      dependencies: { portable: '1' },
    });
    json('packages/leaf/package.json', { name: 'leaf', dependencies: { schema: '1' } });
    write('packages/leaf/lib/index.ts', "import 'schema'; import 'leaf-missing';");
    write('packages/leaf/lib/types.d.ts', "import 'declaration-missing';");
    write('packages/leaf/lib/index.test.ts', "import 'test-missing';");
    write('tools/portable/index.js', "import 'portable'; import 'external-missing';");
    write('tools/portable/node_modules/nested/index.js', "import 'ignored';");
    write('tools/entry.mts', "import 'entry-missing';");
    write('src/app/vite.config.ts', "import 'build-missing';");
    const report = reportDependencyOwnership(root, {
      ...config,
      layers: [
        ...config.layers,
        { name: 'leaf', roots: ['packages/leaf/lib/'], allowedDependencies: [] },
        {
          name: 'portable',
          roots: ['tools/portable/', 'tools/entry.mts'],
          allowedDependencies: [],
        },
      ],
    });
    expect(report.declarations.find((entry) => entry.dependency === 'schema')).toMatchObject({
      manifest: 'packages/leaf/package.json',
      scopes: ['source'],
      references: [expect.objectContaining({ layer: 'leaf' })],
    });
    expect(report.rows).toEqual([
      {
        dependency: 'portable',
        kind: 'dependency',
        owner: 'portable',
        layers: 'portable',
        files: 1,
      },
    ]);
    expect(
      report.undeclaredUsages.map((entry) => [
        entry.dependency,
        entry.manifest,
        entry.references[0].scope,
      ]),
    ).toEqual([
      ['entry-missing', 'package.json', 'source'],
      ['external-missing', 'package.json', 'source'],
      ['declaration-missing', 'packages/leaf/package.json', 'declaration'],
      ['leaf-missing', 'packages/leaf/package.json', 'source'],
      ['test-missing', 'packages/leaf/package.json', 'test'],
      ['build-missing', 'src/app/package.json', 'build'],
    ]);
  });

  it('covers executable site docs and blog components as workspace source without parsing Markdown', () => {
    json('package.json', { dependencies: { motion: '1' }, workspaces: ['site'] });
    json('site/package.json', { name: 'docs', devDependencies: { react: '1' } });
    write(
      'site/docs/components/Demo.tsx',
      "import { motion } from 'motion/react'; export const Demo = () => <motion.div />;",
    );
    write('site/docs/_shared/data.ts', "import 'shared-data';");
    write(
      'site/blog/components/Icon.js',
      "import { Star } from 'lucide-react'; export const Icon = () => <Star />;",
    );
    write('site/docs/example.md', "# This is not JavaScript\nimport 'markdown-only';");
    write('site/blog/post.mdx', "# This is not JavaScript\nimport 'mdx-only';");
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'lucide-react',
        manifest: 'site/package.json',
        references: [
          expect.objectContaining({ file: 'site/blog/components/Icon.js', scope: 'source' }),
        ],
      }),
      expect.objectContaining({
        dependency: 'motion',
        manifest: 'site/package.json',
        declaredElsewhere: ['package.json'],
        references: [
          expect.objectContaining({ file: 'site/docs/components/Demo.tsx', scope: 'source' }),
        ],
      }),
      expect.objectContaining({
        dependency: 'shared-data',
        manifest: 'site/package.json',
        references: [
          expect.objectContaining({ file: 'site/docs/_shared/data.ts', scope: 'source' }),
        ],
      }),
    ]);
    expect(report.runtimeDeclarationGaps).toEqual([]);
  });

  it('does not accept inherited object keys as declared package names', () => {
    write('src/index.ts', "import 'constructor'; import 'toString';");
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual([
      'constructor',
      'toString',
    ]);
    expect(report.runtimeDeclarationGaps.map((entry) => entry.dependency)).toEqual([
      'constructor',
      'toString',
    ]);
  });

  it('covers build tools, type imports, source declarations, and emitted declarations separately', () => {
    json('package.json', {
      dependencies: { shared: '1' },
      devDependencies: { builder: '1', 'type-only': '1' },
    });
    write('tsdown.config.ts', "import 'builder';");
    write('scripts/build.mjs', "import.meta.resolve('builder/package.json');");
    write(
      'src/index.ts',
      "import type { Type } from 'type-only'; import { type A } from 'type-only'; export type { B } from 'type-only'; export { type C } from 'type-only';",
    );
    write('src/external/library.d.ts', "export type Public = import('source-types').Public;");
    json('dist/src/package.json', { type: 'module' });
    write('dist/src/index.d.ts', "export type Public = import('public-types').Public;");
    write('dist/src/index.d.cts', "import api = require('public-cjs-types'); export = api;");
    write('dist/tests/ignored.d.ts', "export type Test = import('test-types').Test;");
    write('dist/src/index.test.d.ts', "export type Test = import('test-types').Test;");
    write('dist/src/index.js', "import 'ignored-generated-runtime';");
    const report = reportDependencyOwnership(root, config);
    expect(
      report.declarations
        .find((entry) => entry.dependency === 'builder')
        ?.references.map((ref) => [ref.scope, ref.kind]),
    ).toEqual([
      ['build', 'resolve'],
      ['build', 'value'],
    ]);
    expect(
      report.declarations
        .find((entry) => entry.dependency === 'type-only')
        ?.references.map((ref) => ref.kind),
    ).toEqual(['type', 'type', 'type', 'type']);
    expect(
      report.undeclaredUsages.map((entry) => [entry.dependency, entry.references[0].scope]),
    ).toEqual([
      ['public-cjs-types', 'declaration'],
      ['public-types', 'declaration'],
      ['source-types', 'declaration'],
    ]);
    expect(report.coverage.generatedDeclarations).toEqual([
      'dist/src/index.d.cts',
      'dist/src/index.d.ts',
    ]);
  });

  it('surfaces development-only runtime imports without flagging explicit source types', () => {
    json('package.json', {
      devDependencies: { runtime: '1', types: '1' },
      optionalDependencies: { optional: '1' },
      peerDependencies: { peer: '1' },
    });
    write(
      'src/index.ts',
      "import type { A } from 'types'; import 'runtime'; import 'optional'; import 'peer'; import 'missing';",
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.runtimeDeclarationGaps.map((entry) => entry.dependency)).toEqual([
      'missing',
      'runtime',
    ]);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual(['missing']);
  });

  it('honors reviewed build annotations for source-located build imports', () => {
    json('package.json', { devDependencies: { buildOnly: '1' } });
    write('src/index.ts', "import 'buildOnly';");
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'buildOnly',
          disposition: 'build',
          reason: 'Loaded only by a build entrypoint.',
          evidence: ['src/index.ts'],
        },
      ],
    });

    expect(reportDependencyOwnership(root, config).runtimeDeclarationGaps).toEqual([]);
  });

  it('exempts only the source files named by a reviewed build annotation', () => {
    json('package.json', { devDependencies: { builder: '1' } });
    write('src/schema.ts', "import 'builder';");
    write('src/server.ts', "import 'builder';");
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'builder',
          disposition: 'build',
          reason: 'Only the schema generator loads this module.',
          evidence: ['./src/schema.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.runtimeDeclarationGaps).toEqual([
      { dependency: 'builder', references: [expect.objectContaining({ file: 'src/server.ts' })] },
    ]);
    expect(
      report.declarations.find((entry) => entry.dependency === 'builder')?.references,
    ).toHaveLength(2);
  });

  it('supports JSX in workspace JavaScript files', () => {
    write(
      'src/app/src/component.js',
      "import React from 'react'; export const Component = () => <div />;",
    );
    expect(
      reportDependencyOwnership(root, config).declarations.find(
        (entry) => entry.dependency === 'react',
      )?.references,
    ).toEqual([expect.objectContaining({ file: 'src/app/src/component.js', scope: 'source' })]);
  });

  it('records package subpaths containing colons while excluding URL schemes', () => {
    write(
      'src/index.ts',
      "import 'shared/feature:x'; import 'missing/feature:x'; import '@scope/missing/feature:x'; import 'node:fs'; import 'https://example.com/module.js'; import 'data:text/javascript,export{}';",
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual([
      expect.objectContaining({ specifier: 'shared/feature:x' }),
    ]);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual([
      '@scope/missing',
      'missing',
    ]);
    expect(report.runtimeDeclarationGaps.map((entry) => entry.dependency)).toEqual([
      '@scope/missing',
      'missing',
    ]);
  });

  it('resolves source aliases under configured roots outside src', () => {
    write('internal/shared.ts', 'export {};');
    write('src/index.ts', "import '@internal/shared';");
    const report = reportDependencyOwnership(root, {
      ...config,
      aliases: { ...config.aliases, '@internal': 'internal' },
      layers: [{ name: 'runtime', roots: ['src', 'internal'], allowedDependencies: [] }],
    });
    expect(report.undeclaredUsages).toEqual([]);
  });

  it.each(['js', 'jsx', 'mjs', 'cjs'])('resolves extensionless %s source aliases', (extension) => {
    write(`internal/shared.${extension}`, 'export {};');
    write(`internal/nested/index.${extension}`, 'export {};');
    write('src/index.ts', "import '@internal/shared'; import '@internal/nested';");
    const report = reportDependencyOwnership(root, {
      ...config,
      aliases: { ...config.aliases, '@internal': 'internal' },
      layers: [{ name: 'runtime', roots: ['src', 'internal'], allowedDependencies: [] }],
    });
    expect(report.undeclaredUsages).toEqual([]);
  });

  it.each(['js', 'jsx', 'mjs', 'cjs'])(
    'reads dependencies alongside JSX in %s source',
    (extension) => {
      write(
        `src/component.${extension}`,
        "import { value } from 'shared'; export const node = <>{value}</>;",
      );
      const report = reportDependencyOwnership(root, config);
      expect(
        report.declarations.find((entry) => entry.dependency === 'shared')?.references,
      ).toEqual([expect.objectContaining({ file: `src/component.${extension}`, kind: 'value' })]);
    },
  );

  it('records JSDoc template constraints as type dependencies', () => {
    write(
      'src/index.js',
      "/** @template {import('schema').Node} T */\nexport function identity(value) { return value; }",
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'schema',
        references: [expect.objectContaining({ kind: 'type', scope: 'source', line: 1 })],
      }),
    ]);
    expect(report.runtimeDeclarationGaps).toEqual([]);
  });

  it.each([true, false])('reports unresolved src packages with declared=%s', (declared) => {
    json('package.json', { dependencies: declared ? { src: '1' } : {} });
    write('src/internal.ts', 'export {};');
    write('src/index.ts', "import 'src/internal'; import 'src/client';");
    const report = reportDependencyOwnership(root, config);
    const entries = declared ? report.declarations : report.undeclaredUsages;
    expect(entries.find((entry) => entry.dependency === 'src')?.references).toEqual([
      expect.objectContaining({ specifier: 'src/client' }),
    ]);
    expect(report.undeclaredUsages).toHaveLength(declared ? 0 : 1);
  });

  it('retains declared packages beneath manual ledger aliases', () => {
    json('src/app/package.json', { devDependencies: { '@site/sdk': '1' } });
    json('architecture/dependency-ownership.json', {
      manifestOwners: {
        'package.json': 'root/runtime',
        'src/app/package.json': 'app/browser',
        'packages/contracts/package.json': 'contracts',
      },
      aliases: { 'src/app/package.json': ['@site', '@theme'] },
    });
    write('src/app/src/index.ts', "import '@site/sdk'; import '@theme/Layout';");
    const report = reportDependencyOwnership(root, config);
    expect(
      report.declarations.find((entry) => entry.dependency === '@site/sdk')?.references,
    ).toEqual([expect.objectContaining({ specifier: '@site/sdk', file: 'src/app/src/index.ts' })]);
    expect(report.undeclaredUsages).toEqual([]);
  });

  it('resolves aliased assets with resource suffixes and retains unresolved evidence', () => {
    write('src/app/src/assets/logo.svg', '<svg />');
    write('src/app/src/assets/style.css', 'body {}');
    write(
      'src/app/src/index.ts',
      "import '@app/assets/logo.svg?url'; import '@app/assets/style.css#inline'; import '@logo?raw'; import '@app/missing/logo.svg?url';",
    );
    const report = reportDependencyOwnership(root, {
      ...config,
      aliases: { ...config.aliases, '@logo': 'src/app/src/assets/logo.svg' },
    });
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: '@app/missing',
        references: [expect.objectContaining({ specifier: '@app/missing/logo.svg?url' })],
      }),
    ]);
  });

  it.each(['ts', 'tsx', 'mts', 'cts'])('ignores JSDoc dependencies in %s source', (extension) => {
    write(
      `src/index.${extension}`,
      "/** @type {import('example-type').Thing} */\n/** @import { Thing } from 'example-import' */\nexport type Actual = import('actual-type').Thing;",
    );
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({ dependency: 'actual-type' }),
    ]);
  });

  it('distinguishes bare packages from node-only builtins in workspaces', () => {
    write(
      'packages/contracts/src/index.ts',
      "import 'sqlite'; import 'test'; import 'node:sqlite'; import 'node:test'; import 'fs/promises';",
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        manifest: 'packages/contracts/package.json',
        dependency: 'sqlite',
      }),
      expect.objectContaining({ manifest: 'packages/contracts/package.json', dependency: 'test' }),
    ]);
  });

  it('keeps real workspace packages visible when their scope overlaps a source alias', () => {
    write('src/app/src/components.ts', 'export {};');
    write('src/util/text.ts', 'export {};');
    write(
      'src/app/src/index.ts',
      "import '@app/components'; import '@promptfoo/util/text'; import '@promptfoo/contracts'; import 'node:fs'; import './local'; import '#internal'; import 'https://example.com/module.js';",
    );
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: '@promptfoo/contracts',
        manifest: 'src/app/package.json',
      }),
    ]);
  });

  it('keeps external packages visible when they share an architecture alias prefix', () => {
    json('src/app/package.json', { devDependencies: { '@promptfoo/sdk': '1' } });
    write('src/app/src/index.ts', "import '@promptfoo/sdk'; import '@promptfoo/missing';");
    const report = reportDependencyOwnership(root, config);
    expect(
      report.declarations.find((entry) => entry.dependency === '@promptfoo/sdk')?.references,
    ).toEqual([expect.objectContaining({ file: 'src/app/src/index.ts' })]);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: '@promptfoo/missing',
        manifest: 'src/app/package.json',
      }),
    ]);
  });

  it('allows package self references without a circular manifest dependency', () => {
    write('src/index.ts', "import 'promptfoo/contracts';");
    write('packages/contracts/src/index.ts', "import '@promptfoo/contracts/types';");
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([]);
  });

  it('recognizes existing assets through source aliases', () => {
    write('src/app/src/assets/logo.svg', '<svg />');
    write('src/app/src/assets/style.css', 'body {}');
    write(
      'src/app/src/index.ts',
      "import '@app/assets/logo.svg'; import '@app/assets/style.css'; import '@app/missing/logo.svg';",
    );
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({ dependency: '@app/missing' }),
    ]);
  });

  it('records computed loaders without guessing that user paths are missing packages', () => {
    write(
      'src/index.ts',
      'import(candidate); require(moduleName); require.resolve(`${name}/package.json`); import(`literal-package`);',
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.computedImports.map((entry) => entry.expression)).toEqual([
      'import(candidate)',
      'require(moduleName)',
      'require.resolve(`${name}/package.json`)',
    ]);
    expect(report.undeclaredUsages.map((entry) => entry.dependency)).toEqual(['literal-package']);
  });

  it('records JSDoc import types and audits the standalone action package', () => {
    json('code-scan-action/package.json', {
      name: 'action',
      dependencies: { '@actions/core': '1' },
    });
    write('code-scan-action/src/index.ts', "import '@actions/core';");
    write('src/index.js', "/** @type {import('shared').Thing} */\nexport {};");
    const report = reportDependencyOwnership(root, config);
    expect(report.coverage.manifests).toContain('code-scan-action/package.json');
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual([
      expect.objectContaining({ kind: 'type', specifier: 'shared' }),
    ]);
  });

  it.each(['arg', 'argument'])('records JSDoc @%s parameter types', (tag) => {
    write(
      'src/index.js',
      `/** @${tag} {import('schema').Node} value */\nexport function identity(value) { return value; }`,
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        manifest: 'package.json',
        dependency: 'schema',
        references: [expect.objectContaining({ kind: 'type', line: 1 })],
      }),
    ]);
  });

  it('ignores prose and examples while retaining JSDoc type references', () => {
    write(
      'src/index.js',
      [
        "// Example: import('line-example')",
        "/* import('block-example') */",
        "/** Example: import('doc-example') */",
        "/** @example import('tag-example') */",
        "/** @type {string} Example: import('type-description') */",
        "/** @type {import('shared').Thing} */",
        'let value;',
        '/**',
        " * @param {{label: string, nested: {value: import('shared').Thing}}} options",
        " * @returns {Promise<import('shared').Thing>}",
        ' */',
        'function load(options) { return options.nested.value; }',
      ].join('\n'),
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([]);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual([
      expect.objectContaining({ kind: 'type', line: 6 }),
      expect.objectContaining({ kind: 'type', line: 9 }),
      expect.objectContaining({ kind: 'type', line: 10 }),
    ]);
  });

  it('records JSDoc import declarations while ignoring prose and example tags', () => {
    write(
      'src/index.js',
      [
        "/** @import { Thing } from 'shared' */",
        '/**',
        " * @import * as API from 'missing-types'",
        ' */',
        "/** Example: @import { Thing } from 'prose' */",
        "/** @example @import { Thing } from 'example' */",
        "/** @import 'unsupported-tag' */",
        'export {};',
      ].join('\n'),
    );
    const report = reportDependencyOwnership(root, config);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual([
      expect.objectContaining({ kind: 'type', line: 1 }),
    ]);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'missing-types',
        references: [expect.objectContaining({ kind: 'type', line: 3 })],
      }),
    ]);
  });

  it('continues reading JSDoc imports after an unsupported tag', () => {
    write(
      'src/index.js',
      [
        '/**',
        " * @import 'unsupported'",
        ' * @import {',
        ' *   Client',
        " * } from 'client-types'",
        ' */',
        'export {};',
      ].join('\n'),
    );
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'client-types',
        references: [expect.objectContaining({ kind: 'type', line: 3 })],
      }),
    ]);
  });

  it('attributes package resource queries to the declared package', () => {
    json('package.json', { dependencies: { shared: '1', '@site/sdk': '1' } });
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root' },
      aliases: { 'package.json': ['@site'] },
    });
    write('src/index.ts', "import 'shared?raw'; import '@site/sdk?init'; import 'missing#asset';");
    const report = reportDependencyOwnership(root, config);
    for (const [dependency, specifier] of [
      ['shared', 'shared?raw'],
      ['@site/sdk', '@site/sdk?init'],
    ]) {
      expect(
        report.declarations.find((entry) => entry.dependency === dependency)?.references,
      ).toEqual([expect.objectContaining({ specifier })]);
    }
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'missing',
        references: [expect.objectContaining({ specifier: 'missing#asset' })],
      }),
    ]);
  });

  it.each([
    ['ts', 'export {};'],
    ['d.ts', 'export {};'],
    ['cts', 'import shared = require("shared");'],
  ])('records module augmentations in %s files', (extension, moduleMarker) => {
    write(
      `src/augment.${extension}`,
      `${moduleMarker}\ndeclare module 'driver' { interface Client { label: string } }`,
    );
    write('src/shim.d.ts', "declare module 'shim-only' { export interface Client {} }");
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'driver',
        references: [
          expect.objectContaining({ file: `src/augment.${extension}`, kind: 'type', line: 2 }),
        ],
      }),
    ]);
  });

  it('prints the assigned owner of a workspace with no declarations', () => {
    json('src/app/package.json', { name: 'app', private: true });
    json('architecture/layers.json', { ...config, aliases: {} });
    write('src/index.ts', 'export {};');
    for (const script of ['reportDependencyOwnership.ts', 'architectureUtils.ts']) {
      write(
        `scripts/${script}`,
        fs.readFileSync(path.join(process.cwd(), 'scripts', script), 'utf8'),
      );
    }
    fs.symlinkSync(
      path.join(process.cwd(), 'node_modules'),
      path.join(root, 'node_modules'),
      'dir',
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        fs.realpathSync(path.join(root, 'scripts/reportDependencyOwnership.ts')),
      ],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('src/app/package.json: app/browser (0 declarations)');
  });

  it('records documented computed usage without pretending it is a literal import', () => {
    write('src/index.ts', 'import(candidate);');
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'shared',
          disposition: 'computed-loader',
          reason: 'A candidate table selects the package export.',
          evidence: ['./src/index.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual([
      expect.objectContaining({ kind: 'annotation', line: 0, file: 'src/index.ts' }),
    ]);
    expect(report.computedImports[0].fileAnnotations).toEqual(['shared']);
    expect(report.rows[0].owner).toBe('unreferenced');
  });

  it('does not apply computed annotations across workspace manifests', () => {
    json('package.json', { workspaces: ['src/app'], dependencies: { shared: '1' } });
    json('src/app/package.json', { dependencies: {} });
    write('src/app/src/index.ts', 'import(candidate);');
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime', 'src/app/package.json': 'app/browser' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'shared',
          disposition: 'computed-loader',
          reason: 'Root-only computed loader.',
          evidence: ['src/app/src/index.ts'],
        },
      ],
    });

    const report = reportDependencyOwnership(root, config);
    expect(report.computedImports[0].fileAnnotations).toEqual([]);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')?.references).toEqual(
      [],
    );
  });

  it('rejects computed-loader evidence owned by a different manifest', () => {
    write('src/app/src/loader.ts', 'import(candidate);');
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'shared',
          disposition: 'computed-loader',
          reason: 'Incorrectly attributed loader.',
          evidence: ['./src/app/src/loader.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.annotationErrors).toEqual([
      'Computed-loader evidence belongs to src/app/package.json, not package.json: ./src/app/src/loader.ts',
    ]);
    expect(report.computedImports[0].fileAnnotations).toEqual([]);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')).toMatchObject({
      references: [],
      annotations: [],
    });
  });

  it('reports stale annotations, missing evidence, and unassigned workspace ownership', () => {
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'ghost/package.json': 'ghost' },
      aliases: { 'removed/package.json': ['@removed'] },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'removed',
          disposition: 'native-install',
          reason: 'Native asset.',
          evidence: ['missing.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.annotationErrors).toEqual([
      'Unknown manifest owner: ghost/package.json',
      'Unknown manifest owner: removed/package.json',
      'Annotation has no declaration: package.json: removed',
      'Missing annotation evidence: missing.ts',
    ]);
    expect(report.unassignedManifests).toEqual(report.coverage.manifests);
  });

  it('reports stale computed-loader annotations without manufacturing usage or crashing', () => {
    write('src/index.ts', 'import(candidate);');
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'removed/package.json',
          dependency: 'removed',
          disposition: 'computed-loader',
          reason: 'Stale workspace.',
          evidence: ['src/index.ts'],
        },
        {
          manifest: 'package.json',
          dependency: 'removed',
          disposition: 'computed-loader',
          reason: 'Stale dependency.',
          evidence: ['src/index.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.annotationErrors).toEqual([
      'Annotation has no declaration: removed/package.json: removed',
      'Annotation has no declaration: package.json: removed',
    ]);
    expect(report.undeclaredUsages).toEqual([]);
    expect(report.computedImports[0].fileAnnotations).toEqual([]);
  });

  it('excludes annotations with missing evidence from computed import and declaration metadata', () => {
    write('src/index.ts', 'import(candidate);');
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'package.json': 'root/runtime' },
      annotations: [
        {
          manifest: 'package.json',
          dependency: 'shared',
          disposition: 'computed-loader',
          reason: 'A removed evidence file invalidates this annotation.',
          evidence: ['src/index.ts', 'missing.ts'],
        },
      ],
    });
    const report = reportDependencyOwnership(root, config);
    expect(report.annotationErrors).toEqual(['Missing annotation evidence: missing.ts']);
    expect(report.computedImports[0].fileAnnotations).toEqual([]);
    expect(report.declarations.find((entry) => entry.dependency === 'shared')).toMatchObject({
      references: [],
      annotations: [],
    });
  });

  it('rejects malformed annotations and source parse failures', () => {
    json('architecture/dependency-ownership.json', {
      manifestOwners: {},
      annotations: [{ reason: '' }],
    });
    expect(() => reportDependencyOwnership(root, config)).toThrow();
    fs.unlinkSync(path.join(root, 'architecture/dependency-ownership.json'));
    write('src/index.ts', 'import {');
    expect(() => reportDependencyOwnership(root, config)).toThrow('Could not parse src/index.ts');
  });

  it('does not turn node_modules, generated runtime, or mocks into source ownership', () => {
    write('src/node_modules/hidden/index.ts', "import 'hidden';");
    write('src/__mocks__/mock.ts', "import 'mock';");
    write('src/app/build/generated.ts', "import 'generated';");
    write('src/app/src/view.test.ts', "import 'test-only';");
    const report = reportDependencyOwnership(root, config);
    expect(report.undeclaredUsages).toEqual([
      expect.objectContaining({
        dependency: 'test-only',
        references: [expect.objectContaining({ scope: 'test' })],
      }),
    ]);
    expect(report.rows[0].files).toBe(0);
  });
});
