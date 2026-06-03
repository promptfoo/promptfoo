import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computePackageArtifactClosure,
  computePackageArtifactReadinessReport,
  computePackageReadinessReport,
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
    ).toEqual(['promptfoo/contracts', 'promptfoo/provider-plugin']);
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
