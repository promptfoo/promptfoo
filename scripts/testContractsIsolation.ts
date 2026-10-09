/** Build portable contracts without access to root-hoisted dependencies. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmPath = process.env.npm_execpath;
assert(npmPath, 'Run through npm run test:contracts-isolation');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-contracts-isolation-'));
const buildDir = path.join(temporaryRoot, 'package');
const consumer = path.join(temporaryRoot, 'consumer');
const env = { ...process.env, npm_config_cache: path.join(temporaryRoot, 'npm-cache') };
// Inert sentinels make the real npm installs fail if install hooks are ever enabled.
const installHookSentinels = Object.fromEntries(
  ['preinstall', 'install', 'postinstall'].map((hook) => [
    hook,
    'node -e "throw new Error(\'Install lifecycle scripts must stay disabled\')"',
  ]),
);

function run(args: string[], cwd: string): string {
  return execFileSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 300_000,
  });
}

function npm(args: string[], cwd: string): string {
  return run([npmPath!, ...args], cwd);
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  // Honor the invoking npm's registry locally; CI sets it explicitly on the npx command.
  const registry =
    process.env.npm_config_registry ??
    process.env.NPM_CONFIG_REGISTRY ??
    npm(['config', 'get', 'registry'], root).trim();
  const installFlags = ['--ignore-scripts', `--registry=${registry}`, '--no-audit', '--no-fund'];
  fs.mkdirSync(buildDir);
  fs.mkdirSync(consumer);
  fs.cpSync(path.join(root, 'src/contracts'), path.join(buildDir, 'src'), { recursive: true });
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const manifest = {
    name: 'promptfoo-contracts-fixture',
    version: '0.0.0',
    private: true,
    type: 'module',
    exports: {
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
    },
    files: ['dist'],
    scripts: { typecheck: 'tsc --noEmit', build: 'tsdown', ...installHookSentinels },
    dependencies: { zod: rootManifest.dependencies.zod },
    devDependencies: {
      tsdown: rootManifest.devDependencies.tsdown,
      typescript: rootManifest.devDependencies.typescript,
    },
  };
  writeJson(path.join(buildDir, 'package.json'), manifest);
  writeJson(path.join(buildDir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: false,
      // The source must typecheck in a browser environment without Node globals.
      lib: ['ES2022', 'DOM'],
      types: [],
      rootDir: 'src',
      outDir: 'dist',
    },
    include: ['src/**/*.ts'],
  });
  fs.writeFileSync(
    path.join(buildDir, 'tsdown.config.ts'),
    `
import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: ['src/index.ts'], format: ['esm', 'cjs'], target: 'es2022', platform: 'neutral',
  fixedExtension: false, dts: true, deps: { neverBundle: /^[a-z@][^:]*/ },
});
`,
  );
  console.log('Installing isolated contracts build dependencies');
  npm(['install', ...installFlags], buildDir);
  console.log(npm(['run', 'typecheck'], buildDir));
  console.log(npm(['run', 'build'], buildDir));
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json'], buildDir));
  for (const output of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
    assert(packed.files.some((file: { path: string }) => file.path === `dist/${output}`));
  }

  writeJson(path.join(consumer, 'package.json'), {
    name: 'contracts-isolation-consumer',
    private: true,
    type: 'module',
    scripts: installHookSentinels,
  });
  npm(
    [
      'install',
      ...installFlags,
      path.join(buildDir, packed.filename),
      `typescript@${manifest.devDependencies.typescript}`,
      `@types/node@${rootManifest.devDependencies['@types/node']}`,
    ],
    consumer,
  );
  const runtimeChecks = `
assert.equal(contracts.EmailSchema.safeParse('invalid').success, false);
assert.equal(contracts.EmailSchema.parse('reader@example.com'), 'reader@example.com');
assert.deepEqual(contracts.SuccessResponseSchema.parse({ success: true, extra: 'preserved' }), { success: true, extra: 'preserved' });
assert.deepEqual(contracts.PromptSchema.parse({ raw: 'hello', label: 'greeting' }), { raw: 'hello', label: 'greeting' });
assert.equal(contracts.PromptSchema.safeParse({ raw: 3, label: 'bad' }).success, false);
assert.equal(contracts.InputsSchema.safeParse({ report: { type: 'unsupported' } }).success, false);
assert.deepEqual(contracts.normalizeInputs({ text: 'prompt', image: { type: 'image', description: 'photo' } }), { text: { type: 'text', description: 'prompt' }, image: { type: 'image', description: 'photo', config: undefined } });
assert.equal(contracts.hasFunctionToolCallValidator({ validateFunctionToolCall() {} }), true);
assert.equal(contracts.hasFunctionToolCallValidator({ validateFunctionToolCall: false }), false);
assert.equal(contracts.UserSchemas.Login.Request, contracts.LoginRequestSchema);
assert.equal('TRACE_CREDENTIAL_PATH_SEGMENT' in contracts, false);
`;
  fs.writeFileSync(
    path.join(consumer, 'runtime.mjs'),
    `import assert from 'node:assert/strict';\nimport * as contracts from '${manifest.name}';\n${runtimeChecks}`,
  );
  fs.writeFileSync(
    path.join(consumer, 'runtime.cjs'),
    `const assert = require('node:assert/strict');\nconst contracts = require('${manifest.name}');\n${runtimeChecks}`,
  );
  const typeChecks = `
const prompt: contracts.Prompt = { raw: 'hello', label: 'greeting' };
const blob: contracts.BlobRef = { hash: 'abc', mimeType: 'image/png', provider: 'filesystem', sizeBytes: 3, uri: 'promptfoo://blob/abc' };
const response: contracts.ProviderResponse = { images: [{ blobRef: blob }], output: prompt.raw };
const user: contracts.GetUserResponse = { email: null };
contracts.PromptSchema.parse(prompt);
contracts.GetUserResponseSchema.parse(user);
// @ts-expect-error Public declarations must retain the required string prompt body.
const invalid: contracts.Prompt = { raw: 3, label: 'bad' };
// @ts-expect-error Provider output images retain the BlobRef contract.
const invalidBlob: contracts.BlobRef = { ...blob, hash: 3 };
void [response, invalid, invalidBlob];
`;
  fs.writeFileSync(
    path.join(consumer, 'types.mts'),
    `import * as contracts from '${manifest.name}';\n${typeChecks}`,
  );
  fs.writeFileSync(
    path.join(consumer, 'types.cts'),
    `import contracts = require('${manifest.name}');\n${typeChecks}`,
  );
  for (const [module, file] of [
    ['NodeNext', 'types.mts'],
    ['Node16', 'types.cts'],
  ]) {
    writeJson(path.join(consumer, 'tsconfig.json'), {
      compilerOptions: {
        module,
        moduleResolution: module,
        target: 'ES2022',
        lib: ['ES2022'],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        // Node supplies cross-platform URL types used by Zod, without supplying DOM globals.
        types: ['node'],
      },
      files: [file],
    });
    console.log(run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumer));
  }
  run(['runtime.mjs'], consumer);
  run(['runtime.cjs'], consumer);
  console.log('Verified isolated contracts build, installed ESM/CJS behavior and declarations');
} finally {
  await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
}
