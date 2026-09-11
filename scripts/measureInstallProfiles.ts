/** Measure an already-built tarball in fresh consumers, independently of the repository graph. */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { describeDirectDependencies, inventoryTree } from './installProfileInventory';
import { assertIsolatedConsumerRoot } from './installProfileIsolation';
import { npmInvocation, runInstallProfileCommand as run } from './installProfileProcess';

import type { CommandResult } from './installProfileProcess';

type Sample = CommandResult & { iteration: number };
type EvalRow = {
  success?: boolean;
  score?: number;
  failureReason?: number;
  error?: string;
  gradingResult?: {
    pass?: boolean;
    componentResults?: Array<{ pass?: boolean; assertion?: { type?: string; value?: unknown } }>;
  };
  response?: { output?: unknown; error?: string };
};

const help = `Measure fresh production consumers of an existing promptfoo tarball.

  node --import tsx scripts/measureInstallProfiles.ts --tarball /absolute/promptfoo.tgz --output /tmp/profile-report

Options:
  --tarball PATH       Already built npm tarball (never rebuilt by this script)
  --output DIR         New evidence directory; must not exist
  --runs N             Fresh processes per startup probe (default 5, minimum 2)
  --profiles LIST      default,omit-optional (default both)
  --install-scripts    Run dependency lifecycle scripts (default true)
  --no-install-scripts Inventory-only installation; not normal install acceptance
  --registry URL      npm registry (default invoking npm configuration)
  --help              Print usage

Retains consumers, npm cache, lockfile, command logs and JSON reports. Uses no
provider APIs. Requires POSIX process groups and credential-free proxy URLs.
Timings are fresh-process measurements with uncontrolled OS cache,
not cold-disk benchmarks. Install order and cache conditions are recorded.
`;

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function summarizeSamples(samples: Sample[]) {
  const values = samples
    .filter((sample) => sample.code === 0 && !sample.timedOut)
    .map((sample) => sample.elapsedMs)
    .sort((a, b) => a - b);
  return {
    successful: values.length,
    failed: samples.length - values.length,
    // Keep the first process separate: later processes may benefit from the OS page cache.
    firstMs: samples[0]?.code === 0 && !samples[0].timedOut ? samples[0].elapsedMs : null,
    medianMs: values.length
      ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
      : null,
    minMs: values[0] ?? null,
    maxMs: values.at(-1) ?? null,
    samples,
  };
}

export function parseRegistryUrl(value: string): URL {
  const registry = new URL(value);
  assert(['https:', 'http:'].includes(registry.protocol), 'Registry must use http(s)');
  // Retained reports include this URL. Reject token-bearing query/fragment forms
  // as well as URL userinfo before writing any evidence or invoking npm.
  assert(
    !registry.username && !registry.password && !registry.search && !registry.hash,
    'Registry URL must not contain credentials, query strings, or fragments',
  );
  return registry;
}

export function validateEvalCommand(
  command: Pick<CommandResult, 'code' | 'timedOut'>,
  expectedSuccess: boolean,
): void {
  assert(!command.timedOut, 'Evaluation command timed out');
  assert.equal(command.code, expectedSuccess ? 0 : 100, 'Unexpected eval exit code');
}

export function validateEvalOutput(output: unknown, expectedSuccess: boolean): EvalRow[] {
  const rows = (output as { results?: { results?: EvalRow[] } })?.results?.results;
  assert(Array.isArray(rows) && rows.length === 1, 'Expected exactly one exported eval result');
  for (const row of rows) {
    assert.equal(row.success, expectedSuccess, 'Unexpected eval success');
    assert.equal(row.score, expectedSuccess ? 1 : 0, 'Unexpected eval score');
    // Persisted ResultFailureReason values: NONE=0, ASSERT=1, ERROR=2.
    assert.equal(
      row.failureReason,
      expectedSuccess ? 0 : 1,
      'Unexpected eval failure classification',
    );
    assert.equal(row.gradingResult?.pass, expectedSuccess, 'Unexpected assertion result');
    const components = row.gradingResult?.componentResults;
    assert(Array.isArray(components) && components.length === 1, 'Expected one graded assertion');
    assert.equal(components[0].pass, expectedSuccess);
    assert.equal(components[0].assertion?.type, 'equals');
    assert.equal(
      components[0].assertion?.value,
      expectedSuccess ? 'install profile fixture' : 'intentional mismatch',
    );
    assert.equal(row.response?.output, 'install profile fixture', 'Unexpected echo output');
    assert.equal(row.response?.error, undefined, 'Provider must not error');
    if (expectedSuccess) {
      assert.equal(row.error, undefined, 'Passing evaluation must not error');
    } else {
      assert(typeof row.error === 'string', 'Expected assertion failure evidence');
      assert(row.error.length > 0, 'Expected nonempty assertion failure evidence');
    }
  }
  return rows;
}

function environment(root: string): NodeJS.ProcessEnv {
  // Deliberately do not inherit provider credentials, npm settings, NODE_PATH or NODE_OPTIONS.
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'SystemRoot',
    'COMSPEC',
    'PATHEXT',
    'TMP',
    'TEMP',
    'TMPDIR',
    // Preflight permits only credential-free proxy URLs.
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'no_proxy',
  ]) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  const config = path.join(root, 'config');
  fs.mkdirSync(config, { recursive: true });
  const userconfig = path.join(config, 'user.npmrc');
  const globalconfig = path.join(config, 'global.npmrc');
  fs.writeFileSync(userconfig, '');
  fs.writeFileSync(globalconfig, '');
  return {
    ...env,
    CI: 'true',
    NO_COLOR: '1',
    npm_config_userconfig: userconfig,
    npm_config_globalconfig: globalconfig,
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    XDG_CACHE_HOME: path.join(root, 'assets', 'xdg'),
    PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'assets', 'playwright'),
    HF_HOME: path.join(root, 'assets', 'huggingface'),
    PROMPTFOO_CONFIG_DIR: path.join(config, 'promptfoo'),
    PROMPTFOO_CACHE_PATH: path.join(config, 'promptfoo-cache'),
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: 'true',
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_PASS_RATE_THRESHOLD: '100',
  };
}

async function probeConsumer(consumer: string, logs: string, env: NodeJS.ProcessEnv, runs: number) {
  let passed = true;
  const entrypoint = path.join(consumer, 'node_modules/promptfoo/dist/src/entrypoint.js');
  const probes: Array<{ name: string; args: string[] }> = [
    { name: 'node-process', args: ['-e', ''] },
    {
      name: 'contracts-esm',
      args: [
        '--input-type=module',
        '-e',
        "const c = await import('promptfoo/contracts'); c.PromptSchema.parse({raw: 'fixture', label: 'fixture'});",
      ],
    },
    {
      name: 'facade-esm',
      args: [
        '--input-type=module',
        '-e',
        "const p = await import('promptfoo'); if (typeof p.evaluate !== 'function') throw new Error('Missing evaluate');",
      ],
    },
    {
      name: 'facade-cjs',
      args: [
        '-e',
        "const p = require('promptfoo'); if (typeof p.evaluate !== 'function') throw new Error('Missing evaluate');",
      ],
    },
    { name: 'cli-help', args: [entrypoint, '--help'] },
  ];
  const samples = new Map(probes.map((probe) => [probe.name, [] as Sample[]]));
  // Rotate the first probe across rounds so every workload isn't always measured in the same order.
  for (let iteration = 0; iteration < runs; iteration++) {
    for (let offset = 0; offset < probes.length; offset++) {
      const probe = probes[(iteration + offset) % probes.length];
      const sample = await run(
        process.execPath,
        ['--no-global-search-paths', ...probe.args],
        consumer,
        env,
        path.join(logs, `${probe.name}-${iteration}`),
      );
      samples.get(probe.name)!.push({ ...sample, iteration });
      if (sample.code !== 0 || sample.timedOut) {
        passed = false;
      }
    }
  }
  const startup = Object.fromEntries(
    [...samples].map(([name, values]) => [name, summarizeSamples(values)]),
  );
  const evaluations = [];
  for (const expectedSuccess of [true, false]) {
    const name = expectedSuccess ? 'echo-pass' : 'echo-fail';
    const config = path.join(consumer, `${name}.json`);
    const exported = path.join(logs, `${name}.results.json`);
    writeJson(config, {
      prompts: ['install profile fixture'],
      providers: ['echo'],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: expectedSuccess ? 'install profile fixture' : 'intentional mismatch',
            },
          ],
        },
      ],
    });
    const command = await run(
      process.execPath,
      [
        '--no-global-search-paths',
        entrypoint,
        'eval',
        '--config',
        config,
        '--output',
        exported,
        '--no-cache',
        '--no-write',
        '--no-table',
        '--no-progress-bar',
        '--max-concurrency',
        '1',
      ],
      consumer,
      env,
      path.join(logs, name),
    );
    try {
      validateEvalCommand(command, expectedSuccess);
      const rows = validateEvalOutput(
        JSON.parse(fs.readFileSync(exported, 'utf8')),
        expectedSuccess,
      );
      evaluations.push({ name, command, validated: true, rows });
    } catch (error) {
      passed = false;
      evaluations.push({
        name,
        command,
        validated: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { passed, startup, evaluations };
}

export async function measureInstallProfiles(args = process.argv.slice(2)): Promise<boolean> {
  const { values } = parseArgs({
    args,
    options: {
      tarball: { type: 'string' },
      output: { type: 'string' },
      runs: { type: 'string', default: '5' },
      profiles: { type: 'string', default: 'default,omit-optional' },
      'install-scripts': { type: 'boolean', default: true },
      'no-install-scripts': { type: 'boolean', default: false },
      registry: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(help);
    return true;
  }
  assert(values.tarball && values.output, 'Both --tarball and --output are required; see --help');
  const runs = Number(values.runs);
  assert(
    Number.isInteger(runs) && runs >= 2 && runs <= 100,
    '--runs must be an integer from 2 to 100',
  );
  const profiles = values.profiles.split(',');
  assert(
    profiles.length > 0 &&
      new Set(profiles).size === profiles.length &&
      profiles.every((profile) => ['default', 'omit-optional'].includes(profile)),
    '--profiles must contain unique default and/or omit-optional entries',
  );
  assert(
    process.platform !== 'win32',
    'Install profile measurement requires POSIX process groups to terminate command descendants',
  );
  // Lifecycle scripts can copy their environment into retained logs and caches.
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ]) {
    const value = process.env[key];
    if (!value) {
      continue;
    }
    let proxy: URL;
    try {
      const parsed = URL.canParse(value) ? new URL(value) : undefined;
      proxy = parsed?.hostname ? parsed : new URL(`http://${value}`);
    } catch {
      throw new Error(`${key} must be a credential-free proxy URL`);
    }
    assert(
      !proxy.username && !proxy.password && !proxy.search && !proxy.hash,
      `${key} must be a credential-free proxy URL`,
    );
  }
  const scripts = values['install-scripts'] && !values['no-install-scripts'];
  const npm = npmInvocation();
  // Respect a configured registry (e.g. a company mirror) without copying any
  // other npm configuration or credentials into the isolated consumer.
  let registryUrl = values.registry;
  if (registryUrl === undefined) {
    try {
      registryUrl = childProcess
        .execFileSync(npm.command, [...npm.prefix, 'config', 'get', 'registry'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 10_000,
          killSignal: 'SIGKILL',
        })
        .trim();
    } catch {
      throw new Error('Unable to read npm registry; use --registry with a credential-free URL');
    }
  }
  const registry = parseRegistryUrl(registryUrl);
  const tarball = path.resolve(values.tarball);
  assert(fs.statSync(tarball).isFile(), 'Tarball must be a file');
  const output = path.resolve(values.output);
  const checkoutRoot = fileURLToPath(new URL('../', import.meta.url));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-install-profiles-'));
  assertIsolatedConsumerRoot(work, checkoutRoot);
  fs.mkdirSync(output); // Fail rather than overwrite previous evidence.
  // Copy the exact artifact once; retained consumer lockfiles refer to these stable bytes.
  const artifact = path.join(work, 'promptfoo.tgz');
  fs.copyFileSync(tarball, artifact);
  const env = environment(work);
  const npmVersion = await run(
    npm.command,
    [...npm.prefix, '--version'],
    work,
    env,
    path.join(output, 'npm-version'),
  );
  assert(npmVersion.code === 0 && !npmVersion.timedOut, 'Unable to determine npm version');
  const version = fs.readFileSync(npmVersion.stdout, 'utf8').trim();
  assert(version.startsWith('11.'), `Use npm major 11 (found ${version})`);
  const manifest = {
    name: 'promptfoo-install-profile-consumer',
    private: true,
    type: 'module',
    dependencies: { promptfoo: `file:${artifact}` },
  };
  const resolution = path.join(work, 'resolution');
  fs.mkdirSync(resolution);
  writeJson(path.join(resolution, 'package.json'), manifest);
  const report = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    artifact: { sha256: sha256(artifact), bytes: fs.statSync(artifact).size, path: artifact },
    environment: {
      node: process.version,
      npm: version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      cpu: os.cpus()[0]?.model,
      release: os.release(),
    },
    conditions: {
      scripts,
      registry: registry.href,
      runs,
      profileOrder: profiles,
      npmCache: 'fresh initially; shared across resolution and profiles',
      osCache: 'uncontrolled; fresh Node processes only',
      moduleResolution:
        'real-path ancestor isolation; Node global search paths disabled for probes',
      work,
      consumerOverrides: false,
      dependencyResolution:
        'one fresh consumer lockfile shared by profiles; root overrides and lockfile are not inherited',
    },
    resolution: {} as CommandResult,
    lockfileSha256: '',
    passed: false,
    profiles: [] as Array<Record<string, unknown>>,
  };
  const save = () => writeJson(path.join(output, 'report.json'), report);
  save();
  report.resolution = await run(
    npm.command,
    [
      ...npm.prefix,
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--registry',
      registry.href,
    ],
    resolution,
    env,
    path.join(output, 'resolve'),
    20 * 60_000,
  );
  save();
  if (report.resolution.code !== 0 || report.resolution.timedOut) {
    return false;
  }
  const lockfile = path.join(resolution, 'package-lock.json');
  report.lockfileSha256 = sha256(lockfile);
  fs.copyFileSync(lockfile, path.join(output, 'consumer-package-lock.json'));
  let passed = true;
  for (const profile of profiles) {
    console.log(`Measuring ${profile}; retained evidence: ${output}`);
    const consumer = path.join(work, profile);
    const logs = path.join(output, profile);
    fs.mkdirSync(consumer);
    assertIsolatedConsumerRoot(consumer, checkoutRoot);
    fs.mkdirSync(logs);
    const profileEnv = environment(consumer);
    // Reuse only the explicit measurement cache, never the user's npm cache.
    profileEnv.npm_config_cache = env.npm_config_cache;
    writeJson(path.join(consumer, 'package.json'), manifest);
    fs.copyFileSync(lockfile, path.join(consumer, 'package-lock.json'));
    const installArgs = [
      'ci',
      '--registry',
      registry.href,
      '--omit=dev',
      ...(profile === 'omit-optional' ? ['--omit=optional'] : []),
      ...(scripts ? [] : ['--ignore-scripts']),
    ];
    const install = await run(
      npm.command,
      [...npm.prefix, ...installArgs],
      consumer,
      profileEnv,
      path.join(logs, 'install'),
      20 * 60_000,
    );
    const result: Record<string, unknown> = {
      name: profile,
      consumer,
      installArgs,
      install,
      passed: false,
    };
    report.profiles.push(result);
    save();
    try {
      const inventory = inventoryTree(path.join(consumer, 'node_modules'));
      result.inventory = inventory;
      result.directDependencies = describeDirectDependencies(
        JSON.parse(
          fs.readFileSync(path.join(consumer, 'node_modules/promptfoo/package.json'), 'utf8'),
        ),
        inventory,
        'promptfoo',
      );
      result.downloadedAssets = inventoryTree(path.join(consumer, 'assets'));
    } catch (error) {
      passed = false;
      result.status = 'inventory-failed';
      result.error = error instanceof Error ? error.message : String(error);
      save();
      continue;
    }
    result.lockfileSha256 = sha256(path.join(consumer, 'package-lock.json'));
    assert.equal(
      result.lockfileSha256,
      report.lockfileSha256,
      'npm ci changed the consumer lockfile',
    );
    if (install.code !== 0 || install.timedOut) {
      passed = false;
      result.status = 'install-failed';
      save();
      continue;
    }
    const tree = await run(
      npm.command,
      [...npm.prefix, 'ls', '--all', '--json'],
      consumer,
      profileEnv,
      path.join(logs, 'npm-ls'),
    );
    result.dependencyTree = tree;
    // npm ls failures remain visible and fail acceptance, while probes still explain usability.
    if (tree.code !== 0) {
      passed = false;
    }
    const probes = await probeConsumer(consumer, logs, profileEnv, runs);
    Object.assign(result, probes);
    result.passed = probes.passed && tree.code === 0 && !tree.timedOut;
    passed = Boolean(result.passed) && passed;
    result.status = 'measured';
    save();
  }
  report.passed = passed;
  save();
  console.log(`Report: ${path.join(output, 'report.json')}`);
  return passed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  measureInstallProfiles()
    .then((passed) => {
      process.exitCode = passed ? 0 : 1;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
