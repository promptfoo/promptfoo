import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeRuntimeDependencyClosure,
  extractModuleSpecifiers,
  extractRuntimeModuleSpecifiers,
  findUnclassifiedFiles,
  findViolations,
  getExternalModuleName,
  getLayerForFile,
  getSourceFiles,
  type LayerConfig,
  readLayerConfig,
  resolveInternalModule,
} from '../../scripts/architectureUtils';

describe('extractModuleSpecifiers', () => {
  it('collects static ESM and CommonJS module specifiers', () => {
    const source = `
      import imported from 'esm-import';
      export { exported } from 'esm-export';
      import('dynamic-import');
      import('dynamic-import-with-options', { with: { type: 'json' } });
      const required = require('cjs-require');
      const resolved = require.resolve('cjs-resolve');
      const resolvedWithPaths = require.resolve('cjs-resolve-with-paths', { paths: [] });
      const moduleRequired = module.require('module-require');
      require(nonLiteral);
    `;

    expect(extractModuleSpecifiers(source, 'fixture.ts')).toEqual([
      'esm-import',
      'esm-export',
      'dynamic-import',
      'dynamic-import-with-options',
      'cjs-require',
      'cjs-resolve',
      'cjs-resolve-with-paths',
      'module-require',
    ]);
  });
});

describe('extractRuntimeModuleSpecifiers', () => {
  it('excludes type-only module references from the runtime graph', () => {
    const source = `
      import runtimeDefault, { type ImportedType, runtimeValue } from 'runtime-import';
      import type { OnlyType } from 'type-import';
      export { type ExportedType, runtimeExport } from 'runtime-export';
      export type { OnlyExportedType } from 'type-export';
      import('dynamic-import');
      import('dynamic-import-with-options', { with: { type: 'json' } });
      const required = require('cjs-require');
      const resolvedWithPaths = require.resolve('cjs-resolve-with-paths', { paths: [] });
      const moduleRequired = module.require('module-require');
      type Imported = import('import-type').Imported;
      void runtimeDefault;
      void runtimeValue;
      void required;
      void resolvedWithPaths;
      void moduleRequired;
    `;

    expect(extractRuntimeModuleSpecifiers(source, 'fixture.ts')).toEqual([
      'runtime-import',
      'runtime-export',
      'dynamic-import',
      'dynamic-import-with-options',
      'cjs-require',
      'cjs-resolve-with-paths',
      'module-require',
    ]);
  });
});

describe('computeRuntimeDependencyClosure', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-closure-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = ''): void {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }

  it('reports transitive runtime files, npm dependencies, and Node builtins', () => {
    write(
      'src/index.ts',
      `
        import type { TypeOnly } from './types';
        import { runtime } from './runtime';
        export { runtime };
        void import('./lazy');
      `,
    );
    write(
      'src/runtime.ts',
      `
        import fs from 'node:fs';
        import value from '@scope/runtime/subpath';
        export const runtime = [fs, value];
      `,
    );
    write('src/lazy.ts', "export { value } from 'external-runtime';");
    write('src/types.ts', 'export interface TypeOnly { value: string }');

    expect(computeRuntimeDependencyClosure(repoRoot, 'src/index.ts')).toEqual({
      entrypoint: 'src/index.ts',
      files: ['src/index.ts', 'src/lazy.ts', 'src/runtime.ts'],
      externalDependencies: ['@scope/runtime', 'external-runtime'],
      nodeBuiltins: ['fs'],
      unresolvedInternalImports: [],
    });
  });

  it('reports unresolved internal runtime imports', () => {
    write('src/index.ts', "import './missing.json'; import '';");

    expect(computeRuntimeDependencyClosure(repoRoot, 'src/index.ts')).toMatchObject({
      unresolvedInternalImports: ['src/index.ts: ./missing.json', 'src/index.ts: <empty>'],
    });
  });
});

describe('resolveInternalModule', () => {
  it('maps runtime .js specifiers back to TypeScript source files', () => {
    expect(
      resolveInternalModule(process.cwd(), 'src/server/routes/eval.ts', '../../index.js'),
    ).toBe('src/index.ts');
  });

  it('resolves baseUrl-style src imports so they cannot bypass layer checks', () => {
    expect(resolveInternalModule(process.cwd(), 'src/contracts/index.ts', 'src/index.js')).toBe(
      'src/index.ts',
    );
  });

  describe('edge cases (against synthesized fixture trees)', () => {
    let repoRoot: string;

    beforeEach(() => {
      repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archutils-'));
    });

    afterEach(() => {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    });

    function write(relativePath: string, contents = ''): void {
      const absolute = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, contents);
    }

    it('resolves bare "src" specifier to src/index.ts', () => {
      write('src/index.ts');
      expect(resolveInternalModule(repoRoot, 'scripts/check.ts', 'src')).toBe('src/index.ts');
    });

    it('resolves directory imports to index.ts', () => {
      write('src/contracts/index.ts');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './contracts')).toBe(
        'src/contracts/index.ts',
      );
    });

    it('resolves directory index for .tsx', () => {
      write('src/components/index.tsx');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './components')).toBe(
        'src/components/index.tsx',
      );
    });

    it('maps .mjs specifiers to .mts source files', () => {
      write('src/foo.mts');
      expect(resolveInternalModule(repoRoot, 'src/bar.ts', './foo.mjs')).toBe('src/foo.mts');
    });

    it('maps .cjs specifiers to .cts source files', () => {
      write('src/foo.cts');
      expect(resolveInternalModule(repoRoot, 'src/bar.ts', './foo.cjs')).toBe('src/foo.cts');
    });

    it('resolves .tsx source for runtime .js when both .ts and .tsx are absent', () => {
      write('src/component.tsx');
      expect(resolveInternalModule(repoRoot, 'src/index.ts', './component.js')).toBe(
        'src/component.tsx',
      );
    });

    it('returns undefined for non-existent internal paths', () => {
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', './missing')).toBeUndefined();
    });

    it('returns undefined for non-source relative imports', () => {
      write('package.json', '{}');
      expect(resolveInternalModule(repoRoot, 'src/app/vite.config.ts', '../../package.json')).toBe(
        undefined,
      );
    });

    it('returns undefined for external (non-relative, non-src) specifiers', () => {
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', 'zod')).toBeUndefined();
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', '@scoped/pkg')).toBeUndefined();
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', 'node:fs')).toBeUndefined();
    });

    it('resolves configured source aliases', () => {
      write('src/core/util.ts');
      expect(
        resolveInternalModule(repoRoot, 'src/app/component.tsx', '@promptfoo/core/util', {
          '@promptfoo': 'src',
        }),
      ).toBe('src/core/util.ts');
    });

    it('resolves exact configured source aliases', () => {
      write('src/index.ts');
      expect(
        resolveInternalModule(repoRoot, 'src/app/component.tsx', '@promptfoo', {
          '@promptfoo': 'src',
        }),
      ).toBe('src/index.ts');
    });

    it('prefers the longest configured source alias', () => {
      write('src/app/foo.ts');
      write('src/app/src/foo.ts');
      expect(
        resolveInternalModule(repoRoot, 'src/app/component.tsx', '@promptfoo/app/foo', {
          '@promptfoo': 'src',
          '@promptfoo/app': 'src/app/src',
        }),
      ).toBe('src/app/src/foo.ts');
    });

    it('prefers a file over a directory when both could match', () => {
      write('src/index.ts', '// file');
      write('src/index/index.ts', '// directory');
      expect(resolveInternalModule(repoRoot, 'src/foo.ts', '../src/index')).toBe('src/index.ts');
    });
  });
});

describe('getSourceFiles', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'getsourcefiles-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = ''): void {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }

  it('ignores nested node_modules and configured roots', () => {
    write('src/core/a.ts');
    write('src/app/node_modules/pkg/index.ts');
    write('src/__mocks__/database.ts');

    expect(getSourceFiles(repoRoot, true, ['src/__mocks__'])).toEqual(['src/core/a.ts']);
  });
});

describe('readLayerConfig', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readlayerconfig-'));
    fs.mkdirSync(path.join(repoRoot, 'architecture'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'src/core'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'src/index.ts'), '');
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeConfig(config: unknown): void {
    fs.writeFileSync(path.join(repoRoot, 'architecture/layers.json'), JSON.stringify(config));
  }

  function coreLayer(overrides: Partial<LayerConfig['layers'][number]> = {}) {
    return {
      name: 'core',
      roots: ['src/core'],
      allowedDependencies: [],
      ...overrides,
    };
  }

  it('rejects configs that omit the layers array', () => {
    writeConfig({ publicFacade: 'src/index.ts' });

    expect(() => readLayerConfig(repoRoot)).toThrow('must define a layers array.');
  });

  it('rejects configs that omit an existing public facade', () => {
    writeConfig({ layers: [coreLayer()] });

    expect(() => readLayerConfig(repoRoot)).toThrow('must define an existing publicFacade path.');
  });

  it('rejects duplicate layer names', () => {
    writeConfig({ publicFacade: 'src/index.ts', layers: [coreLayer(), coreLayer()] });

    expect(() => readLayerConfig(repoRoot)).toThrow('contains duplicate layer "core".');
  });

  it('rejects layers without names', () => {
    writeConfig({
      publicFacade: 'src/index.ts',
      layers: [{ roots: ['src/core'], allowedDependencies: [] }],
    });

    expect(() => readLayerConfig(repoRoot)).toThrow('contains a layer without a name.');
  });

  it('rejects layers that omit roots', () => {
    writeConfig({ publicFacade: 'src/index.ts', layers: [coreLayer({ roots: [] })] });

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" must declare roots.',
    );
  });

  it('rejects an invalid allowedExternal entry', () => {
    writeConfig({
      publicFacade: 'src/index.ts',
      layers: [coreLayer({ allowedExternal: ['zod', ''] })],
    });

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" contains an invalid allowedExternal entry.',
    );
  });

  it('rejects directory entries in allowed import paths', () => {
    writeConfig({
      publicFacade: 'src/index.ts',
      layers: [coreLayer({ allowedImportPaths: ['src/core'] })],
    });

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" contains an invalid allowedImportPaths entry.',
    );
  });

  it('rejects missing layer roots', () => {
    writeConfig({
      publicFacade: 'src/index.ts',
      layers: [coreLayer({ roots: ['src/missing'] })],
    });

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" root "src/missing" does not exist.',
    );
  });

  it('rejects layers that omit allowed dependencies', () => {
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/layers.json'),
      JSON.stringify({
        publicFacade: 'src/index.ts',
        layers: [{ name: 'core', roots: ['src/core'] }],
      }),
    );

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" must declare allowedDependencies.',
    );
  });

  it('rejects dependencies on unknown layers', () => {
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/layers.json'),
      JSON.stringify({
        publicFacade: 'src/index.ts',
        layers: [{ name: 'core', roots: ['src/core'], allowedDependencies: ['missing'] }],
      }),
    );

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture layer "core" allows unknown dependency "missing".',
    );
  });

  it('rejects aliases that point to missing paths', () => {
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/layers.json'),
      JSON.stringify({
        publicFacade: 'src/index.ts',
        aliases: { '@missing': 'src/missing' },
        layers: [{ name: 'core', roots: ['src/core'], allowedDependencies: [] }],
      }),
    );

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture alias "@missing" points to missing path "src/missing".',
    );
  });

  it('rejects overlapping layer roots', () => {
    fs.mkdirSync(path.join(repoRoot, 'src/core/nested'), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, 'architecture/layers.json'),
      JSON.stringify({
        publicFacade: 'src/index.ts',
        layers: [
          { name: 'core', roots: ['src/core'], allowedDependencies: [] },
          { name: 'nested', roots: ['src/core/nested'], allowedDependencies: [] },
        ],
      }),
    );

    expect(() => readLayerConfig(repoRoot)).toThrow(
      'Architecture roots "src/core" (core) and "src/core/nested" (nested) overlap.',
    );
  });
});

describe('getExternalModuleName', () => {
  it('names npm packages and scoped packages by their package root', () => {
    expect(getExternalModuleName('zod')).toBe('zod');
    expect(getExternalModuleName('zod/v4')).toBe('zod');
    expect(getExternalModuleName('@scoped/pkg/sub')).toBe('@scoped/pkg');
  });

  it('names Node builtins with the node: prefix stripped', () => {
    expect(getExternalModuleName('node:fs')).toBe('fs');
    expect(getExternalModuleName('fs/promises')).toBe('fs');
  });

  it('returns undefined for relative, absolute, and subpath-import specifiers', () => {
    expect(getExternalModuleName('./shared.js')).toBeUndefined();
    expect(getExternalModuleName('../prompts')).toBeUndefined();
    expect(getExternalModuleName('/abs/path')).toBeUndefined();
    expect(getExternalModuleName('#internal')).toBeUndefined();
  });
});

describe('production layer config', () => {
  it('classifies the public contracts entrypoint as leaf-safe', () => {
    expect(getLayerForFile('src/contracts.ts', readLayerConfig(process.cwd()))).toBe('contracts');
  });

  it('allows core logic to consume leaf-safe contracts', () => {
    const config = readLayerConfig(process.cwd());
    const coreLayer = config.layers.find((layer) => layer.name === 'core');

    expect(coreLayer?.allowedDependencies).toContain('contracts');
  });

  it('allows transitional runtime shims to consume leaf-safe contracts', () => {
    const config = readLayerConfig(process.cwd());
    const legacyRuntimeLayer = config.layers.find((layer) => layer.name === 'legacy-runtime');

    expect(legacyRuntimeLayer?.allowedDependencies).toContain('contracts');
  });

  it('classifies evaluator runtime ports as transitional runtime modules', () => {
    expect(getLayerForFile('src/evaluator/runtime.ts', readLayerConfig(process.cwd()))).toBe(
      'legacy-runtime',
    );
  });

  it('classifies the evaluator runtime adapter as a node module', () => {
    expect(getLayerForFile('src/node/evaluatorRuntime.ts', readLayerConfig(process.cwd()))).toBe(
      'node',
    );
  });

  it('keeps the contracts leaf layer free of disallowed external dependencies', () => {
    const leafExternal = findViolations(process.cwd(), readLayerConfig(process.cwd())).filter(
      (violation) => violation.kind === 'leaf-external',
    );
    expect(leafExternal).toEqual([]);
  });
});

describe('findViolations', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'findviolations-'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents = ''): void {
    const absolute = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }

  function configWithLeaf(leafLayers: string[] = ['leaf']): LayerConfig {
    return {
      publicFacade: 'src/index.ts',
      leafLayers,
      layers: [
        { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
        { name: 'leaf', roots: ['src/leaf'], allowedDependencies: [], allowedExternal: ['zod'] },
        { name: 'core', roots: ['src/core'], allowedDependencies: [] },
      ],
    };
  }

  function configWithLayerRules(): LayerConfig {
    return {
      publicFacade: 'src/index.ts',
      aliases: {
        '@promptfoo': 'src',
      },
      ignoredRoots: ['src/__mocks__'],
      layers: [
        { name: 'facade', roots: ['src/index.ts'], allowedDependencies: [] },
        {
          name: 'app',
          roots: ['src/app'],
          allowedDependencies: ['shared'],
          allowedImportPaths: ['src/shared/allowed.ts'],
        },
        { name: 'core', roots: ['src/core'], allowedDependencies: [] },
        { name: 'shared', roots: ['src/shared'], allowedDependencies: [] },
      ],
    };
  }

  it('returns empty when nothing imports anything internal', () => {
    write('src/index.ts', '// barrel');
    write('src/leaf/a.ts', "import { z } from 'zod';");

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('flags a leaf-layer file importing from another product layer', () => {
    write('src/index.ts');
    write('src/core/util.ts', 'export const x = 1;');
    write('src/leaf/a.ts', "import { x } from '../core/util';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: 'leaf',
      importer: 'src/leaf/a.ts',
      importerLayer: 'leaf',
      imported: 'src/core/util.ts',
      importedLayer: 'core',
    });
  });

  it('flags a leaf-layer file importing a non-allowlisted external package or builtin', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import fs from 'node:fs';\nimport _ from 'lodash';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations.map((v) => v.specifier).sort()).toEqual(['lodash', 'node:fs']);
    expect(violations.every((v) => v.kind === 'leaf-external')).toBe(true);
    expect(violations[0]).toMatchObject({ importerLayer: 'leaf', importedLayer: 'external' });
  });

  it('allows allowlisted externals (ignoring the node: prefix) from a leaf layer', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import { z } from 'zod';\nimport fs from 'node:fs';");

    // allowedExternal uses the bare name; "node:fs" must match an "fs" allowlist entry.
    const config = configWithLeaf();
    config.layers.find((layer) => layer.name === 'leaf')!.allowedExternal = ['zod', 'fs'];

    expect(findViolations(repoRoot, config)).toEqual([]);
  });

  it('does not apply external allowlisting to non-leaf layers', () => {
    write('src/index.ts');
    write('src/core/a.ts', "import fs from 'node:fs';\nimport _ from 'lodash';");

    // 'core' is not a leaf layer, so external imports are unconstrained.
    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('does not flag intra-leaf imports', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import { y } from './b';");
    write('src/leaf/b.ts', 'export const y = 2;');

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('flags a non-facade file importing the public facade', () => {
    write('src/index.ts', "export const facade = 'me';");
    write('src/core/util.ts', "import { facade } from '../index';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: 'facade',
      importer: 'src/core/util.ts',
      importerLayer: 'core',
    });
  });

  it('flags both facade and leaf when a leaf imports the public facade', () => {
    write('src/index.ts', "export const facade = 'me';");
    write('src/leaf/a.ts', "import { facade } from '../index';");

    const violations = findViolations(repoRoot, configWithLeaf());
    const kinds = violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(['facade', 'leaf']);
  });

  it('still applies layer dependency rules when leafLayers is unset', () => {
    write('src/index.ts');
    write('src/leaf/a.ts', "import { x } from '../core/util';");
    write('src/core/util.ts', 'export const x = 1;');

    expect(findViolations(repoRoot, configWithLeaf([]))).toMatchObject([
      {
        kind: 'layer',
        importer: 'src/leaf/a.ts',
        importerLayer: 'leaf',
        imported: 'src/core/util.ts',
        importedLayer: 'core',
      },
    ]);
  });

  it('flags baseUrl-style src/... imports out of a leaf layer', () => {
    write('src/index.ts');
    write('src/core/util.ts', 'export const x = 1;');
    write('src/leaf/a.ts', "import { x } from 'src/core/util';");

    const violations = findViolations(repoRoot, configWithLeaf());
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('leaf');
    expect(violations[0].specifier).toBe('src/core/util');
  });

  it('skips the public facade as an importer (the rule applies to imports OF it, not from it)', () => {
    write('src/index.ts', "import { x } from './core/util';");
    write('src/core/util.ts', 'export const x = 1;');

    expect(findViolations(repoRoot, configWithLeaf())).toEqual([]);
  });

  it('flags dependencies that are not explicitly allowed by the importing layer', () => {
    write('src/index.ts');
    write('src/shared/util.ts', 'export const x = 1;');
    write('src/core/a.ts', "import { x } from '../shared/util';");

    expect(findViolations(repoRoot, configWithLayerRules())).toMatchObject([
      {
        kind: 'layer',
        importer: 'src/core/a.ts',
        importerLayer: 'core',
        imported: 'src/shared/util.ts',
        importedLayer: 'shared',
      },
    ]);
  });

  it('reports a layer violation without a duplicate path violation', () => {
    write('src/index.ts');
    write('src/shared/not-allowed.ts', 'export const x = 1;');
    write('src/app/a.ts', "import { x } from '@promptfoo/shared/not-allowed';");

    const config = configWithLayerRules();
    config.layers[1].allowedDependencies = [];

    expect(findViolations(repoRoot, config)).toEqual([
      {
        kind: 'layer',
        importer: 'src/app/a.ts',
        importerLayer: 'app',
        specifier: '@promptfoo/shared/not-allowed',
        imported: 'src/shared/not-allowed.ts',
        importedLayer: 'shared',
      },
    ]);
  });

  it('allows explicitly configured layer dependencies', () => {
    write('src/index.ts');
    write('src/shared/allowed.ts', 'export const x = 1;');
    write('src/app/a.ts', "import { x } from '@promptfoo/shared/allowed';");

    expect(findViolations(repoRoot, configWithLayerRules())).toEqual([]);
  });

  it('allows configured layer dependencies without path allowlists', () => {
    write('src/index.ts');
    write('src/shared/allowed.ts', 'export const x = 1;');
    write('src/core/a.ts', "import { x } from '../shared/allowed';");

    const config = configWithLayerRules();
    config.layers[2].allowedDependencies = ['shared'];

    expect(findViolations(repoRoot, config)).toEqual([]);
  });

  it('flags new imports outside a restricted layer path allowlist', () => {
    write('src/index.ts');
    write('src/shared/not-allowed.ts', 'export const x = 1;');
    write('src/app/a.ts', "import { x } from '@promptfoo/shared/not-allowed';");

    expect(findViolations(repoRoot, configWithLayerRules())).toMatchObject([
      {
        kind: 'path',
        importer: 'src/app/a.ts',
        importerLayer: 'app',
        imported: 'src/shared/not-allowed.ts',
        importedLayer: 'shared',
      },
    ]);
  });

  it('does not treat restricted layer directory entries as broad allowlist roots', () => {
    write('src/index.ts');
    write('src/shared/new-file.ts', 'export const x = 1;');
    write('src/app/a.ts', "import { x } from '@promptfoo/shared/new-file';");

    const config = configWithLayerRules();
    config.layers[1].allowedImportPaths = ['src/shared'];

    expect(findViolations(repoRoot, config)).toMatchObject([
      {
        kind: 'path',
        importer: 'src/app/a.ts',
        importerLayer: 'app',
        imported: 'src/shared/new-file.ts',
        importedLayer: 'shared',
      },
    ]);
  });

  it('flags restricted layer dependencies referenced through inline import types', () => {
    write('src/index.ts');
    write('src/shared/not-allowed.ts', 'export interface X {}');
    write('src/app/a.ts', "export type X = import('@promptfoo/shared/not-allowed').X;");

    expect(findViolations(repoRoot, configWithLayerRules())).toMatchObject([
      {
        kind: 'path',
        importer: 'src/app/a.ts',
        importerLayer: 'app',
        imported: 'src/shared/not-allowed.ts',
        importedLayer: 'shared',
      },
    ]);
  });

  it('flags restricted layer dependencies referenced through dynamic imports and exports', () => {
    write('src/index.ts');
    write('src/shared/not-allowed.ts', 'export const x = 1;');
    write(
      'src/app/a.ts',
      `
        export { x } from '@promptfoo/shared/not-allowed';
        import('@promptfoo/shared/not-allowed');
      `,
    );

    expect(findViolations(repoRoot, configWithLayerRules())).toHaveLength(2);
    expect(findViolations(repoRoot, configWithLayerRules())).toMatchObject([
      {
        kind: 'path',
        importer: 'src/app/a.ts',
        imported: 'src/shared/not-allowed.ts',
      },
      {
        kind: 'path',
        importer: 'src/app/a.ts',
        imported: 'src/shared/not-allowed.ts',
      },
    ]);
  });

  it('reports unclassified source files outside configured ignored roots', () => {
    write('src/index.ts');
    write('src/core/a.ts');
    write('src/missing/a.ts');
    write('src/__mocks__/database.ts');

    expect(findUnclassifiedFiles(repoRoot, configWithLayerRules())).toEqual(['src/missing/a.ts']);
  });
});
