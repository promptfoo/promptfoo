import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
let fixtureRoot: string;

function write(relativePath: string, content: string) {
  const file = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dependency-ownership-'));
  write(
    'package.json',
    JSON.stringify({
      type: 'module',
      dependencies: { 'direct-package': '*', 'shared-package': '*' },
      optionalDependencies: { 'optional-package': '*' },
      devDependencies: { 'dev-only': '*' },
      peerDependencies: {
        'peer-package': '*',
        'optional-peer-package': '*',
        'shared-package': '*',
        'unused-peer': '*',
      },
      peerDependenciesMeta: {
        'optional-peer-package': { optional: true },
        'peer-package': { optional: false },
        'metadata-only': { optional: true },
      },
    }),
  );
  write('src/index.ts', 'export {};');
  write(
    'src/core/consumer.ts',
    `import 'direct-package';
import 'optional-package';
import 'peer-package';
import 'shared-package';
import 'dev-only';
import 'metadata-only';
import 'missing-package';
import('optional-peer-package/subpath');`,
  );
  write('src/providers/consumer.ts', "import 'optional-peer-package';");
  write(
    'architecture/layers.json',
    JSON.stringify({
      publicFacade: 'src/index.ts',
      layers: ['core', 'providers'].map((name) => ({
        name,
        roots: [`src/${name}`],
        allowedDependencies: [],
      })),
    }),
  );
  for (const script of ['reportDependencyOwnership.ts', 'architectureUtils.ts']) {
    write(`scripts/${script}`, fs.readFileSync(path.join(repoRoot, 'scripts', script), 'utf8'));
  }
  fs.symlinkSync(
    path.join(repoRoot, 'node_modules'),
    path.join(fixtureRoot, 'node_modules'),
    'junction',
  );
});

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function runReport(...args: string[]): string {
  return execFileSync(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), 'scripts/reportDependencyOwnership.ts', ...args],
    { cwd: fixtureRoot, encoding: 'utf8' },
  );
}

it('reports peer contracts and owners alongside existing dependency kinds', () => {
  expect(JSON.parse(runReport('--json'))).toEqual([
    { dependency: 'direct-package', kind: 'dependency', owner: 'core', layers: 'core', files: 1 },
    { dependency: 'optional-package', kind: 'optional', owner: 'core', layers: 'core', files: 1 },
    {
      dependency: 'optional-peer-package',
      kind: 'optional-peer',
      owner: 'shared',
      layers: 'core, providers',
      files: 2,
    },
    { dependency: 'peer-package', kind: 'peer', owner: 'core', layers: 'core', files: 1 },
    {
      dependency: 'shared-package',
      kind: 'dependency+peer',
      owner: 'core',
      layers: 'core',
      files: 1,
    },
    { dependency: 'unused-peer', kind: 'peer', owner: 'unreferenced', layers: '-', files: 0 },
  ]);
});

it('keeps genuinely undeclared imports outside the table without misclassifying peers', () => {
  const output = runReport();
  expect(output).toContain(
    '| optional-peer-package | optional-peer | shared | core, providers | 2 |',
  );
  expect(output.split('Imported packages outside root runtime dependencies:\n')[1]).toBe(
    '- dev-only: core\n- metadata-only: core\n- missing-package: core\n',
  );
});

it('treats peers as required when optional metadata is absent', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8'));
  delete manifest.peerDependenciesMeta;
  write('package.json', JSON.stringify(manifest));

  const rows = JSON.parse(runReport('--json'));
  expect(
    rows.find((row: { dependency: string }) => row.dependency === 'optional-peer-package'),
  ).toEqual(expect.objectContaining({ kind: 'peer', owner: 'shared', files: 2 }));
});
