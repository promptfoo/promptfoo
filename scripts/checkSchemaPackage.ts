import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const WORKSPACE_NAME = '@promptfoo/schema';
const SHOULD_BUILD = !process.argv.includes('--skip-build');

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
}

function runForOutput(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-schema-package-'));
const packDir = path.join(tempRoot, 'pack');
const consumerDir = path.join(tempRoot, 'consumer');

try {
  fs.mkdirSync(packDir);
  fs.mkdirSync(consumerDir);

  if (SHOULD_BUILD) {
    run('npm', ['run', 'build', '--workspace', WORKSPACE_NAME], ROOT);
  }

  const packResult = JSON.parse(
    runForOutput(
      'npm',
      ['pack', '--json', '--workspace', WORKSPACE_NAME, '--pack-destination', packDir],
      ROOT,
    ),
  ) as Array<{ filename: string; files: Array<{ path: string }> }>;
  const packageInfo = packResult[0];
  assert(packageInfo, 'npm pack did not return package metadata');

  const packedFiles = new Set(packageInfo.files.map((file) => file.path));
  for (const expectedFile of ['dist/esm/index.js', 'dist/esm/index.d.ts', 'dist/cjs/index.cjs']) {
    assert(packedFiles.has(expectedFile), `Packed tarball is missing ${expectedFile}`);
  }
  assert(
    [...packedFiles].every((filePath) => !filePath.startsWith('src/')),
    'Packed tarball should contain built artifacts, not source files',
  );
  assert(
    [...packedFiles].every((filePath) => !filePath.endsWith('.map')),
    'Packed tarball should not contain source maps',
  );

  const tarballPath = path.join(packDir, packageInfo.filename);
  writeJson(path.join(consumerDir, 'package.json'), {
    name: 'schema-package-smoke',
    private: true,
    type: 'module',
  });

  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--registry=https://registry.npmjs.org/',
      tarballPath,
    ],
    consumerDir,
  );

  run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      [
        "import { InputTypeSchema, PromptSchema, isTransformFunction } from '@promptfoo/schema';",
        "PromptSchema.parse({ raw: 'hello', label: 'hello' });",
        "if (InputTypeSchema.parse('text') !== 'text') throw new Error('bad input schema');",
        "if (!isTransformFunction((value) => value)) throw new Error('bad transform guard');",
      ].join('\n'),
    ],
    consumerDir,
  );

  run(
    process.execPath,
    [
      '--eval',
      [
        "const { InputTypeSchema, PromptSchema, isTransformFunction } = require('@promptfoo/schema');",
        "PromptSchema.parse({ raw: 'hello', label: 'hello' });",
        "if (InputTypeSchema.parse('text') !== 'text') throw new Error('bad input schema');",
        "if (!isTransformFunction((value) => value)) throw new Error('bad transform guard');",
      ].join('\n'),
    ],
    consumerDir,
  );

  fs.writeFileSync(
    path.join(consumerDir, 'index.ts'),
    [
      "import { InputTypeSchema, type TransformFunction } from '@promptfoo/schema';",
      '',
      'const trim: TransformFunction<string, string> = (value) => value.trim();',
      "const inputType = InputTypeSchema.parse('text');",
      'void [trim, inputType];',
      '',
    ].join('\n'),
  );
  writeJson(path.join(consumerDir, 'tsconfig.json'), {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['index.ts'],
  });

  run(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['--project', 'tsconfig.json'], consumerDir);
} finally {
  fs.rmSync(tempRoot, { force: true, recursive: true });
}
