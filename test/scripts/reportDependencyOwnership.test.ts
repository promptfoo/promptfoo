import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('root dependency ownership report', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-ownership-'));
    const sourceRoot = path.resolve(__dirname, '../..');
    fs.mkdirSync(path.join(repoRoot, 'scripts'));
    for (const script of ['architectureUtils.ts', 'reportDependencyOwnership.ts']) {
      fs.copyFileSync(
        path.join(sourceRoot, 'scripts', script),
        path.join(repoRoot, 'scripts', script),
      );
    }
    fs.symlinkSync(
      fs.realpathSync(path.join(sourceRoot, 'node_modules')),
      path.join(repoRoot, 'node_modules'),
      'junction',
    );
    write('package.json', {
      type: 'module',
      dependencies: { 'root-dependency': '1.0.0' },
    });
    write('architecture/layers.json', {
      publicFacade: 'src/index.ts',
      layers: [{ name: 'core', roots: ['src', 'packages', 'internal'], allowedDependencies: [] }],
    });
    write('src/index.ts', '');
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents: string | object): void {
    const filePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, typeof contents === 'string' ? contents : JSON.stringify(contents));
  }

  it('excludes separately owned packages while reporting root-owned package and configured sources', () => {
    write('src/runtime.ts', "import 'root-dependency'; import 'missing-root-dependency';");
    write('packages/unowned/index.ts', "import 'root-dependency';");
    write('internal/runtime.ts', "import 'root-dependency';");
    for (const root of ['packages/owned', 'internal/owned']) {
      write(`${root}/package.json`, { dependencies: { 'package-dependency': '1.0.0' } });
      write(`${root}/src/index.ts`, "import 'package-dependency'; import 'root-dependency';");
    }

    const run = (args: string[]) =>
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/reportDependencyOwnership.ts', ...args],
        { cwd: repoRoot, encoding: 'utf8' },
      );
    expect(JSON.parse(run(['--json']))).toEqual([
      {
        dependency: 'root-dependency',
        kind: 'dependency',
        owner: 'core',
        layers: 'core',
        files: 3,
      },
    ]);
    const markdown = run([]);
    expect(markdown).toContain('- missing-root-dependency: core');
    expect(markdown).not.toContain('package-dependency');
  });
});
