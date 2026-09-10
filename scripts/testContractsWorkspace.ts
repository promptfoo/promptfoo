/** Build the private contracts workspace without access to root-hoisted dependencies. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-contracts-workspace-'));
const workspace = path.join(temporaryRoot, 'workspace');
const consumer = path.join(temporaryRoot, 'consumer');
const npmPath = process.env.npm_execpath;
assert(npmPath, 'Run through npm run test:contracts-workspace');
const env = { ...process.env, npm_config_cache: path.join(temporaryRoot, 'npm-cache') };
// Honor the invoking npm's registry locally; CI sets it explicitly on the npx command.
const registry =
  process.env.npm_config_registry ??
  process.env.NPM_CONFIG_REGISTRY ??
  npm(['config', 'get', 'registry'], root).trim();
const installFlags = ['--ignore-scripts', `--registry=${registry}`, '--no-audit', '--no-fund'];
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
  fs.mkdirSync(workspace);
  fs.mkdirSync(consumer);
  // Copy only declared build inputs. In particular, never copy node_modules or built outputs.
  for (const input of ['package.json', 'tsconfig.json', 'tsdown.config.ts', 'src']) {
    fs.cpSync(path.join(root, 'packages/contracts', input), path.join(workspace, input), {
      recursive: true,
    });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  assert.equal(manifest.private, true);
  assert.deepEqual(Object.keys(manifest.dependencies), ['zod']);
  writeJson(path.join(workspace, 'package.json'), {
    ...manifest,
    scripts: { ...manifest.scripts, ...installHookSentinels },
  });
  console.log('Installing isolated contracts build dependencies');
  npm(['install', ...installFlags], workspace);
  console.log(npm(['run', 'typecheck'], workspace));
  console.log(npm(['run', 'build'], workspace));
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json'], workspace));
  for (const output of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
    assert(packed.files.some((file: { path: string }) => file.path === `dist/${output}`));
  }

  writeJson(path.join(consumer, 'package.json'), {
    name: 'contracts-workspace-consumer',
    private: true,
    type: 'module',
    scripts: installHookSentinels,
  });
  npm(
    [
      'install',
      ...installFlags,
      path.join(workspace, packed.filename),
      `typescript@${manifest.devDependencies.typescript}`,
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
const invalidBlob: contracts.BlobRef = { hash: 3 };
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
        strict: true,
        skipLibCheck: false,
        noEmit: true,
        types: [],
      },
      files: [file],
    });
    console.log(run(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], consumer));
  }
  run(['runtime.mjs'], consumer);
  run(['runtime.cjs'], consumer);
  console.log('Verified isolated contracts build, installed ESM/CJS behavior and declarations');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
