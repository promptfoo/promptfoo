import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { satisfies } from 'semver';
import { assertBuiltAssetsPackaged } from './packPackageArtifact';

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

type ArtifactEvalOutput = {
  results?: {
    results?: Array<{
      error?: string;
      response?: {
        error?: string;
        output?: unknown;
      };
      success?: boolean;
      score?: number;
    }>;
  };
};

const ROOT = path.resolve(import.meta.dirname, '..');
// The August 2026 undici advisories were fixed in 6.28.0, 7.29.0 and 8.9.0. Keep this in sync
// with PATCHED_UNDICI_RANGE in test/package-manifests.test.ts.
const PATCHED_UNDICI_RANGE = '^6.28.0 || ^7.29.0 || >=8.9.0';
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
  'dist/src/index.d.cts',
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

function run(
  command: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
  options: { shell?: string } = {},
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
      shell: options.shell,
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

async function runAsync(
  command: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          ...envOverrides,
        },
        maxBuffer: 128 * 1024 * 1024,
        timeout: 60_000,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }

        const details = [error.message];
        if (stdout.length > 0) {
          details.push(`stdout:\n${stdout}`);
        }
        if (stderr.length > 0 && !error.message.includes(stderr)) {
          details.push(`stderr:\n${stderr}`);
        }
        reject(new Error(details.join('\n'), { cause: error }));
      },
    );
  });
}

function runNpm(args: string[], cwd: string, envOverrides: NodeJS.ProcessEnv = {}): string {
  assert(process.env.npm_execpath, 'Expected npm_execpath when running package artifact test');
  return run(process.execPath, [process.env.npm_execpath, ...args], cwd, envOverrides);
}

function assertPackagedFiles(packResult: PackResult, compareSource: boolean): void {
  const packagedPaths = new Set(packResult.files.map((file) => file.path));
  const missingPaths = requiredPackagedPaths.filter((file) => !packagedPaths.has(file));
  assert.deepEqual(missingPaths, [], `Missing packaged runtime assets: ${missingPaths.join(', ')}`);
  if (compareSource) {
    assertBuiltAssetsPackaged(ROOT, packResult.files);
  }
  assert(
    packResult.files.every((file) => !file.path.endsWith('.tsbuildinfo')),
    'TypeScript incremental build state should be excluded from the package',
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

/**
 * The ref parser fetches remote `$ref`s through its own nested undici, and consumers install
 * from the published tarball rather than this repo's lockfile — so the version they actually
 * resolve is only observable here. Asserting it against the parser's declared range would be a
 * tautology (npm cannot install outside it); the patched floor per undici major is the check
 * that can fail.
 */
function assertInstalledRefParserTransport(installedPackageDir: string): void {
  const packageRequire = createRequire(path.join(installedPackageDir, 'package.json'));
  const parserRequire = createRequire(
    packageRequire.resolve('@apidevtools/json-schema-ref-parser/package.json'),
  );
  const transportManifest = JSON.parse(
    fs.readFileSync(parserRequire.resolve('undici/package.json'), 'utf8'),
  ) as { version: string };

  assert(
    satisfies(transportManifest.version, PATCHED_UNDICI_RANGE),
    `Installed ref parser resolved vulnerable undici ${transportManifest.version}`,
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
    // Let Node construct cmd.exe's outer quotes and verbatim arguments. The
    // executable path is quoted here because the owned temp directory may have spaces.
    return run(`"${binPath}"`, ['--version'], consumerDir, envOverrides, {
      shell: process.env.ComSpec || 'cmd.exe',
    });
  }

  return run(binPath, ['--version'], consumerDir, envOverrides);
}

function writeConsumerScripts(consumerDir: string): void {
  fs.writeFileSync(
    path.join(consumerDir, 'import-package.mjs'),
    [
      "import { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } from 'promptfoo';",
      "import { EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, hasFunctionToolCallValidator } from 'promptfoo/contracts';",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected ESM schema export');",
      '  }',
      '}',
      'if (!hasFunctionToolCallValidator({ validateFunctionToolCall() {} })) {',
      "  throw new Error('Missing expected ESM provider capability export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'require-package.cjs'),
    [
      "const { AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema } = require('promptfoo');",
      "const { EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, hasFunctionToolCallValidator } = require('promptfoo/contracts');",
      '',
      'for (const value of [AssertionSchema, AtomicTestCaseSchema, EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, TestSuiteSchema]) {',
      "  if (!value || typeof value.safeParse !== 'function') {",
      "    throw new Error('Missing expected CJS schema export');",
      '  }',
      '}',
      'if (!hasFunctionToolCallValidator({ validateFunctionToolCall() {} })) {',
      "  throw new Error('Missing expected CJS provider capability export');",
      '}',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'import-contracts.ts'),
    [
      "import { GetUserResponseSchema, PromptSchema, hasFunctionToolCallValidator, isTransformFunction } from 'promptfoo/contracts';",
      "import type { BlobRef, FunctionToolCallValidator, GetUserResponse, Prompt, ProviderResponse, TransformFunction } from 'promptfoo/contracts';",
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
      'if (!isTransformFunction(transform) || !hasFunctionToolCallValidator(validator)) {',
      "  throw new Error('Missing expected TypeScript contracts export');",
      '}',
      '',
    ].join('\n'),
  );
  // The root API exposes Eval's ORM methods. Drizzle's declarations pull unrelated optional
  // database drivers and have upstream type errors; check caller code with skipLibCheck while
  // keeping the portable contracts checks above fully strict.
  for (const [mode, module] of [
    ['esm', 'NodeNext'],
    ['cjs', 'Node16'],
  ]) {
    fs.writeFileSync(
      path.join(consumerDir, `tsconfig.api-${mode}.json`),
      JSON.stringify({
        compilerOptions: {
          module,
          moduleResolution: module,
          noEmit: true,
          strict: true,
          skipLibCheck: true,
        },
        include: [mode === 'esm' ? 'import-api.ts' : 'require-api.cts'],
      }),
    );
  }
  const apiTypesBody = [
    "const provider: ApiProvider = { id: () => 'local', callApi: async (prompt) => ({ output: prompt }) };",
    "const suite: EvaluateTestSuite = { prompts: ['hello'], providers: [provider], tests: [{ assert: [{ type: 'equals', value: 'hello' }] }], writeLatestResults: false };",
    'async function consume() {',
    '  const record = await evaluate(suite, { cache: false });',
    '  const summary = await record.toEvaluateSummary();',
    '  const successes: number = summary.stats.successes;',
    '  const id: string = record.id;',
    '  void successes; void id;',
    '  // @ts-expect-error Eval keeps its typed result surface',
    '  await record.nonexistentMethod();',
    '  // @ts-expect-error success counts remain numeric',
    "  const invalid: typeof summary.stats.successes = 'wrong';",
    '  void invalid;',
    '}',
    'void consume;',
    '// @ts-expect-error providers are a required part of the public eval input',
    "void evaluate({ prompts: ['hello'] });",
  ].join('\n');
  fs.writeFileSync(
    path.join(consumerDir, 'import-api.ts'),
    [
      "import { evaluate } from 'promptfoo';",
      "import type { ApiProvider, EvaluateTestSuite } from 'promptfoo';",
      apiTypesBody,
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'require-api.cts'),
    [
      "import api = require('promptfoo');",
      'const { evaluate } = api;',
      'type ApiProvider = api.ApiProvider;',
      'type EvaluateTestSuite = api.EvaluateTestSuite;',
      apiTypesBody,
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
}

async function runInstalledCompressionEval(consumerDir: string, configDir: string): Promise<void> {
  const expectedOutput = 'compressed response';
  const requestedPaths: string[] = [];
  const server = createServer((request, response) => {
    const requestPath = request.url;
    if (requestPath !== '/gzip' && requestPath !== '/br') {
      response.writeHead(404).end();
      return;
    }

    const encoding = requestPath === '/gzip' ? 'gzip' : 'br';
    requestedPaths.push(requestPath);
    const rawBody = Buffer.from(JSON.stringify({ output: expectedOutput }));
    const body = encoding === 'gzip' ? gzipSync(rawBody) : brotliCompressSync(rawBody);
    response.writeHead(200, {
      'content-encoding': encoding,
      'content-length': String(body.length),
      'content-type': 'application/json',
    });
    response.end(body);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    assert(address && typeof address !== 'string', 'Failed to bind compressed response server');

    const configPath = path.join(consumerDir, 'promptfooconfig.json');
    const outputPath = path.join(consumerDir, 'compression-results.json');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          prompts: ['compression artifact test'],
          providers: ['gzip', 'br'].map((encoding) => ({
            id: `${baseUrl}/${encoding}`,
            config: {
              maxRetries: 0,
              method: 'GET',
              transformResponse: 'json.output',
            },
          })),
          tests: [
            {
              assert: [{ type: 'equals', value: expectedOutput }],
            },
          ],
        },
        null,
        2,
      ),
    );

    const entrypointPath = path.join(
      consumerDir,
      'node_modules',
      'promptfoo',
      'dist',
      'src',
      'entrypoint.js',
    );
    assert(
      fs.existsSync(entrypointPath),
      `Missing installed promptfoo entrypoint: ${entrypointPath}`,
    );

    await runAsync(
      process.execPath,
      [
        entrypointPath,
        'eval',
        '--config',
        configPath,
        '--output',
        outputPath,
        '--no-cache',
        '--no-write',
        '--no-table',
        '--no-progress-bar',
        '--max-concurrency',
        '1',
      ],
      consumerDir,
      {
        ALL_PROXY: '',
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        NO_PROXY: '127.0.0.1,localhost',
        PROMPTFOO_CONFIG_DIR: configDir,
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
        all_proxy: '',
        http_proxy: '',
        https_proxy: '',
        no_proxy: '127.0.0.1,localhost',
      },
    );

    assert(fs.existsSync(outputPath), `Installed promptfoo did not write results: ${outputPath}`);
    const evalOutput = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as ArtifactEvalOutput;
    const results = evalOutput.results?.results;
    assert(Array.isArray(results), 'Installed promptfoo output is missing evaluation results');
    assert.equal(results.length, 2, 'Expected one result for each compressed provider');
    for (const result of results) {
      assert.equal(result.score, 1);
      assert.equal(result.success, true, `Compressed provider failed: ${JSON.stringify(result)}`);
      assert.equal(
        result.error,
        undefined,
        `Compressed provider errored: ${JSON.stringify(result)}`,
      );
      assert.equal(
        result.response?.error,
        undefined,
        `Compressed provider response errored: ${JSON.stringify(result)}`,
      );
      assert.equal(result.response?.output, expectedOutput);
    }
    assert.deepEqual(requestedPaths.sort(), ['/br', '/gzip']);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'default' },
      registry: { type: 'string', default: 'https://registry.npmjs.org/' },
      tarball: { type: 'string' },
      'runtime-assets': { type: 'string', default: 'none' },
      browser: { type: 'boolean', default: false },
    },
  });
  assert(
    ['none', 'python-go', 'all'].includes(values['runtime-assets']),
    `Unknown runtime asset profile: ${values['runtime-assets']}`,
  );
  const suppliedTarball = values.tarball === undefined ? undefined : path.resolve(values.tarball);
  if (suppliedTarball) {
    assert(suppliedTarball.endsWith('.tgz'), '--tarball must be a local .tgz file');
    assert(fs.statSync(suppliedTarball).isFile(), '--tarball must be an existing file');
  }
  const originalHash = suppliedTarball
    ? createHash('sha512').update(fs.readFileSync(suppliedTarball)).digest('hex')
    : undefined;
  assert(
    ['default', 'omit-optional'].includes(values.profile),
    `Unknown install profile: ${values.profile}`,
  );
  // Module resolution canonicalizes paths (for example /var to /private/var on macOS).
  const tempDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-package-artifact-')),
  );
  const artifactsDir = path.join(tempDir, 'artifacts');
  const configDir = path.join(tempDir, 'config');
  const consumerDir = path.join(tempDir, 'consumer');
  const consumerNpmrc = path.join(tempDir, 'consumer.npmrc');

  try {
    fs.mkdirSync(artifactsDir);
    fs.mkdirSync(configDir);
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(consumerNpmrc, '');

    // npm's dry-run inspects the supplied archive without repacking it or running hooks.
    const packOutput = suppliedTarball
      ? runNpm(['pack', suppliedTarball, '--dry-run', '--ignore-scripts', '--json'], ROOT)
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
    assertPackagedFiles(packResult, !suppliedTarball);

    const tarballPath = suppliedTarball ?? path.join(artifactsDir, packResult.filename);
    assert(fs.existsSync(tarballPath), `Missing tarball: ${tarballPath}`);

    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'promptfoo-package-artifact-consumer',
        private: true,
        type: 'module',
      }),
    );
    console.log(`Installing packed consumer (${values.profile})...`);
    runNpm(
      [
        'install',
        ...(values.profile === 'omit-optional' ? ['--omit=optional'] : ['--include=optional']),
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        `--registry=${values.registry}`,
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
    assertInstalledRefParserTransport(installedPackageDir);
    const packageRequire = createRequire(path.join(installedPackageDir, 'package.json'));
    for (const optionalPackage of [
      '@playwright/browser-chromium/package.json',
      '@anthropic-ai/claude-agent-sdk',
    ]) {
      if (values.profile === 'omit-optional') {
        assert.throws(() => packageRequire.resolve(optionalPackage), { code: 'MODULE_NOT_FOUND' });
      } else {
        assert(packageRequire.resolve(optionalPackage).startsWith(`${consumerDir}${path.sep}`));
      }
    }

    // Consumer files live outside the repository so neither workspaces nor devDependencies
    // can satisfy undeclared package imports. Keep all user state local to this fixture.
    const consumerEnv = {
      NODE_PATH: '',
      PROMPTFOO_CONFIG_DIR: configDir,
      PROMPTFOO_CACHE_PATH: path.join(tempDir, 'cache'),
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: 'true',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    };
    writeConsumerScripts(consumerDir);
    fs.cpSync(path.join(ROOT, 'test', 'fixtures', 'package-artifact'), consumerDir, {
      recursive: true,
    });
    run(process.execPath, ['import-package.mjs'], consumerDir, consumerEnv);
    run(process.execPath, ['require-package.cjs'], consumerDir, consumerEnv);
    const tscPath = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const tsconfig of [
      'tsconfig.json',
      'tsconfig.node16-cjs.json',
      'tsconfig.api-esm.json',
      'tsconfig.api-cjs.json',
    ]) {
      run(process.execPath, [tscPath, '--project', tsconfig], consumerDir);
    }
    for (const script of ['import-api.mjs', 'require-api.cjs']) {
      console.log(await runAsync(process.execPath, [script], consumerDir, consumerEnv));
    }
    assertInstalledWebApp(installedPackageDir);
    const installedMigrations = path.join(installedPackageDir, 'dist', 'drizzle');
    const journal = JSON.parse(
      fs.readFileSync(path.join(installedMigrations, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    assert(journal.entries.length > 0, 'Expected installed migration journal entries');
    for (const { tag } of journal.entries) {
      assert(
        fs.statSync(path.join(installedMigrations, `${tag}.sql`)).isFile(),
        `Missing installed migration: ${tag}`,
      );
    }

    for (const binName of ['promptfoo', 'pf']) {
      if (values.profile === 'omit-optional') {
        // The CLI currently initializes SQLite before handling --version. Omission removes
        // libsql's native platform package: verify its actionable failure, not a crash.
        assert.throws(
          () => runInstalledBinVersion(consumerDir, configDir, binName),
          (error: unknown) =>
            error instanceof Error &&
            (error.cause as { status?: number })?.status === 1 &&
            error.message.includes('could not load its SQLite dependency') &&
            error.message.includes('Required package: @libsql/'),
        );
      } else {
        assert.equal(
          runInstalledBinVersion(consumerDir, configDir, binName).trim(),
          packResult.version,
        );
      }
    }
    if (values.profile === 'default') {
      console.log(await runAsync(process.execPath, ['migrations.mjs'], consumerDir, consumerEnv));
      await runInstalledCompressionEval(consumerDir, configDir);
    }

    if (values['runtime-assets'] !== 'none') {
      console.log(
        await runAsync(
          process.execPath,
          ['runtime-assets.mjs', ...(values['runtime-assets'] === 'all' ? ['--ruby'] : [])],
          consumerDir,
          consumerEnv,
        ),
      );
    }

    if (values.browser) {
      const browserArgs = ['browser.mjs', '--profile', values.profile];
      if (values.profile === 'default') {
        // Resolve from Promptfoo so shallow installs cannot borrow checkout dependencies.
        // Fail undeclared capabilities before downloading the consumer's matching browser.
        packageRequire.resolve('puppeteer-extra-plugin-stealth');
        const playwrightManifest = packageRequire.resolve('playwright/package.json');
        const playwright = JSON.parse(fs.readFileSync(playwrightManifest, 'utf8')) as {
          bin: { playwright: string };
        };
        assert.equal(typeof playwright.bin.playwright, 'string');
        const browsersPath = path.join(tempDir, 'browsers');
        console.log(
          await runAsync(
            process.execPath,
            [
              path.resolve(path.dirname(playwrightManifest), playwright.bin.playwright),
              'install',
              'chromium',
              '--only-shell',
            ],
            consumerDir,
            { ...consumerEnv, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
          ),
        );
        browserArgs.push('--browsers-path', browsersPath);
      }
      console.log(await runAsync(process.execPath, browserArgs, consumerDir, consumerEnv));
    }

    if (suppliedTarball) {
      assert.equal(
        createHash('sha512').update(fs.readFileSync(suppliedTarball)).digest('hex'),
        originalHash,
        'The tested tarball changed during validation',
      );
    }
    console.log(
      `Verified installed package artifact (${values.profile}): ${path.basename(tarballPath)}`,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
