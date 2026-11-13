// Run with Docker/Buildx available: node scripts/testDockerBuildContext.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-docker-context-'));
const context = path.join(temporaryDir, 'context');
const output = path.join(temporaryDir, 'output');
const excluded = [
  'node_modules/host-package/index.js',
  'src/app/node_modules/host-package/index.js',
  'src/app/deep/node_modules/host-package/index.js',
  '.env',
  'src/app/.env.local',
  'src/providers/deep/.env.production',
  'debug.log',
  'src/app/npm-debug.log',
  'src/app/.DS_Store',
  'src/app/editor.swp',
  'test/__fixtures__/mock-packages/node_modules/@test/cjs-pkg/.env',
  'test/__fixtures__/mock-packages/node_modules/@test/cjs-pkg/debug.log',
  'dist/generated.js',
  'site/package.json',
  'examples/promptfooconfig.yaml',
  '.worktrees/other/src/index.ts',
];
const included = [
  'package.json',
  'package-lock.json',
  'src/app/package.json',
  'src/index.ts',
  'test/__fixtures__/mock-packages/node_modules/@test/cjs-pkg/lib/index.js',
  'test/__fixtures__/mock-packages/node_modules/@test/cjs-pkg/package.json',
  'test/__fixtures__/mock-packages/node_modules/@test/esm-only-pkg/dist/index.js',
  'test/__fixtures__/mock-packages/node_modules/@test/esm-only-pkg/package.json',
];

try {
  fs.mkdirSync(context);
  fs.copyFileSync(path.join(root, '.dockerignore'), path.join(context, '.dockerignore'));
  fs.writeFileSync(path.join(context, 'Dockerfile'), 'FROM scratch\nCOPY . /\n');
  for (const filename of [...excluded, ...included]) {
    const target = path.join(context, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `Harmless Docker context fixture: ${filename}\n`);
  }

  // Exercise Docker's matcher without downloading images or running application code.
  execFileSync(
    'docker',
    [
      'buildx',
      'build',
      '--no-cache',
      '--network=none',
      '--progress=plain',
      '--output',
      `type=local,dest=${output}`,
      context,
    ],
    { stdio: 'inherit', timeout: 60_000 },
  );

  const leaked = excluded.filter((filename) => fs.existsSync(path.join(output, filename)));
  const missing = included.filter((filename) => !fs.existsSync(path.join(output, filename)));
  assert.deepEqual(leaked, [], `Local files entered the Docker context: ${leaked.join(', ')}`);
  assert.deepEqual(missing, [], `Required build fixtures were excluded: ${missing.join(', ')}`);
  console.log('Docker context excludes local files and retains build fixtures');
} finally {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
}
