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

  it.each([
    { patterns: ['packages/*', '!packages/skip'], included: ['contracts'] },
    { patterns: ['!packages/skip', 'packages/*'], included: ['contracts'] },
    {
      patterns: ['packages/*', '!packages/skip', 'packages/skip'],
      included: ['contracts', 'skip'],
    },
    { patterns: ['./packages/*/', '!/packages/skip/'], included: ['contracts'] },
    { patterns: ['!!packages/*', '!!!packages/skip'], included: ['contracts'] },
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
    write('dist/src/index.d.ts', "export type Public = import('public-types').Public;");
    write('dist/src/index.d.cts', "import api = require('public-cjs-types'); export = api;");
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

  it('keeps real workspace packages visible when their scope overlaps a source alias', () => {
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

  it('allows package self references without a circular manifest dependency', () => {
    write('src/index.ts', "import 'promptfoo/contracts';");
    write('packages/contracts/src/index.ts', "import '@promptfoo/contracts/types';");
    expect(reportDependencyOwnership(root, config).undeclaredUsages).toEqual([]);
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
          evidence: ['src/index.ts'],
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

  it('reports stale annotations, missing evidence, and unassigned workspace ownership', () => {
    json('architecture/dependency-ownership.json', {
      manifestOwners: { 'ghost/package.json': 'ghost' },
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
