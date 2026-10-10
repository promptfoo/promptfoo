import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { API } from 'typescript/unstable/sync';
import { writePackedConsumerSbom } from './packedConsumerSbom';
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

function timePhase<T>(name: string, operation: () => T): T {
  const started = performance.now();
  console.log(`[artifact-phase] start: ${name}`);
  try {
    return operation();
  } finally {
    console.log(`[artifact-phase] end: ${name} (${Math.round(performance.now() - started)} ms)`);
  }
}

async function timeAsyncPhase<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  console.log(`[artifact-phase] start: ${name}`);
  try {
    return await operation();
  } finally {
    console.log(`[artifact-phase] end: ${name} (${Math.round(performance.now() - started)} ms)`);
  }
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

function runNpm(
  phase: string,
  args: string[],
  cwd: string,
  envOverrides: NodeJS.ProcessEnv = {},
): string {
  assert(process.env.npm_execpath, 'Expected npm_execpath when running package artifact test');
  return timePhase(phase, () =>
    run(process.execPath, [process.env.npm_execpath!, ...args], cwd, envOverrides),
  );
}

function installConsumerPackages(
  phase: string,
  packages: string[],
  consumerDir: string,
  npmEnv: NodeJS.ProcessEnv,
): void {
  runNpm(
    phase,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', ...packages],
    consumerDir,
    npmEnv,
  );
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

export function runInstalledBinVersion(
  consumerDir: string,
  configDir: string,
  binName: 'promptfoo' | 'pf',
): string {
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
    // Keep the working directory out of cmd.exe's command string. Paths can contain
    // percent signs, which cmd.exe expands even inside quotes.
    const command =
      binName === 'promptfoo'
        ? '.\\node_modules\\.bin\\promptfoo.cmd'
        : '.\\node_modules\\.bin\\pf.cmd';
    return run(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', command, '--version'],
      consumerDir,
      envOverrides,
    );
  }

  return run(binPath, ['--version'], consumerDir, envOverrides);
}

function assertProviderTypeDocumentation(installedPackageDir: string): void {
  const api = new API();
  try {
    for (const declaration of ['contracts.d.ts', 'contracts.d.cts']) {
      const declarationPath = path.join(installedPackageDir, 'dist', 'src', declaration);
      const snapshot = api.updateSnapshot({ openFiles: [declarationPath] });
      const project = snapshot.getDefaultProjectForFile(declarationPath);
      assert(project, `Missing declaration project: ${declaration}`);
      const checker = project.checker;
      const source = project.program.getSourceFile(declarationPath);
      assert(source, `Missing declaration source: ${declaration}`);
      const moduleSymbol = checker.getSymbolAtLocation(source);
      assert(moduleSymbol, `Missing declaration module: ${declaration}`);
      const exports = checker.getExportsOfModule(moduleSymbol);

      for (const name of [
        'McpConfigInput',
        'McpConfig',
        'McpConfigParsed',
        'HttpProviderConfigInput',
      ]) {
        const symbol = exports.find((entry) => entry.name === name);
        assert(symbol, `Missing ${name} in ${declaration}`);
        const configType = checker.getDeclaredTypeOfSymbol(symbol);
        const properties =
          name === 'HttpProviderConfigInput'
            ? ['tools', 'tool_choice', 'transformToolsFormat', 'session']
            : ['timeout', 'resetTimeoutOnProgress', 'maxTotalTimeout', 'pingOnConnect'];
        for (const property of properties) {
          const member = checker.getPropertyOfType(configType, property);
          assert(member, `Missing ${name}.${property} in ${declaration}`);
          const documentation = checker.getDocumentationCommentOfSymbol(member);
          assert(
            documentation.length > 0,
            `Missing JSDoc for ${name}.${property} in ${declaration}`,
          );
          if (property === 'timeout') {
            assert.match(documentation, /60000 \(60 seconds\)/);
            assert.match(documentation, /MCP_REQUEST_TIMEOUT_MS/);
          }
        }
        const responseParser = checker.getPropertyOfType(configType, 'responseParser');
        assert(responseParser, `Missing ${name}.responseParser in ${declaration}`);
        const deprecated = checker.getJsDocTagsOfSymbol(responseParser);
        assert(
          deprecated?.some(
            (tag) => tag.name === 'deprecated' && tag.text?.includes('transformResponse'),
          ),
          `Missing responseParser deprecation in ${name} in ${declaration}`,
        );
      }
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function writeConsumerScripts(consumerDir: string): void {
  const authAssertions = [
    "const httpInput = { method: 'GET', auth: { type: 'api_key', value: '{{ KEY }}', placement: 'header', keyName: 'X-Key' }, tls: {} };",
    "if ('rejectUnauthorized' in HttpProviderConfigInputSchema.parse(httpInput).tls) {",
    "  throw new Error('HTTP authoring schema inserted runtime defaults');",
    '}',
    "for (const invalid of [{method: 'POST'}, {body: {}, signatureAuth: {type: 'pem'}}, {method: 'GET', typo: true}]) {",
    '  if (HttpProviderConfigInputSchema.safeParse(invalid).success) {',
    "    throw new Error('HTTP authoring schema accepted invalid input');",
    '  }',
    '}',
    "if (HttpAuthInputSchema.safeParse({ type: 'api_key', value: 'key' }).success) {",
    "  throw new Error('HTTP auth lost its placement/name requirements');",
    '}',
    "if (HttpProviderConfigInputJsonSchema.$schema !== 'http://json-schema.org/draft-07/schema#') {",
    "  throw new Error('Missing HTTP config JSON Schema export');",
    '}',
    "const extensionConfig = { server: { command: 'node', extension: true }, extension: true };",
    'if (McpConfigInputSchema.safeParse(extensionConfig).success) {',
    "  throw new Error('MCP authoring config accepted extension fields');",
    '}',
    'const compatibleConfig = McpConfigSchema.parse(extensionConfig);',
    'if (compatibleConfig.extension !== true || compatibleConfig.server.extension !== true) {',
    "  throw new Error('MCP runtime config lost extension fields');",
    '}',
    "if (McpAuthInputSchema.safeParse({ type: 'bearer', token: 'key', typo: true }).success) {",
    "  throw new Error('MCP authoring auth accepted an unknown field');",
    '}',
    "const mcpInput = { servers: [{ url: 'https://mcp.example.test', auth: { type: 'api_key', api_key: 'key' } }] };",
    "if ('enabled' in McpConfigInputSchema.parse(mcpInput)) {",
    "  throw new Error('MCP config input parsing inserted defaults');",
    '}',
    'if (McpConfigSchema.parse(mcpInput).enabled !== true) {',
    "  throw new Error('MCP config runtime default is missing');",
    '}',
    "if (McpConfigInputSchema.safeParse({ server: { url: 'https://mcp.example.test', auth: { type: 'api_key' } } }).success) {",
    "  throw new Error('MCP config accepted invalid nested auth');",
    '}',
    "if (McpConfigInputJsonSchema.$schema !== 'http://json-schema.org/draft-07/schema#') {",
    "  throw new Error('Missing MCP config JSON Schema export');",
    '}',
    "const authInput = { type: 'oauth', clientId: 'client', clientSecret: 'secret' };",
    "if ('grantType' in McpAuthInputSchema.parse(authInput)) {",
    "  throw new Error('MCP auth input parsing inserted a runtime default');",
    '}',
    "if (McpAuthSchema.parse(authInput)?.grantType !== 'client_credentials') {",
    "  throw new Error('MCP runtime auth parsing lost its default');",
    '}',
    "if (McpAuthInputSchema.safeParse({ type: 'api_key' }).success) {",
    "  throw new Error('MCP API-key auth accepted missing credentials');",
    '}',
    "if (McpAuthInputJsonSchema.$schema !== 'http://json-schema.org/draft-07/schema#') {",
    "  throw new Error('Missing MCP auth JSON Schema export');",
    '}',
  ];
  for (const filename of ['import-package.mjs', 'require-package.cjs']) {
    const imports = [
      ['promptfoo', 'AssertionSchema, AtomicTestCaseSchema, TestSuiteSchema'],
      [
        'promptfoo/contracts',
        'EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, hasFunctionToolCallValidator',
      ],
      ['promptfoo/contracts', 'McpAuthInputJsonSchema, McpAuthInputSchema, McpAuthSchema'],
      ['promptfoo/contracts', 'McpConfigInputJsonSchema, McpConfigInputSchema, McpConfigSchema'],
      [
        'promptfoo/contracts',
        'HttpAuthInputSchema, HttpProviderConfigInputSchema, HttpProviderConfigInputJsonSchema',
      ],
    ].map(([specifier, names]) =>
      filename.endsWith('.mjs')
        ? `import { ${names} } from '${specifier}';`
        : `const { ${names} } = require('${specifier}');`,
    );
    fs.writeFileSync(
      path.join(consumerDir, filename),
      [
        ...imports,
        'for (const value of [AssertionSchema, AtomicTestCaseSchema, EmailSchema, GetUserResponseSchema, InputsSchema, PromptSchema, TestSuiteSchema]) {',
        "  if (!value || typeof value.safeParse !== 'function') {",
        "    throw new Error('Missing expected schema export');",
        '  }',
        '}',
        'if (!hasFunctionToolCallValidator({ validateFunctionToolCall() {} })) {',
        "  throw new Error('Missing expected provider capability export');",
        '}',
        ...authAssertions,
        '',
      ].join('\n'),
    );
  }
  fs.writeFileSync(
    path.join(consumerDir, 'import-contracts.ts'),
    [
      "import { GetUserResponseSchema, PromptSchema, hasFunctionToolCallValidator, isTransformFunction } from 'promptfoo/contracts';",
      "import type { BlobRef, FunctionToolCallValidator, GetUserResponse, Prompt, ProviderResponse, TransformFunction } from 'promptfoo/contracts';",
      "import { McpAuthInputSchema, McpAuthSchema } from 'promptfoo/contracts';",
      "import type { McpAuthInput, McpAuthParsed } from 'promptfoo/contracts';",
      "import { McpConfigSchema, type McpConfigInput, type McpConfigParsed } from 'promptfoo/contracts';",
      "import { HttpProviderConfigInputSchema, type HttpProviderConfigInput } from 'promptfoo/contracts';",
      '',
      "const prompt: Prompt = { label: 'Greeting', raw: 'Hello, world!' };",
      'const transform: TransformFunction<string, string> = (output) => output;',
      "const user: GetUserResponse = { email: 'user@example.com' };",
      'const validator: FunctionToolCallValidator = { validateFunctionToolCall() {} };',
      "const blobRef: BlobRef = { hash: 'abc123', mimeType: 'image/png', provider: 'filesystem', sizeBytes: 3, uri: 'promptfoo://blob/abc123' };",
      "const response: ProviderResponse = { images: [{ blobRef }], output: 'ok' };",
      "const authInput: McpAuthInput = { type: 'oauth', clientId: 'client', clientSecret: 'secret', scopes: 'read write' };",
      'const auth: McpAuthParsed = McpAuthSchema.parse(McpAuthInputSchema.parse(authInput));',
      "const mcpInput: McpConfigInput = { servers: [{ url: 'https://mcp.example.test', auth: authInput }] };",
      'const mcp: McpConfigParsed = McpConfigSchema.parse(mcpInput);',
      'const enabled: boolean = mcp.enabled;',
      'void enabled;',
      "const httpInput: HttpProviderConfigInput = { body: { prompt: '{{ prompt }}' }, auth: { type: 'bearer', token: 'key' } };",
      'HttpProviderConfigInputSchema.parse(httpInput);',
      "if (auth?.type === 'oauth') {",
      "  const grant: 'client_credentials' | 'password' = auth.grantType;",
      '  void grant;',
      '}',
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
  // Only root API callers skip Drizzle's broken optional-driver declarations.
  for (const [config, file, module, skipLibCheck] of [
    ['tsconfig.json', 'import-contracts.ts', 'NodeNext', false],
    ['tsconfig.node16-cjs.json', 'require-contracts.cts', 'Node16', false],
    ['tsconfig.api-esm.json', 'import-api.ts', 'NodeNext', true],
    ['tsconfig.api-cjs.json', 'require-api.cts', 'Node16', true],
  ] as const) {
    fs.writeFileSync(
      path.join(consumerDir, config),
      JSON.stringify({
        compilerOptions: {
          module,
          moduleResolution: module,
          noEmit: true,
          strict: true,
          skipLibCheck,
        },
        include: [file],
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
    path.join(consumerDir, 'require-contracts.cts'),
    [
      "import contracts = require('promptfoo/contracts');",
      '',
      "const prompt: contracts.Prompt = { label: 'Greeting', raw: 'Hello, world!' };",
      "const user: contracts.GetUserResponse = { email: 'user@example.com' };",
      'const validator: contracts.FunctionToolCallValidator = { validateFunctionToolCall() {} };',
      "const blobRef: contracts.BlobRef = { hash: 'abc123', mimeType: 'image/png', provider: 'filesystem', sizeBytes: 3, uri: 'promptfoo://blob/abc123' };",
      "const response: contracts.ProviderResponse = { images: [{ blobRef }], output: 'ok' };",
      "const authInput: contracts.McpAuthInput = { type: 'oauth', clientId: 'client', clientSecret: 'secret', scopes: 'read write' };",
      'const auth: contracts.McpAuthParsed = contracts.McpAuthSchema.parse(contracts.McpAuthInputSchema.parse(authInput));',
      "const mcpInput: contracts.McpConfigInput = { servers: [{ url: 'https://mcp.example.test', auth: authInput }] };",
      'const mcp: contracts.McpConfigParsed = contracts.McpConfigSchema.parse(mcpInput);',
      'const enabled: boolean = mcp.enabled;',
      'void enabled;',
      "const httpInput: contracts.HttpProviderConfigInput = { body: { prompt: '{{ prompt }}' }, auth: { type: 'bearer', token: 'key' } };",
      'contracts.HttpProviderConfigInputSchema.parse(httpInput);',
      "if (auth?.type === 'oauth') {",
      "  const grant: 'client_credentials' | 'password' = auth.grantType;",
      '  void grant;',
      '}',
      'contracts.GetUserResponseSchema.parse(user);',
      'contracts.PromptSchema.parse(prompt);',
      'void response;',
      'if (!contracts.hasFunctionToolCallValidator(validator)) {',
      "  throw new Error('Missing expected CommonJS TypeScript contracts export');",
      '}',
      '',
    ].join('\n'),
  );
}

async function runInstalledCodexSecurityEval(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const script = `const mode = process.argv[2];
if (mode === 'missing') {
  assert.throws(() => require.resolve('@openai/codex-security'), { code: 'MODULE_NOT_FOUND' });
}
const ordinary = await evaluate({
  prompts: ['hello fixture'],
  providers: ['echo'],
  tests: [{ vars: {}, assert: [{ type: 'equals', value: 'hello fixture' }] }],
}, { cache: false, maxConcurrency: 1 });
const { results: ordinaryResults } = await ordinary.toEvaluateSummary();
assert.equal(ordinaryResults.length, 1);
assert.equal(ordinaryResults[0].success, true);
assert.equal(ordinaryResults[0].score, 1);
// The supported SDK must stop at repository validation, before running any scan.
const record = await evaluate({
  prompts: ['Validate SDK installation'],
  providers: [{ id: 'openai:codex-security', config: {
    repository: path.join(process.cwd(), 'does-not-exist'),
  } }],
  tests: [{ vars: {} }],
}, { cache: false, maxConcurrency: 1 });
const summary = await record.toEvaluateSummary();
assert.equal(summary.results.length, 1);
assert.equal(summary.results[0].success, false);
assert.equal(summary.results[0].score, 0);
assert.ok(summary.results[0].response.error.includes(mode === 'installed'
  ? 'Repository is not a directory'
  : 'npm install promptfoo @openai/codex-security@^0.2.0'));
if (mode === 'incompatible') {
  assert.ok(summary.results[0].response.error.includes('incompatible (0.1.31)'));
}
`;
  const scriptPaths = ['codex-security.mjs', 'codex-security.cjs'].map((name) =>
    path.join(consumerDir, name),
  );
  fs.writeFileSync(
    scriptPaths[0],
    `import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { evaluate } from 'promptfoo';
const require = createRequire(import.meta.url);
${script}`,
  );
  fs.writeFileSync(
    scriptPaths[1],
    `const assert = require('node:assert/strict');
const path = require('node:path');
const { evaluate } = require('promptfoo');
(async () => {
${script}
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
  );
  const env = {
    PROMPTFOO_CONFIG_DIR: configDir,
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: 'true',
  };
  for (const mode of ['missing', 'incompatible', 'installed']) {
    const sdkPath = path.join(consumerDir, 'node_modules', '@openai', 'codex-security');
    if (mode === 'incompatible') {
      // Simulate an existing outdated optional SDK without bypassing the package's peer range.
      const staleSdkDir = path.join(consumerDir, 'stale-codex-sdk');
      fs.mkdirSync(staleSdkDir);
      fs.writeFileSync(path.join(staleSdkDir, 'package.json'), JSON.stringify({ private: true }));
      installConsumerPackages(
        'install isolated incompatible Codex Security SDK',
        ['@openai/codex-security@0.1.31'],
        staleSdkDir,
        npmEnv,
      );
      fs.mkdirSync(path.dirname(sdkPath), { recursive: true });
      fs.symlinkSync(
        path.join(staleSdkDir, 'node_modules', '@openai', 'codex-security'),
        sdkPath,
        'junction',
      );
    } else if (mode === 'installed') {
      installConsumerPackages(
        'install supported Codex Security SDK',
        ['@openai/codex-security@^0.2.0'],
        consumerDir,
        npmEnv,
      );
    }
    try {
      for (const scriptPath of scriptPaths) {
        await runAsync(process.execPath, [scriptPath, mode], consumerDir, env);
      }
    } finally {
      if (mode === 'incompatible') {
        fs.rmSync(sdkPath);
      }
    }
  }
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

async function runInstalledCodingSdkEval(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
  withOptionalDependencies: boolean,
): Promise<void> {
  const fixturesDir = path.join(consumerDir, 'coding-sdks');
  fs.cpSync(path.join(ROOT, 'test/fixtures/package-artifact/coding-sdks'), fixturesDir, {
    recursive: true,
  });
  // The Codex SDK sends `exec` first. Let Node load that fixture on every platform.
  fs.copyFileSync(path.join(fixturesDir, 'codex.mjs'), path.join(consumerDir, 'exec'));
  const scriptPath = path.join(consumerDir, 'coding-sdks.mjs');
  fs.writeFileSync(
    scriptPath,
    `import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const { evaluate } = process.argv[3] === 'cjs' ? createRequire(import.meta.url)('promptfoo') : await import('promptfoo');

const mode = process.argv[2];
const installed = mode === 'installed';
if (mode === 'missing') {
  for (const sdk of ['@openai/codex-sdk', '@anthropic-ai/claude-agent-sdk']) {
    assert.throws(() => import.meta.resolve(sdk), { code: 'ERR_MODULE_NOT_FOUND' });
  }
}
// An older SDK used elsewhere in the project must not break ordinary evaluations.
const ordinary = await evaluate({
  sharing: false,
  prompts: ['hello fixture'],
  providers: ['echo'],
  tests: [{ vars: {}, assert: [{ type: 'equals', value: 'hello fixture' }] }],
}, { cache: false, maxConcurrency: 1, writeLatestResults: false });
const { results: ordinaryResults } = await ordinary.toEvaluateSummary();
assert.equal(ordinaryResults.length, 1);
assert.equal(ordinaryResults[0].success, true);
const fixture = (name) => path.join(import.meta.dirname, 'coding-sdks', name);
const record = await evaluate({
  sharing: false,
  prompts: ['{{input}}'],
  providers: [
    {
      id: 'openai:codex-sdk',
      config: {
        apiKey: 'test-local-fixture',
        codex_path_override: process.execPath,
        working_dir: import.meta.dirname,
        skip_git_repo_check: true,
        persist_threads: false,
      },
    },
    {
      id: 'anthropic:claude-agent-sdk',
      config: {
        apiKey: 'test-local-fixture',
        path_to_claude_code_executable: fixture('claude.mjs'),
        working_dir: import.meta.dirname,
      },
    },
  ],
  tests: (installed ? ['hello fixture', 'fixture error'] : ['hello fixture']).map((input) => ({
    vars: { input },
    assert: [{ type: 'equals', value: 'local SDK fixture response' }],
  })),
}, { cache: false, maxConcurrency: 1, writeLatestResults: false });
const { results } = await record.toEvaluateSummary();
assert.equal(results.length, installed ? 4 : 2);
for (const result of results) {
  if (!installed) {
    assert.equal(result.success, false);
    assert.match(result.response.error, new RegExp('npm install promptfoo @(openai/codex-sdk|anthropic-ai/claude-agent-sdk)'));
    if (mode === 'incompatible') {
      assert.match(result.response.error, /found 0\\.(154\\.0|3\\.235)/);
    }
  } else if (result.vars.input === 'fixture error') {
    assert.equal(result.success, false);
    assert.match(result.response.error, /fixture request failed|error_during_execution/);
  } else {
    assert.equal(result.success, true);
    assert.equal(result.score, 1);
    assert.equal(result.response.output, 'local SDK fixture response');
    assert.equal(result.response.tokenUsage.prompt, 3);
    assert.equal(result.response.tokenUsage.completion, 5);
    assert.match(result.response.sessionId, /^fixture-(thread|session)$/);
  }
}
`,
  );
  const runChecks = async (mode: string) => {
    for (const format of ['esm', 'cjs']) {
      await runAsync(process.execPath, [scriptPath, mode, format], consumerDir, {
        NODE_PATH: '',
        PROMPTFOO_CONFIG_DIR: configDir,
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
      });
    }
  };
  await runChecks('missing');
  // Preserve the omit-optional profile; install real SDKs only in the default profile.
  if (withOptionalDependencies) {
    installConsumerPackages(
      'install incompatible coding SDKs',
      ['@openai/codex-sdk@0.154.0', '@anthropic-ai/claude-agent-sdk@0.3.235'],
      consumerDir,
      npmEnv,
    );
    await runChecks('incompatible');
    installConsumerPackages(
      'install supported coding SDKs',
      ['@openai/codex-sdk@^0.156.1', '@anthropic-ai/claude-agent-sdk@^0.3.273'],
      consumerDir,
      npmEnv,
    );
    await runChecks('installed');
  }
}

async function runOptionalOpenAiAgentsChecks(
  consumerDir: string,
  configDir: string,
): Promise<void> {
  const sdkDir = path.join(consumerDir, 'node_modules', '@openai', 'agents');
  assert(!fs.existsSync(sdkDir), 'Default consumers should not install the optional Agents SDK');
  const checks = `
    const echo = await loadApiProvider('echo');
    assert.equal((await echo.callApi('ordinary evaluation')).output, 'ordinary evaluation');
    await assert.rejects(
      loadApiProvider('openai:agents:gpt-4.1-mini'),
      (error) => {
        assert.match(error.message, /npm install promptfoo @openai\\/agents@\\^0\\.14\\.1/);
        if (process.argv[2] === 'incompatible') {
          assert.match(error.message, /found 0\\.0\\.0/);
        } else {
          assert.match(error.message, /package is required/);
        }
        return true;
      },
    );
  `;
  fs.writeFileSync(
    path.join(consumerDir, 'optional-agents.mjs'),
    `import assert from 'node:assert/strict';
     import { loadApiProvider } from 'promptfoo';
     ${checks}`,
  );
  fs.writeFileSync(
    path.join(consumerDir, 'optional-agents.cjs'),
    `const assert = require('node:assert/strict');
     const { loadApiProvider } = require('promptfoo');
     (async () => { ${checks} })().catch((error) => {
       console.error(error);
       process.exitCode = 1;
     });`,
  );
  const runChecks = async (mode: string) => {
    for (const script of ['optional-agents.mjs', 'optional-agents.cjs']) {
      await runAsync(process.execPath, [script, mode], consumerDir, {
        PROMPTFOO_CONFIG_DIR: configDir,
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
      });
    }
  };
  await runChecks('missing');

  // An unrelated application's SDK must not block ordinary providers. Reject an
  // unsupported SDK before executing its code when the Agents feature is used.
  const loaderPackages = path.join(consumerDir, 'loader-packages');
  fs.mkdirSync(sdkDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(sdkDir, 'package.json'),
      JSON.stringify({ name: '@openai/agents', version: '0.0.0', main: './index.js' }),
    );
    fs.writeFileSync(
      path.join(sdkDir, 'index.js'),
      'throw new Error("Unsupported SDK code must not execute");',
    );
    await runChecks('incompatible');

    // CommonJS supports SDK installations provided through NODE_PATH. The
    // compatibility check must inspect that SDK rather than report it missing.
    const loaderSdk = path.join(loaderPackages, '@openai', 'agents');
    fs.mkdirSync(path.dirname(loaderSdk), { recursive: true });
    fs.renameSync(sdkDir, loaderSdk);
    await runAsync(process.execPath, ['optional-agents.cjs', 'incompatible'], consumerDir, {
      NODE_PATH: loaderPackages,
      PROMPTFOO_CONFIG_DIR: configDir,
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: 'true',
    });
  } finally {
    fs.rmSync(sdkDir, { recursive: true, force: true });
    fs.rmSync(loaderPackages, { recursive: true, force: true });
  }
}

async function runOptionalSdkChecks(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
  withOptionalDependencies: boolean,
  sdk: { name: string; package: string; version: string; script: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  const sdkDir = path.join(consumerDir, 'node_modules', sdk.package);
  assert(
    !fs.existsSync(sdkDir),
    `Default consumers should not install the optional ${sdk.name} SDK`,
  );
  const runChecks = async (state: string) => {
    for (const format of ['esm', 'cjs']) {
      console.log(
        await runAsync(process.execPath, [sdk.script, format, state], consumerDir, {
          NODE_PATH: '',
          ...sdk.env,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: 'true',
        }),
      );
    }
  };
  await runChecks('missing');
  fs.mkdirSync(sdkDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(sdkDir, 'package.json'),
      JSON.stringify({ name: sdk.package, version: '0.0.0', main: './index.js' }),
    );
    fs.writeFileSync(
      path.join(sdkDir, 'index.js'),
      `throw new Error("Unsupported ${sdk.name} SDK code must not execute");`,
    );
    await runChecks('incompatible');
  } finally {
    fs.rmSync(sdkDir, { recursive: true, force: true });
  }

  // Keep the omit-optional profile intact; exercise the real SDK in the default profile.
  if (withOptionalDependencies) {
    installConsumerPackages(
      `install ${sdk.name} SDK`,
      [`${sdk.package}@${sdk.version}`],
      consumerDir,
      npmEnv,
    );
    await runChecks('installed');
  }
}

async function runOptionalWatsonXChecks(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
  withOptionalDependencies: boolean,
): Promise<void> {
  const packages = ['@ibm-cloud/watsonx-ai', 'ibm-cloud-sdk-core'];
  const [aiDir, coreDir] = packages.map((name) => path.join(consumerDir, 'node_modules', name));
  for (const directory of [aiDir, coreDir]) {
    assert(!fs.existsSync(directory), 'Default consumers should not install the WatsonX SDKs');
  }
  const runChecks = async (state: string) => {
    for (const format of ['esm', 'cjs']) {
      console.log(
        await runAsync(process.execPath, ['optional-watsonx.mjs', format, state], consumerDir, {
          NODE_PATH: '',
          WATSONX_AI_APIKEY: '',
          WATSONX_AI_BEARER_TOKEN: '',
          WATSONX_AI_AUTH_TYPE: '',
          WATSONX_AI_PROJECT_ID: '',
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_CACHE_ENABLED: 'false',
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: 'true',
        }),
      );
    }
  };
  const writeStub = (directory: string, name: string, version: string, source: string) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, version, main: './index.js' }),
    );
    fs.writeFileSync(path.join(directory, 'index.js'), source);
  };
  const unsupported = 'throw new Error("Unsupported WatsonX SDK code must not execute");';
  try {
    await runChecks('missing-both');
    writeStub(aiDir, packages[0], '1.7.16', unsupported);
    await runChecks('missing-core');
    writeStub(coreDir, packages[1], '0.0.0', unsupported);
    await runChecks('incompatible-core');
    fs.rmSync(aiDir, { recursive: true, force: true });
    writeStub(
      coreDir,
      packages[1],
      '5.6.2',
      'exports.IamAuthenticator = class {}; exports.BearerTokenAuthenticator = class {};',
    );
    await runChecks('missing-ai');
    writeStub(aiDir, packages[0], '0.0.0', unsupported);
    await runChecks('incompatible-ai');
  } finally {
    fs.rmSync(aiDir, { recursive: true, force: true });
    fs.rmSync(coreDir, { recursive: true, force: true });
  }

  // Preserve the omit-optional profile and install the real pair only in the default profile.
  if (withOptionalDependencies) {
    for (const args of [
      ['@ibm-cloud/watsonx-ai@^1.7.16', 'ibm-cloud-sdk-core@5.6.2'],
      ['--save-exact', 'ibm-cloud-sdk-core@5.6.2'],
    ]) {
      runNpm(
        'install WatsonX SDKs',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', ...args],
        consumerDir,
        npmEnv,
      );
    }
    await runChecks('installed');
  }
}

async function assertOptionalBrowserDependencies(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
  withOptionalDependencies: boolean,
): Promise<void> {
  const assertions = `
    const incompatible = process.argv[2] === 'incompatible';
    if (incompatible) {
      assert.equal(require('playwright/package.json').version, '1.62.0');
    } else {
      for (const name of ['playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth', '@playwright/browser-chromium']) {
        assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' });
      }
    }
    await assert.rejects(
      loadApiProvider('openai:chatkit:wf_fixture'),
      /openai:chatkit provider has been removed/,
    );
    const provider = await loadApiProvider('browser', { options: { config: { steps: [] } } });
    const response = await provider.callApi('optional browser fixture', { vars: {} });
    assert.match(response.error, incompatible
      ? /installed playwright package [(]1[.]62[.]0[)] is incompatible/
      : /requires the optional Playwright package/);
    assert.match(response.error, /npm install promptfoo/);
    assert.match(response.error, /npx playwright install chromium/);
    await provider.cleanup?.();
  `;
  for (const format of ['mjs', 'cjs']) {
    const imports =
      format === 'mjs'
        ? `import assert from 'node:assert/strict';
         import { createRequire } from 'node:module';
         import { loadApiProvider } from 'promptfoo';
         const require = createRequire(import.meta.url);`
        : `const assert = require('node:assert/strict');
         const { loadApiProvider } = require('promptfoo');`;
    fs.writeFileSync(
      path.join(consumerDir, `optional-browser.${format}`),
      `${imports}\n(async () => {${assertions}})().catch(error => {
        console.error(error); process.exitCode = 1;
      });`,
    );
  }
  for (const state of withOptionalDependencies ? ['missing', 'incompatible'] : ['missing']) {
    if (state === 'incompatible') {
      installConsumerPackages(
        'install incompatible browser SDK',
        ['playwright@1.62.0'],
        consumerDir,
        npmEnv,
      );
    }
    for (const format of ['mjs', 'cjs']) {
      await runAsync(process.execPath, [`optional-browser.${format}`, state], consumerDir, {
        PROMPTFOO_CONFIG_DIR: configDir,
        PROMPTFOO_CACHE_ENABLED: 'false',
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
      });
    }
  }
  if (withOptionalDependencies) {
    await timeAsyncPhase('compression with browser dependencies', () =>
      runInstalledCompressionEval(consumerDir, configDir),
    );
  }
}

async function runInstalledTransformersProvider(
  consumerDir: string,
  configDir: string,
  npmEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const modelDir = path.join(consumerDir, 'tiny-bert');
  fs.cpSync(path.join(ROOT, 'test/fixtures/transformers/tiny-bert'), modelDir, { recursive: true });
  const script = `const modelDir = ${JSON.stringify(modelDir)};
const providerId = 'transformers:feature-extraction:' + modelDir;
const mode = process.argv[2];
// An unrelated local SDK version must not prevent ordinary evaluations.
const ordinary = await evaluate({
  prompts: ['hello world'],
  providers: ['echo'],
  tests: [{ vars: {}, assert: [{ type: 'equals', value: 'hello world' }] }],
}, { cache: false, maxConcurrency: 1 });
const { results: ordinaryResults } = await ordinary.toEvaluateSummary();
assert.equal(ordinaryResults.length, 1);
assert.equal(ordinaryResults[0].success, true);
assert.equal(ordinaryResults[0].score, 1);
if (mode !== 'installed') {
  if (mode === 'absent') {
    assert.throws(() => require.resolve('@huggingface/transformers'), { code: 'MODULE_NOT_FOUND' });
  } else {
    assert.doesNotThrow(() => require.resolve('@huggingface/transformers'));
  }
  await assert.rejects(loadApiProvider(providerId), (error) => {
    assert.ok(error.message.includes('npm install promptfoo @huggingface/transformers@^4.0.0'));
    if (mode === 'incompatible') { assert.match(error.message, /found 3\\.8\\.1/); }
    return true;
  });
} else {
  const config = { device: 'cpu', dtype: 'fp32', localFilesOnly: true, normalize: false, cacheDir: modelDir };
  const provider = await loadApiProvider(providerId, { options: { config } });
  const embedding = await provider.callEmbeddingApi('hello world');
  assert.equal(embedding.error, undefined);
  assert.deepEqual(embedding.embedding, [3.5]);
  const record = await evaluate({
    prompts: ['hello world'],
    providers: ['echo'],
    tests: [providerId, providerId + '/missing'].map((id) => ({
      assert: [{ type: 'similar', value: 'hello world', threshold: 0.99, provider: { id, config } }],
    })),
  }, { cache: false, maxConcurrency: 1 });
  const { results } = await record.toEvaluateSummary();
  assert.equal(results.length, 2);
  assert.equal(results[0].success, true);
  assert.equal(results[0].score, 1);
  assert.equal(results[0].error, undefined);
  assert.equal(results[1].success, false);
  assert.match(results[1].gradingResult.reason, /missing|not found|Unable to locate/i);
}
`;
  const scriptPaths = ['transformers.mjs', 'transformers.cjs'].map((name) =>
    path.join(consumerDir, name),
  );
  fs.writeFileSync(
    scriptPaths[0],
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { evaluate, loadApiProvider } from 'promptfoo';
const require = createRequire(import.meta.url);
${script}`,
  );
  fs.writeFileSync(
    scriptPaths[1],
    `const assert = require('node:assert/strict');
const { evaluate, loadApiProvider } = require('promptfoo');
(async () => {
${script}
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
  );
  const env = {
    PROMPTFOO_CONFIG_DIR: configDir,
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: 'true',
  };
  const runMode = async (mode: string) => {
    for (const scriptPath of scriptPaths) {
      await runAsync(process.execPath, [scriptPath, mode], consumerDir, env);
    }
  };
  await runMode('absent');
  runNpm(
    'install incompatible Transformers SDK',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '@huggingface/transformers@3.8.1'],
    consumerDir,
    npmEnv,
  );
  await runMode('incompatible');
  runNpm(
    'install supported Transformers SDK',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '@huggingface/transformers@^4.0.0'],
    consumerDir,
    npmEnv,
  );
  await runMode('installed');
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'default' },
      registry: { type: 'string', default: 'https://registry.npmjs.org/' },
      tarball: { type: 'string' },
      'runtime-assets': { type: 'string', default: 'none' },
      browser: { type: 'boolean', default: false },
      'sbom-output': { type: 'string' },
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
  assert(!values.browser || values.profile === 'default', '--browser requires the default profile');
  // Module resolution canonicalizes paths (for example /var to /private/var on macOS).
  const tempDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-package-artifact-')),
  );
  const artifactsDir = path.join(tempDir, 'artifacts');
  const configDir = path.join(tempDir, 'config');
  const consumerDir = path.join(tempDir, 'consumer');
  const consumerNpmrc = path.join(tempDir, 'consumer.npmrc');
  const consumerNpmEnv = {
    npm_config_engine_strict: 'false',
    npm_config_userconfig: consumerNpmrc,
    npm_config_registry: values.registry,
  };

  try {
    fs.mkdirSync(artifactsDir);
    fs.mkdirSync(configDir);
    fs.mkdirSync(consumerDir);
    fs.writeFileSync(consumerNpmrc, '');

    // npm's dry-run inspects the supplied archive without repacking it or running hooks.
    const packOutput = suppliedTarball
      ? runNpm(
          'inspect supplied archive',
          ['pack', suppliedTarball, '--dry-run', '--ignore-scripts', '--json'],
          ROOT,
        )
      : runNpm(
          'pack local archive',
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
    assertPackagedFiles(packResult, !suppliedTarball);

    const tarballPath = suppliedTarball ?? path.join(artifactsDir, packResult.filename);
    assert(fs.existsSync(tarballPath), `Missing tarball: ${tarballPath}`);

    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'promptfoo-package-artifact-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      }),
    );
    console.log(`Installing packed consumer (${values.profile})...`);
    runNpm(
      'install packed consumer',
      [
        'install',
        ...(values.profile === 'omit-optional' ? ['--omit=optional'] : ['--include=optional']),
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        // npm needs the local tarball's resolution metadata to validate its SBOM
        // edge. The lock records this fresh install; SBOM generation reads disk.
        values['sbom-output'] ? '--package-lock' : '--no-package-lock',
        tarballPath,
      ],
      consumerDir,
      consumerNpmEnv,
    );

    const installedPackageDir = path.join(consumerDir, 'node_modules', 'promptfoo');
    // Capture the pristine consumer before optional-SDK acceptance installs fixtures.
    if (values['sbom-output']) {
      timePhase('inventory packed consumer', () =>
        writePackedConsumerSbom(
          consumerDir,
          tarballPath,
          path.resolve(values['sbom-output']!),
          values.profile,
          consumerNpmEnv,
        ),
      );
    }
    const installedPackageJson = JSON.parse(
      fs.readFileSync(path.join(installedPackageDir, 'package.json'), 'utf8'),
    ) as {
      version: string;
      exports?: unknown;
      typesVersions?: Record<string, Record<string, string[]>>;
    };
    assert.equal(installedPackageJson.version, packResult.version);
    assertExportsResolve(installedPackageDir, installedPackageJson);
    const packageRequire = createRequire(path.join(installedPackageDir, 'package.json'));
    timePhase('inspect declaration documentation', () =>
      assertProviderTypeDocumentation(installedPackageDir),
    );

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
    timePhase('import ESM package', () =>
      run(process.execPath, ['import-package.mjs'], consumerDir, consumerEnv),
    );
    timePhase('require CommonJS package', () =>
      run(process.execPath, ['require-package.cjs'], consumerDir, consumerEnv),
    );
    const tscPath = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    for (const [phase, tsconfig] of [
      ['typecheck ESM contracts', 'tsconfig.json'],
      ['typecheck CommonJS contracts', 'tsconfig.node16-cjs.json'],
      ['typecheck ESM root API', 'tsconfig.api-esm.json'],
      ['typecheck CommonJS root API', 'tsconfig.api-cjs.json'],
    ]) {
      timePhase(phase, () => run(process.execPath, [tscPath, '--project', tsconfig], consumerDir));
    }
    for (const [phase, script] of [
      ['evaluate ESM root API', 'import-api.mjs'],
      ['evaluate CommonJS root API', 'require-api.cjs'],
    ]) {
      console.log(
        await timeAsyncPhase(phase, () =>
          runAsync(process.execPath, [script], consumerDir, consumerEnv),
        ),
      );
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

    for (const binName of ['promptfoo', 'pf'] as const) {
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
    await timeAsyncPhase('optional coding SDKs', () =>
      runInstalledCodingSdkEval(
        consumerDir,
        configDir,
        consumerNpmEnv,
        values.profile === 'default',
      ),
    );
    await timeAsyncPhase('check optional OpenAI Agents SDK', () =>
      runOptionalOpenAiAgentsChecks(consumerDir, configDir),
    );
    await timeAsyncPhase('check optional Slack SDK', () =>
      runOptionalSdkChecks(consumerDir, configDir, consumerNpmEnv, values.profile === 'default', {
        name: 'Slack',
        package: '@slack/web-api',
        version: '^8.1.1',
        script: 'optional-slack.mjs',
        env: { SLACK_BOT_TOKEN: '' },
      }),
    );
    await timeAsyncPhase('check optional Langfuse SDK', () =>
      runOptionalSdkChecks(consumerDir, configDir, consumerNpmEnv, values.profile === 'default', {
        name: 'Langfuse',
        package: '@langfuse/client',
        version: '^5.11.1',
        script: 'optional-langfuse.mjs',
        env: {
          LANGFUSE_PUBLIC_KEY: '',
          LANGFUSE_SECRET_KEY: '',
          LANGFUSE_HOST: '',
          LANGFUSE_BASE_URL: '',
        },
      }),
    );
    await timeAsyncPhase('check optional WatsonX SDKs', () =>
      runOptionalWatsonXChecks(
        consumerDir,
        configDir,
        consumerNpmEnv,
        values.profile === 'default',
      ),
    );
    if (values.profile === 'default') {
      console.log(
        await timeAsyncPhase('check installed migrations', () =>
          runAsync(process.execPath, ['migrations.mjs'], consumerDir, consumerEnv),
        ),
      );
      await timeAsyncPhase('check optional Codex Security SDK', () =>
        runInstalledCodexSecurityEval(consumerDir, configDir, consumerNpmEnv),
      );
      await timeAsyncPhase('check response compression', () =>
        runInstalledCompressionEval(consumerDir, configDir),
      );
    }
    await timeAsyncPhase('check optional browser dependencies', () =>
      assertOptionalBrowserDependencies(
        consumerDir,
        configDir,
        consumerNpmEnv,
        values.profile === 'default',
      ),
    );
    if (values.profile === 'default') {
      await timeAsyncPhase('check optional Transformers SDK', () =>
        runInstalledTransformersProvider(consumerDir, configDir, consumerNpmEnv),
      );
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
      installConsumerPackages(
        'install browser dependencies',
        ['playwright@1.63.0', 'playwright-extra@4.3.6', 'puppeteer-extra-plugin-stealth@2.11.2'],
        consumerDir,
        consumerNpmEnv,
      );
      const playwrightManifest = packageRequire.resolve('playwright/package.json');
      const playwright = JSON.parse(fs.readFileSync(playwrightManifest, 'utf8')) as {
        bin: { playwright: string };
      };
      assert.equal(typeof playwright.bin.playwright, 'string');
      const browsersPath = path.join(tempDir, 'browsers');
      // Browser downloads use the CI job deadline, not the fixture timeout.
      console.log(
        run(
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
      console.log(
        await runAsync(
          process.execPath,
          ['browser.mjs', '--browsers-path', browsersPath],
          consumerDir,
          consumerEnv,
        ),
      );
    }

    if (suppliedTarball) {
      assert.equal(
        createHash('sha512').update(fs.readFileSync(suppliedTarball)).digest('hex'),
        originalHash,
        'The tested tarball changed during validation',
      );
    }
  } finally {
    console.log('Removing temporary artifact consumer...');
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    console.log('Removed temporary artifact consumer');
  }
  console.log(`Verified installed package artifact (${values.profile})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
