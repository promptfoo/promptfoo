import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  computePackageArtifactReadinessReport,
  findPackageCandidateExportViolations,
  getPackageCandidateSpecifier,
  readPackageCandidateConfig,
  resolvePackageArtifactPath,
} from './packageReadiness';
import { shouldCopyDrizzlePath } from './postbuild';

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
  'dist/src/contracts.cjs',
  'dist/src/contracts.d.cts',
  'dist/src/contracts.d.ts',
  'dist/src/contracts.js',
  'dist/src/index.cjs',
  'dist/src/index.d.ts',
  'dist/src/index.js',
  'dist/src/main.js',
  'dist/src/package.json',
  'dist/src/provider-plugin.cjs',
  'dist/src/provider-plugin.d.cts',
  'dist/src/provider-plugin.d.ts',
  'dist/src/provider-plugin.js',
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
    if (error instanceof Error) {
      const details = [error.message];
      if ('stdout' in error && typeof error.stdout === 'string' && error.stdout.length > 0) {
        details.push(`stdout:\n${error.stdout}`);
      }
      if (
        'stderr' in error &&
        typeof error.stderr === 'string' &&
        error.stderr.length > 0 &&
        !error.message.includes(error.stderr)
      ) {
        details.push(`stderr:\n${error.stderr}`);
      }
      throw new Error(details.join('\n'), { cause: error });
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
    .filter(shouldCopyDrizzlePath)
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
  assert(
    packResult.files.every((file) => file.path !== 'dist/tsconfig.tsbuildinfo'),
    'TypeScript incremental build metadata should be excluded from the package',
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

/**
 * Asserts every file path declared in the installed package's `exports` and `typesVersions`
 * resolves to a real file. The consumer `tsc` checks can't catch a wrong declared `types` path on
 * their own — TypeScript falls through to the `default` condition and auto-discovers the sibling
 * `.d.ts` — so validate the declared paths directly here.
 */
function assertExportsResolve(
  installedPackageDir: string,
  manifest: {
    exports?: unknown;
    typesVersions?: Record<string, Record<string, string[]>>;
  },
): void {
  const referencedPaths = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith('.')) {
        referencedPaths.add(value);
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) {
        collect(nested);
      }
    }
  };
  collect(manifest.exports);
  for (const subpaths of Object.values(manifest.typesVersions ?? {})) {
    for (const candidatePaths of Object.values(subpaths)) {
      for (const candidatePath of candidatePaths) {
        referencedPaths.add(candidatePath);
      }
    }
  }

  assert(
    referencedPaths.size > 0,
    'Expected the installed package manifest to declare export paths',
  );
  const missing = [...referencedPaths].filter(
    (relativePath) => !fs.existsSync(path.join(installedPackageDir, relativePath)),
  );
  assert.deepEqual(
    missing,
    [],
    `Installed package exports reference missing files: ${missing.join(', ')}`,
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

function writeConsumerScripts(consumerDir: string, candidateSpecifiers: string[]): void {
  fs.writeFileSync(
    path.join(consumerDir, 'import-package.mjs'),
    [
      "import { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } from 'promptfoo';",
      "import { EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, hasFunctionToolCallValidator } from 'promptfoo/contracts';",
      "import { PROVIDER_PLUGIN_API_VERSION, ProviderPluginRegistry } from 'promptfoo/provider-plugin';",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected ESM schema export');",
      '  }',
      '}',
      'if (!hasFunctionToolCallValidator({ validateFunctionToolCall() {} })) {',
      "  throw new Error('Missing expected ESM provider capability export');",
      '}',
      'if (PROVIDER_PLUGIN_API_VERSION !== 1 || typeof ProviderPluginRegistry !== "function") {',
      "  throw new Error('Missing expected ESM provider plugin export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'require-package.cjs'),
    [
      "const { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } = require('promptfoo');",
      "const { EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, hasFunctionToolCallValidator } = require('promptfoo/contracts');",
      "const { PROVIDER_PLUGIN_API_VERSION, ProviderPluginRegistry } = require('promptfoo/provider-plugin');",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected CJS schema export');",
      '  }',
      '}',
      'if (!hasFunctionToolCallValidator({ validateFunctionToolCall() {} })) {',
      "  throw new Error('Missing expected CJS provider capability export');",
      '}',
      'if (PROVIDER_PLUGIN_API_VERSION !== 1 || typeof ProviderPluginRegistry !== "function") {',
      "  throw new Error('Missing expected CJS provider plugin export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'mixed-provider-plugin.mjs'),
    [
      "import { createRequire } from 'node:module';",
      "import { loadApiProvider } from 'promptfoo';",
      "import { MissingProviderPackageError as EsmMissingProviderPackageError, ProviderPluginLoadError as EsmProviderPluginLoadError, ProviderPluginRegistry as EsmProviderPluginRegistry } from 'promptfoo/provider-plugin';",
      '',
      'const require = createRequire(import.meta.url);',
      "const cjsPromptfoo = require('promptfoo');",
      "const { MissingProviderPackageError: CjsMissingProviderPackageError, PROVIDER_PLUGIN_API_VERSION, ProviderPluginLoadError: CjsProviderPluginLoadError, ProviderPluginRegistry: CjsProviderPluginRegistry, registerProviderPlugin } = require('promptfoo/provider-plugin');",
      "if (typeof cjsPromptfoo.loadApiProvider !== 'function') {",
      "  throw new Error('CommonJS root entrypoint failed to load beside the ESM root');",
      '}',
      'const dispose = registerProviderPlugin({',
      '  apiVersion: PROVIDER_PLUGIN_API_VERSION,',
      "  name: 'artifact-mixed-format',",
      "  canHandle: (providerPath) => providerPath.startsWith('artifact-mixed:'),",
      '  load: async () => [{',
      "    test: (providerPath) => providerPath.startsWith('artifact-mixed:'),",
      '    create: async () => ({',
      "      id: () => 'artifact-mixed-format',",
      "      callApi: async () => ({ output: 'mixed-format-ok' }),",
      '    }),',
      '  }],',
      '});',
      '',
      'try {',
      "  const provider = await loadApiProvider('artifact-mixed:model');",
      "  if (provider.id() !== 'artifact-mixed-format') {",
      "    throw new Error('CommonJS plugin registration was invisible to the ESM host');",
      '  }',
      '} finally {',
      '  dispose();',
      '}',
      '',
      "const missingCause = Object.assign(new Error(\"Cannot find package '@example/provider-missing' imported from /tmp/artifact-plugin.js\"), { code: 'ERR_MODULE_NOT_FOUND' });",
      'const createMissingManifest = (name) => ({',
      '  apiVersion: PROVIDER_PLUGIN_API_VERSION,',
      '  name,',
      "  packageName: '@example/provider-missing',",
      '  canHandle: (providerPath) => providerPath.startsWith(`${name}:`),',
      '  load: async () => { throw missingCause; },',
      '});',
      'const captureError = async (registry, providerPath) => {',
      '  try {',
      '    await registry.getFactories(providerPath, []);',
      '  } catch (error) {',
      '    return error;',
      '  }',
      "  throw new Error('Expected provider plugin load to fail');",
      '};',
      "const esmError = await captureError(new EsmProviderPluginRegistry([createMissingManifest('artifact-esm-missing')]), 'artifact-esm-missing:model');",
      "const cjsError = await captureError(new CjsProviderPluginRegistry([createMissingManifest('artifact-cjs-missing')]), 'artifact-cjs-missing:model');",
      'for (const error of [esmError, cjsError]) {',
      '  if (!(error instanceof EsmMissingProviderPackageError) || !(error instanceof CjsMissingProviderPackageError) || !(error instanceof EsmProviderPluginLoadError) || !(error instanceof CjsProviderPluginLoadError)) {',
      "    throw new Error('Provider plugin errors were not recognizable across ESM/CommonJS');",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'import-contracts.ts'),
    [
      "import { GetUserResponseSchema, PromptSchema, hasFunctionToolCallValidator, isTransformFunction } from 'promptfoo/contracts';",
      "import type { BlobRef, FunctionToolCallValidator, GetUserResponse, Prompt, ProviderResponse, TransformFunction } from 'promptfoo/contracts';",
      "import { PROVIDER_PLUGIN_API_VERSION, ProviderPluginRegistry } from 'promptfoo/provider-plugin';",
      "import type { ProviderPluginManifest } from 'promptfoo/provider-plugin';",
      '',
      "const prompt: Prompt = { label: 'Greeting', raw: 'Hello, world!' };",
      'const transform: TransformFunction<string, string> = (output) => output;',
      "const user: GetUserResponse = { email: 'user@example.com' };",
      'const validator: FunctionToolCallValidator = { validateFunctionToolCall() {} };',
      "const blobRef: BlobRef = { hash: 'abc123', mimeType: 'image/png', provider: 'filesystem', sizeBytes: 3, uri: 'promptfoo://blob/abc123' };",
      "const response: ProviderResponse = { images: [{ blobRef }], output: 'ok' };",
      '',
      'GetUserResponseSchema.parse(user);',
      'PromptSchema.parse(prompt);',
      'void response;',
      'const registry = new ProviderPluginRegistry();',
      "const manifest: ProviderPluginManifest = { apiVersion: PROVIDER_PLUGIN_API_VERSION, name: 'consumer', canHandle: () => false, load: async () => [] };",
      'registry.register(manifest);',
      'if (!isTransformFunction(transform) || !hasFunctionToolCallValidator(validator)) {',
      "  throw new Error('Missing expected TypeScript contracts export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
      },
      include: ['import-contracts.ts'],
    }),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.legacy.json'),
    JSON.stringify({
      compilerOptions: {
        ignoreDeprecations: '6.0',
        module: 'CommonJS',
        moduleResolution: 'node',
        noEmit: true,
        strict: true,
      },
      include: ['import-contracts.ts'],
    }),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'require-contracts.cts'),
    [
      "import contracts = require('promptfoo/contracts');",
      '',
      "const prompt: contracts.Prompt = { label: 'Greeting', raw: 'Hello, world!' };",
      "const user: contracts.GetUserResponse = { email: 'user@example.com' };",
      'const validator: contracts.FunctionToolCallValidator = { validateFunctionToolCall() {} };',
      "const blobRef: contracts.BlobRef = { hash: 'abc123', mimeType: 'image/png', provider: 'filesystem', sizeBytes: 3, uri: 'promptfoo://blob/abc123' };",
      "const response: contracts.ProviderResponse = { images: [{ blobRef }], output: 'ok' };",
      'contracts.GetUserResponseSchema.parse(user);',
      'contracts.PromptSchema.parse(prompt);',
      'void response;',
      'if (!contracts.hasFunctionToolCallValidator(validator)) {',
      "  throw new Error('Missing expected CommonJS TypeScript contracts export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.node16-cjs.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'Node16',
        moduleResolution: 'Node16',
        noEmit: true,
        strict: true,
      },
      include: ['require-contracts.cts'],
    }),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'candidate-entrypoints.mjs'),
    [
      `const specifiers = ${JSON.stringify(candidateSpecifiers)};`,
      'for (const specifier of specifiers) {',
      '  const candidate = await import(specifier);',
      '  if (Object.keys(candidate).length === 0) {',
      "    throw new Error(`Candidate entrypoint '${specifier}' has no ESM exports`);",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'candidate-entrypoints.cjs'),
    [
      `const specifiers = ${JSON.stringify(candidateSpecifiers)};`,
      'for (const specifier of specifiers) {',
      '  const candidate = require(specifier);',
      '  if (Object.keys(candidate).length === 0) {',
      "    throw new Error(`Candidate entrypoint '${specifier}' has no CommonJS exports`);",
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'candidate-entrypoints.ts'),
    [
      ...candidateSpecifiers.map(
        (specifier, index) => `import * as candidate${index} from '${specifier}';`,
      ),
      '',
      ...candidateSpecifiers.map((_specifier, index) => `void candidate${index};`),
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'candidate-entrypoints.cts'),
    [
      ...candidateSpecifiers.map(
        (specifier, index) => `import candidate${index} = require('${specifier}');`,
      ),
      '',
      ...candidateSpecifiers.map((_specifier, index) => `void candidate${index};`),
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.candidates.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
      },
      include: ['candidate-entrypoints.ts'],
    }),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.candidates-cjs.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'Node16',
        moduleResolution: 'Node16',
        noEmit: true,
        strict: true,
      },
      include: ['candidate-entrypoints.cts'],
    }),
  );
}

function main(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-package-artifact-'));
  const artifactsDir = path.join(tempDir, 'artifacts');
  const configDir = path.join(tempDir, 'config');
  const consumerDir = path.join(tempDir, 'consumer');
  const consumerNpmrc = path.join(tempDir, 'consumer.npmrc');
  const tarballArgumentIndex = process.argv.indexOf('--tarball');
  const explicitTarball =
    tarballArgumentIndex === -1 ? undefined : process.argv[tarballArgumentIndex + 1];
  if (tarballArgumentIndex !== -1 && !explicitTarball) {
    throw new Error('--tarball requires a path to an existing package artifact.');
  }
  const explicitTarballPath = explicitTarball
    ? resolvePackageArtifactPath(ROOT, explicitTarball)
    : undefined;
  const candidateConfig = readPackageCandidateConfig(ROOT);
  const candidateSpecifiers = candidateConfig.candidates.flatMap((candidate) => {
    const specifier = getPackageCandidateSpecifier(candidate);
    return specifier ? [specifier] : [];
  });

  try {
    fs.mkdirSync(artifactsDir);
    fs.mkdirSync(configDir);
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(consumerNpmrc, '');

    const packOutput = explicitTarballPath
      ? runNpm(['pack', '--ignore-scripts', '--dry-run', '--json', explicitTarballPath], ROOT)
      : runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', artifactsDir], ROOT);
    let packResults: PackResult[];
    try {
      packResults = JSON.parse(packOutput) as PackResult[];
    } catch (error) {
      throw new Error(`Failed to parse npm pack JSON output:\n${packOutput}`, { cause: error });
    }
    assert.equal(packResults.length, 1, 'Expected npm pack to produce one artifact');

    const [packResult] = packResults;
    assert.equal(packResult.name, 'promptfoo');
    assertPackagedFiles(packResult);

    const tarballPath = explicitTarballPath ?? path.join(artifactsDir, packResult.filename);
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
      {
        npm_config_engine_strict: 'false',
        npm_config_userconfig: consumerNpmrc,
      },
    );

    const installedPackageDir = path.join(consumerDir, 'node_modules', 'promptfoo');
    const installedPackageJson = JSON.parse(
      fs.readFileSync(path.join(installedPackageDir, 'package.json'), 'utf8'),
    ) as {
      version: string;
      exports?: unknown;
      typesVersions?: Record<string, Record<string, string[]>>;
    };
    assert.equal(installedPackageJson.version, packResult.version);
    assertExportsResolve(installedPackageDir, installedPackageJson);
    const exportViolations = findPackageCandidateExportViolations(
      installedPackageJson.exports,
      candidateConfig.candidates,
    );
    assert.deepEqual(
      exportViolations,
      [],
      `Installed package candidate exports failed:\n${exportViolations.join('\n')}`,
    );
    const artifactReadiness = computePackageArtifactReadinessReport(
      installedPackageDir,
      candidateConfig.candidates,
    );
    assert.deepEqual(
      artifactReadiness.violations,
      [],
      `Installed package candidate budgets failed:\n${artifactReadiness.violations.join('\n')}`,
    );

    writeConsumerScripts(consumerDir, candidateSpecifiers);
    run(process.execPath, ['import-package.mjs'], consumerDir);
    run(process.execPath, ['require-package.cjs'], consumerDir);
    run(process.execPath, ['mixed-provider-plugin.mjs'], consumerDir);
    run(process.execPath, ['candidate-entrypoints.mjs'], consumerDir);
    run(process.execPath, ['candidate-entrypoints.cjs'], consumerDir);
    const tscPath = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const tsconfig of [
      'tsconfig.json',
      'tsconfig.legacy.json',
      'tsconfig.node16-cjs.json',
      'tsconfig.candidates.json',
      'tsconfig.candidates-cjs.json',
    ]) {
      run(process.execPath, [tscPath, '--project', tsconfig], consumerDir);
    }
    assertInstalledWebApp(installedPackageDir);

    for (const binName of ['promptfoo', 'pf']) {
      assert.equal(
        runInstalledBinVersion(consumerDir, configDir, binName).trim(),
        packResult.version,
      );
    }

    console.log(`Verified installed package artifact: ${path.basename(tarballPath)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
