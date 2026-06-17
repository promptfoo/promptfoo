import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

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

type ArtifactEvalOutput = {
  results?: {
    results?: Array<{
      error?: string;
      response?: {
        error?: string;
        output?: unknown;
      };
      success?: boolean;
    }>;
  };
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

    writeConsumerScripts(consumerDir);
    run(process.execPath, ['import-package.mjs'], consumerDir);
    run(process.execPath, ['require-package.cjs'], consumerDir);
    const tscPath = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const tsconfig of ['tsconfig.json', 'tsconfig.legacy.json', 'tsconfig.node16-cjs.json']) {
      run(process.execPath, [tscPath, '--project', tsconfig], consumerDir);
    }
    assertInstalledWebApp(installedPackageDir);

    for (const binName of ['promptfoo', 'pf']) {
      assert.equal(
        runInstalledBinVersion(consumerDir, configDir, binName).trim(),
        packResult.version,
      );
    }
    await runInstalledCompressionEval(consumerDir, configDir);

    console.log(`Verified installed package artifact: ${packResult.filename}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
