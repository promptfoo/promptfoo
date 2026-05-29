import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type PackFile = {
  mode: number;
  path: string;
  size: number;
};

type PackResult = {
  files: PackFile[];
  filename: string;
  name: string;
  version: string;
};

const ROOT = path.resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const requiredPackagedPaths = [
  'dist/drizzle/meta/_journal.json',
  'dist/src/entrypoint.js',
  'dist/src/golang/wrapper.go',
  'dist/src/index.cjs',
  'dist/src/index.d.ts',
  'dist/src/index.js',
  'dist/src/main.js',
  'dist/src/package.json',
  'dist/src/python/persistent_wrapper.py',
  'dist/src/python/wrapper.py',
  'dist/src/ruby/wrapper.rb',
  'dist/src/server/golang/wrapper.go',
  'dist/src/server/index.js',
  'dist/src/server/python/persistent_wrapper.py',
  'dist/src/server/python/wrapper.py',
  'dist/src/server/ruby/wrapper.rb',
];

function run(
  command: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
): string {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        ...envOverrides,
      },
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string') {
      throw new Error(`${error.message}\n${error.stderr}`);
    }
    throw error;
  }
}

function assertPackagedFiles(packResult: PackResult): void {
  const packagedPaths = new Set(packResult.files.map((file) => file.path));
  const missingPaths = requiredPackagedPaths.filter((file) => !packagedPaths.has(file));

  assert.deepEqual(missingPaths, [], `Missing packaged runtime assets: ${missingPaths.join(', ')}`);
  assert(
    packResult.files.some((file) => /^dist\/drizzle\/[^/]+\.sql$/.test(file.path)),
    'Expected packaged Drizzle migrations',
  );
  assert(
    packResult.files.every((file) => !file.path.endsWith('.map')),
    'Source maps should be excluded from the package',
  );
  assert(
    packResult.files.every((file) => !file.path.startsWith('dist/test/')),
    'Compiled tests should be excluded from the package',
  );
  assert(
    packResult.files.every((file) => !file.path.startsWith('dist/src/__mocks__/')),
    'Compiled mocks should be excluded from the package',
  );

  const entrypoint = packResult.files.find((file) => file.path === 'dist/src/entrypoint.js');
  assert(entrypoint, 'Missing packaged CLI entrypoint');
  assert(entrypoint.mode & 0o111, 'Packaged CLI entrypoint should be executable');
}

function writeConsumerScripts(consumerDir: string): void {
  fs.writeFileSync(
    path.join(consumerDir, 'import-package.mjs'),
    [
      "import { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } from 'promptfoo';",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected ESM schema export');",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'require-package.cjs'),
    [
      "const { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } = require('promptfoo');",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected CJS schema export');",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
}

function main(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-package-artifact-'));
  const artifactsDir = path.join(tempDir, 'artifacts');
  const consumerDir = path.join(tempDir, 'consumer');
  const consumerNpmrc = path.join(tempDir, 'consumer.npmrc');

  try {
    fs.mkdirSync(artifactsDir);
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(consumerNpmrc, '');

    const packOutput = run(
      npmCommand,
      ['pack', '--ignore-scripts', '--json', '--pack-destination', artifactsDir],
      ROOT,
    );
    const packResults = JSON.parse(packOutput) as PackResult[];
    assert.equal(packResults.length, 1, 'Expected npm pack to produce one artifact');

    const [packResult] = packResults;
    assert.equal(packResult.name, 'promptfoo');
    assertPackagedFiles(packResult);

    const tarballPath = path.join(artifactsDir, packResult.filename);
    assert(fs.existsSync(tarballPath), `Missing tarball: ${tarballPath}`);

    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'promptfoo-package-artifact-consumer',
        private: true,
        type: 'module',
      }),
    );
    run(
      npmCommand,
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        '--registry=https://registry.npmjs.org/',
        tarballPath,
      ],
      consumerDir,
      {
        npm_config_engine_strict: 'false',
        npm_config_userconfig: consumerNpmrc,
      },
    );

    const installedPackageDir = path.join(consumerDir, 'node_modules', 'promptfoo');
    const installedPackageJson = JSON.parse(
      fs.readFileSync(path.join(installedPackageDir, 'package.json'), 'utf8'),
    ) as { version: string };
    assert.equal(installedPackageJson.version, packResult.version);

    writeConsumerScripts(consumerDir);
    run(process.execPath, ['import-package.mjs'], consumerDir);
    run(process.execPath, ['require-package.cjs'], consumerDir);

    const binPath = path.join(
      consumerDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'promptfoo.cmd' : 'promptfoo',
    );
    assert(fs.existsSync(binPath), `Missing installed promptfoo bin: ${binPath}`);

    const versionOutput = run(
      process.execPath,
      [path.join(installedPackageDir, 'dist', 'src', 'entrypoint.js'), '--version'],
      consumerDir,
    );
    assert.equal(versionOutput.trim(), packResult.version);

    console.log(`Verified installed package artifact: ${packResult.filename}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
