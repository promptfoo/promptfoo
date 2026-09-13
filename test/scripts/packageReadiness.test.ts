import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computePackageArtifactClosure,
  computePackageArtifactReadinessReport,
  computePackageReadinessReport,
  findPackageCandidateExportViolations,
  getPackageCandidateSpecifier,
  readPackageCandidateConfig,
  resolvePackageArtifactPath,
} from '../../scripts/packageReadiness';

describe('package readiness', () => {
  it('keeps every declared package candidate within its runtime budgets', () => {
    const report = computePackageReadinessReport(process.cwd());

    expect(report.violations).toEqual([]);
    expect(report.architecture.sourceFiles).toBeGreaterThan(0);
    expect(report.architecture.crossLayerEdges).toBeGreaterThan(0);
    expect(report.candidates.map((candidate) => candidate.name)).toEqual([
      'contracts',
      'assertions-pure',
      'provider-plugin',
    ]);
  });

  it('identifies the candidates that already have public package subpaths', () => {
    const config = readPackageCandidateConfig(process.cwd());

    expect(
      config.candidates.flatMap((candidate) => {
        const specifier = getPackageCandidateSpecifier(candidate);
        return specifier ? [specifier] : [];
      }),
    ).toEqual(['promptfoo/contracts', 'promptfoo/assertions/pure', 'promptfoo/provider-plugin']);
  });
});

describe('package artifact readiness', () => {
  let packageRoot: string;

  beforeEach(() => {
    packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifact-readiness-'));
  });

  afterEach(() => {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents: string): void {
    const absolutePath = path.join(packageRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }

  it.each([
    [{ artifacts: null }, 'contains invalid artifacts'],
    [{ artifacts: {}, maxArtifactFiles: 1, maxArtifactBytes: 100 }, 'contains invalid artifacts'],
    [{ artifacts: [], maxArtifactFiles: 1, maxArtifactBytes: 100 }, 'contains invalid artifacts'],
    [{ maxArtifactFiles: 1 }, 'artifact budgets require artifacts'],
    [{ maxArtifactBytes: 100 }, 'artifact budgets require artifacts'],
    [{ entrypoint: null }, 'must declare a string entrypoint'],
    [{ entrypoint: '../outside.ts' }, 'entrypoint must stay inside the repo'],
  ])('rejects malformed candidate config: %s', (override, message) => {
    write('src/index.ts', 'export {};');
    write(
      'architecture/package-candidates.json',
      JSON.stringify({
        candidates: [
          {
            name: 'fixture',
            entrypoint: 'src/index.ts',
            allowedExternal: [],
            allowedBuiltins: [],
            maxSourceFiles: 1,
            ...override,
          },
        ],
      }),
    );

    expect(() => readPackageCandidateConfig(packageRoot)).toThrow(message);
  });

  it('rejects candidate entrypoints that escape through symlinks', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'package-candidate-outside-'));
    fs.writeFileSync(path.join(outside, 'index.ts'), 'export {};');
    fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'index.ts'), path.join(packageRoot, 'src/index.ts'));
    write(
      'architecture/package-candidates.json',
      JSON.stringify({
        candidates: [
          {
            name: 'fixture',
            entrypoint: 'src/index.ts',
            allowedExternal: [],
            allowedBuiltins: [],
            maxSourceFiles: 1,
          },
        ],
      }),
    );

    try {
      expect(() => readPackageCandidateConfig(packageRoot)).toThrow(
        'entrypoint must stay inside the repo',
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('measures the emitted runtime graph and reports missing or escaping imports', () => {
    write(
      'dist/index.js',
      `
        import './chunk.js';
        import './missing.js';
        import '../../outside.js';
        import '#internal';
        import '/absolute.js';
      `,
    );
    write(
      'dist/chunk.js',
      `
        import fs from 'node:fs';
        import { z } from 'zod';
        export const value = [fs, z];
      `,
    );

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      entrypoint: 'dist/index.js',
      files: ['dist/chunk.js', 'dist/index.js'],
      externalDependencies: ['zod'],
      nodeBuiltins: ['fs'],
      missingFiles: ['dist/missing.js'],
      outsidePackageImports: ['dist/index.js: ../../outside.js'],
      unsupportedPackageImports: ['dist/index.js: #internal', 'dist/index.js: /absolute.js'],
    });
  });

  it('enforces artifact dependency, builtin, file, and byte budgets', () => {
    write(
      'dist/index.js',
      `
        import './chunk.js';
        import fs from 'node:fs';
        import { z } from 'zod';
        void fs;
        void z;
      `,
    );
    write('dist/chunk.js', 'export const value = true;');

    const report = computePackageArtifactReadinessReport(packageRoot, [
      {
        name: 'fixture',
        entrypoint: 'src/index.ts',
        artifacts: { esm: 'dist/index.js' },
        allowedExternal: [],
        allowedBuiltins: [],
        maxSourceFiles: 1,
        maxArtifactFiles: 1,
        maxArtifactBytes: 1,
      },
    ]);

    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('artifact closure has 2 files'),
        expect.stringContaining('bytes (max 1)'),
        expect.stringContaining('unexpected external dependencies: zod'),
        expect.stringContaining('unexpected Node builtins: fs'),
      ]),
    );
  });

  it('fails closed when package imports cannot be resolved', () => {
    write('dist/index.js', "import '#internal';");

    const report = computePackageArtifactReadinessReport(packageRoot, [
      {
        name: 'fixture',
        entrypoint: 'src/index.ts',
        artifacts: { esm: 'dist/index.js' },
        allowedExternal: [],
        allowedBuiltins: [],
        maxSourceFiles: 1,
        maxArtifactFiles: 1,
        maxArtifactBytes: 100,
      },
    ]);

    expect(report.violations).toEqual([
      'fixture/esm: package imports cannot be resolved: dist/index.js: #internal',
    ]);
  });

  it('requires exact relative paths for ESM but follows CommonJS extension resolution', () => {
    write('dist/index.js', "void import('./chunk');");
    write('dist/chunk.js', 'export const value = true;');
    write('dist/index.cjs', "require('./chunk');");

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      files: ['dist/index.js'],
      missingFiles: ['dist/chunk'],
    });
    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/chunk.js', 'dist/index.cjs'],
      missingFiles: [],
    });
  });

  it('uses ESM resolution for dynamic imports inside CommonJS', () => {
    write('dist/index.cjs', "void import('./chunk');");
    write('dist/chunk.js', 'module.exports = true;');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs'],
      missingFiles: ['dist/chunk'],
    });
  });

  it('preserves JSON attributes and ignores relative import.meta.resolve probes', () => {
    write(
      'dist/index.js',
      `export { default as data } from './data.json' with { type: 'json' };
       void import('./dynamic.json', { "with": { "type": 'json' } });
       import.meta.resolve('./optional.js');`,
    );
    write('dist/data.json', '{}');
    write('dist/dynamic.json', '{}');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      files: ['dist/data.json', 'dist/dynamic.json', 'dist/index.js'],
      missingFiles: [],
      unsupportedPackageImports: [],
    });
  });

  it('uses CommonJS resolution for createRequire inside ESM', () => {
    write(
      'dist/index.js',
      "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('./chunk');",
    );
    write('dist/chunk.js', 'export const value = true;');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      files: ['dist/chunk.js', 'dist/index.js'],
      missingFiles: [],
    });
  });

  it('follows CommonJS package main and strips ESM URL suffixes', () => {
    write('dist/index.cjs', "require('./plugin');");
    write('dist/plugin/package.json', JSON.stringify({ main: 'lib' }));
    write('dist/plugin/lib/index.js', 'module.exports = true;');
    write('dist/index.js', "import './chunk.js?cache=1#fragment';");
    write('dist/chunk.js', 'export {};');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs', 'dist/plugin/lib/index.js'],
      missingFiles: [],
    });
    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      files: ['dist/chunk.js', 'dist/index.js'],
      missingFiles: [],
    });
  });

  it('keeps CommonJS URL suffixes and prefers package main over index', () => {
    write('dist/suffix.cjs', "require('./chunk.js?cache=1');");
    write('dist/chunk.js', 'module.exports = true;');
    write('dist/main.cjs', "require('./plugin');");
    write('dist/plugin/package.json', JSON.stringify({ main: 'main.js' }));
    write('dist/plugin/main.js', 'module.exports = true;');
    write('dist/plugin/index.js', "require('wrong-package');");

    expect(computePackageArtifactClosure(packageRoot, 'dist/suffix.cjs').missingFiles).toEqual([
      'dist/chunk.js?cache=1',
    ]);
    expect(computePackageArtifactClosure(packageRoot, 'dist/main.cjs').files).toContain(
      'dist/plugin/main.js',
    );
  });

  it('counts the original bytes of binary artifacts', () => {
    const source = "require('./native.node');";
    const binary = Buffer.from([0xff, 0x80, 0, 0x61]);
    write('dist/index.cjs', source);
    fs.writeFileSync(path.join(packageRoot, 'dist/native.node'), binary);

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs', 'dist/native.node'],
      totalBytes: Buffer.byteLength(source) + binary.length,
      missingFiles: [],
    });
  });

  it('rejects CommonJS requires of WebAssembly artifacts', () => {
    write('dist/index.cjs', "require('./module.wasm');");
    write('dist/module.wasm', 'binary');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs'],
      unsupportedPackageImports: ['dist/index.cjs: ./module.wasm'],
    });
  });

  it('scans extensionless JavaScript and rejects undeclared runtime externals', () => {
    write('package.json', JSON.stringify({ dependencies: {} }));
    write('dist/index.cjs', "require('./loader'); require('./loader.txt');");
    write('dist/loader', "require('yaml');");
    write('dist/loader.txt', "require('zod');");

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs', 'dist/loader', 'dist/loader.txt'],
      externalDependencies: ['yaml', 'zod'],
    });
    const report = computePackageArtifactReadinessReport(packageRoot, [
      {
        name: 'fixture',
        entrypoint: 'src/index.ts',
        artifacts: { cjs: 'dist/index.cjs' },
        allowedExternal: ['yaml', 'zod'],
        allowedBuiltins: [],
        maxSourceFiles: 1,
        maxArtifactFiles: 3,
        maxArtifactBytes: 100,
      },
    ]);
    expect(report.violations).toContain('fixture/cjs: undeclared external dependencies: yaml, zod');

    write('package.json', JSON.stringify({ optionalDependencies: { yaml: '^2.0.0' } }));
    expect(
      computePackageArtifactReadinessReport(packageRoot, [
        {
          name: 'fixture',
          entrypoint: 'src/index.ts',
          artifacts: { cjs: 'dist/index.cjs' },
          allowedExternal: ['yaml', 'zod'],
          allowedBuiltins: [],
          maxSourceFiles: 1,
          maxArtifactFiles: 3,
          maxArtifactBytes: 100,
        },
      ]).violations,
    ).not.toContain('fixture/cjs: undeclared external dependencies: yaml');
  });

  it('fails malformed package metadata and scans supported executable files', () => {
    write('dist/index.cjs', "require('./broken'); require('./loader.ts'); require('fs/not-real');");
    write('dist/broken/package.json', '{');
    write('dist/broken/index.js', 'module.exports = true;');
    write('dist/loader.ts', "require('yaml');");

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.cjs')).toMatchObject({
      files: ['dist/index.cjs', 'dist/loader.ts'],
      externalDependencies: ['yaml'],
      unsupportedPackageImports: ['dist/index.cjs: ./broken', 'dist/index.cjs: fs/not-real'],
    });
  });

  it('follows package self-references and rejects JSON imports without attributes', () => {
    write(
      'package.json',
      JSON.stringify({
        name: 'fixture',
        exports: { './other': { import: { default: './dist/other.js' } } },
        imports: { '#internal': './dist/internal.js' },
      }),
    );
    write(
      'dist/index.js',
      "import 'fixture/other'; import '#internal'; import quoted from './quoted.json' with { \"type\": 'json' }; void quoted; void import('./bad.json'); void import('./ok.json', { with: { type: 'json' } }); void import('./addon.node');",
    );
    write('dist/other.js', "import 'yaml';");
    write('dist/internal.js', "import 'zod';");
    write('dist/bad.json', '{}');
    write('dist/ok.json', '{}');
    write('dist/quoted.json', '{}');
    write('dist/addon.node', 'binary');

    expect(computePackageArtifactClosure(packageRoot, 'dist/index.js')).toMatchObject({
      files: [
        'dist/index.js',
        'dist/internal.js',
        'dist/ok.json',
        'dist/other.js',
        'dist/quoted.json',
      ],
      externalDependencies: ['yaml', 'zod'],
      unsupportedPackageImports: ['dist/index.js: ./addon.node', 'dist/index.js: ./bad.json'],
    });
  });

  it('rejects format-specific dependency drift', () => {
    write('dist/index.js', "import 'zod';");
    write('dist/index.cjs', "require('yaml');");

    const report = computePackageArtifactReadinessReport(packageRoot, [
      {
        name: 'fixture',
        entrypoint: 'src/index.ts',
        artifacts: { esm: 'dist/index.js', cjs: 'dist/index.cjs' },
        allowedExternal: ['yaml', 'zod'],
        allowedBuiltins: [],
        maxSourceFiles: 1,
        maxArtifactFiles: 1,
        maxArtifactBytes: 100,
      },
    ]);

    expect(report.violations).toEqual(['fixture: ESM and CommonJS dependency closures differ']);
  });

  it('rejects conditional exports that bypass the declared artifact budgets', () => {
    const candidates = [
      {
        name: 'fixture',
        entrypoint: 'src/index.ts',
        packageSubpath: 'fixture',
        artifacts: { esm: 'dist/index.js', cjs: 'dist/index.cjs' },
        allowedExternal: [],
        allowedBuiltins: [],
        maxSourceFiles: 1,
        maxArtifactFiles: 1,
        maxArtifactBytes: 100,
      },
    ];

    expect(
      findPackageCandidateExportViolations(
        {
          './fixture': {
            import: {
              types: './dist/index.d.ts',
              node: './dist/unbudgeted-node.js',
              default: './dist/index.js',
            },
            require: {
              types: './dist/index.d.cts',
              default: './dist/index.cjs',
            },
          },
        },
        candidates,
      ),
    ).toEqual(['fixture/esm: import conditions must be exactly types then default']);
  });
});

describe('resolvePackageArtifactPath', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifact-path-'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('accepts only an existing .tgz file', () => {
    fs.writeFileSync(path.join(rootDir, 'package.tgz'), '');

    expect(resolvePackageArtifactPath(rootDir, 'package.tgz')).toBe(
      path.join(rootDir, 'package.tgz'),
    );
    expect(() => resolvePackageArtifactPath(rootDir, '.')).toThrow(
      'Package artifact must be a .tgz file',
    );
    expect(() => resolvePackageArtifactPath(rootDir, 'package.tar')).toThrow(
      'Package artifact does not exist',
    );
  });
});
