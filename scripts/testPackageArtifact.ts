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
const drizzleDir = path.join(ROOT, 'drizzle');
const requiredPackagedPaths = [
  'dist/drizzle/meta/_journal.json',
  'dist/src/app/index.html',
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
  'dist/src/tableOutput.html',
  'dist/src/tracing/proto/opentelemetry/proto/collector/trace/v1/trace_service.proto',
  'dist/src/tracing/proto/opentelemetry/proto/common/v1/common.proto',
  'dist/src/tracing/proto/opentelemetry/proto/resource/v1/resource.proto',
  'dist/src/tracing/proto/opentelemetry/proto/trace/v1/trace.proto',
];

function listFiles(rootDir: string): string[] {
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }

    return [path.relative(ROOT, fullPath).split(path.sep).join('/')];
  });
}

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

function runNpm(args: string[], cwd: string, envOverrides: NodeJS.ProcessEnv = {}): string {
  assert(process.env.npm_execpath, 'Expected npm_execpath when running package artifact test');
  return run(process.execPath, [process.env.npm_execpath, ...args], cwd, envOverrides);
}

function assertPackagedFiles(packResult: PackResult): void {
  const packagedPaths = new Set(packResult.files.map((file) => file.path));
  const missingPaths = requiredPackagedPaths.filter((file) => !packagedPaths.has(file));
  const missingDrizzleFiles = listFiles(drizzleDir)
    .filter((file) => !file.endsWith('.md') && !file.includes('AGENTS') && !file.includes('CLAUDE'))
    .map((file) => `dist/${file}`)
    .filter((file) => !packagedPaths.has(file));
  const missingWebAppFiles = listFiles(path.join(ROOT, 'dist', 'src', 'app'))
    .filter((file) => !file.endsWith('.map'))
    .filter((file) => !packagedPaths.has(file));

  assert.deepEqual(missingPaths, [], `Missing packaged runtime assets: ${missingPaths.join(', ')}`);
  assert.deepEqual(
    missingDrizzleFiles,
    [],
    `Missing packaged Drizzle files: ${missingDrizzleFiles.join(', ')}`,
  );
  assert.deepEqual(
    missingWebAppFiles,
    [],
    `Missing packaged web app files: ${missingWebAppFiles.join(', ')}`,
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

  for (const executablePath of ['dist/src/entrypoint.js', 'dist/src/main.js']) {
    const executable = packResult.files.find((file) => file.path === executablePath);
    assert(executable, `Missing packaged CLI executable: ${executablePath}`);
    assert(
      executable.mode & 0o111,
      `Packaged CLI executable should be executable: ${executablePath}`,
    );
  }
}

function assertInstalledWebApp(installedPackageDir: string): void {
  const webAppDir = path.join(installedPackageDir, 'dist', 'src', 'app');
  const indexHtml = fs.readFileSync(path.join(webAppDir, 'index.html'), 'utf8');
  const localAssetPaths = [...indexHtml.matchAll(/\b(?:href|src)="\/([^"]+)"/g)].map(
    ([, assetPath]) => assetPath.split(/[?#]/, 1)[0],
  );

  assert(localAssetPaths.length > 0, 'Expected packaged web app index to reference local assets');
  assert(
    localAssetPaths.some((assetPath) => assetPath.endsWith('.js')),
    'Expected packaged web app index to reference a JavaScript entrypoint',
  );
  assert(
    localAssetPaths.some((assetPath) => assetPath.endsWith('.css')),
    'Expected packaged web app index to reference a stylesheet',
  );

  const missingAssets = localAssetPaths.filter(
    (assetPath) => !fs.existsSync(path.join(webAppDir, assetPath)),
  );
  assert.deepEqual(
    missingAssets,
    [],
    `Missing packaged web app assets: ${missingAssets.join(', ')}`,
  );
}

function runInstalledBinVersion(consumerDir: string, configDir: string, binName: string): string {
  const binPath = path.join(
    consumerDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${binName}.cmd` : binName,
  );
  assert(fs.existsSync(binPath), `Missing installed ${binName} bin: ${binPath}`);
  const envOverrides = {
    PROMPTFOO_CONFIG_DIR: configDir,
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: 'true',
  };

  if (process.platform === 'win32') {
    return run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `"${binPath}" --version`],
      consumerDir,
      envOverrides,
    );
  }

  return run(binPath, ['--version'], consumerDir, envOverrides);
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
  const configDir = path.join(tempDir, 'config');
  const consumerDir = path.join(tempDir, 'consumer');
  const consumerNpmrc = path.join(tempDir, 'consumer.npmrc');

  try {
    fs.mkdirSync(artifactsDir);
    fs.mkdirSync(configDir);
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(consumerNpmrc, '');

    const packOutput = runNpm(
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
    runNpm(
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
      { npm_config_userconfig: consumerNpmrc },
    );

    const installedPackageDir = path.join(consumerDir, 'node_modules', 'promptfoo');
    const installedPackageJson = JSON.parse(
      fs.readFileSync(path.join(installedPackageDir, 'package.json'), 'utf8'),
    ) as { version: string };
    assert.equal(installedPackageJson.version, packResult.version);

    writeConsumerScripts(consumerDir);
    run(process.execPath, ['import-package.mjs'], consumerDir);
    run(process.execPath, ['require-package.cjs'], consumerDir);
    assertInstalledWebApp(installedPackageDir);

    for (const binName of ['promptfoo', 'pf']) {
      assert.equal(
        runInstalledBinVersion(consumerDir, configDir, binName).trim(),
        packResult.version,
      );
    }

    console.log(`Verified installed package artifact: ${packResult.filename}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
