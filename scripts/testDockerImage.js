// Run against the final image, without host node_modules or network access:
// docker run --rm --network none -i IMAGE node --input-type=module < scripts/testDockerImage.js
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const app = process.cwd();
const require = createRequire(path.join(app, 'package.json'));
const base = 'http://127.0.0.1:3000';
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-docker-'));
const env = {
  ...process.env,
  PROMPTFOO_CONFIG_DIR: path.join(temporaryDir, 'config'),
  PROMPTFOO_CACHE_PATH: path.join(temporaryDir, 'cache'),
  PROMPTFOO_DISABLE_TELEMETRY: '1',
  PROMPTFOO_DISABLE_UPDATE: 'true',
  PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
  PROMPTFOO_NO_PROGRESS_BAR: '1',
  NO_COLOR: '1',
};

function run(command, args, expectedStatus = 0) {
  const result = spawnSync(command, args, {
    cwd: app,
    env,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, `${command}: ${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function writeFixture(name, contents) {
  const filename = path.join(temporaryDir, name);
  fs.writeFileSync(filename, contents);
  return filename;
}

function request(route) {
  const url = new URL(route, base);
  assert.equal(url.origin, base, 'Smoke requests must stay on the local server');
  // biome-ignore lint/style/noRestrictedGlobals: final-image test uses Node builtins and loopback only
  return fetch(url, { signal: AbortSignal.timeout(5000) });
}

let server;
let serverLog = '';
try {
  assert.notEqual(process.getuid(), 0, 'The final image must run as its non-root user');
  const manifest = require('./package.json');
  const { version } = manifest;
  // npm's dev+optional overlap must not silently remove supported runtime SDKs.
  for (const dependency of Object.keys(manifest.optionalDependencies).filter(
    (name) => name in manifest.devDependencies,
  )) {
    assert(
      fs.existsSync(path.join(app, 'node_modules', dependency, 'package.json')),
      `Missing runtime dependency also declared for development: ${dependency}`,
    );
  }
  for (const command of ['promptfoo', 'pf']) {
    assert.equal(run(command, ['--version']), version);
  }

  // Exercise both public module formats from the final dependency tree.
  run('node', [
    '--input-type=module',
    '-e',
    `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { evaluate } from 'promptfoo';
    import { InputTypeValues } from 'promptfoo/contracts';
    const require = createRequire(import.meta.url);
    assert.equal(typeof evaluate, 'function');
    assert.equal(typeof require('promptfoo').evaluate, 'function');
    assert.deepEqual(InputTypeValues, require('promptfoo/contracts').InputTypeValues);
  `,
  ]);

  // These optional platform packages must survive the production install.
  const { createClient } = require('@libsql/client');
  const database = createClient({ url: `file:${path.join(temporaryDir, 'native.db')}` });
  try {
    await database.execute('CREATE TABLE smoke (value TEXT)');
    await database.execute({ sql: 'INSERT INTO smoke VALUES (?)', args: ['native roundtrip'] });
    assert.equal(
      (await database.execute('SELECT value FROM smoke')).rows[0].value,
      'native roundtrip',
    );
  } finally {
    database.close();
  }
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 3);
  assert.equal(metadata.format, 'png');
  // Docker does not download Chromium; verify the remote-browser plugin can load.
  assert.equal(require('puppeteer-extra-plugin-stealth')().name, 'stealth');

  // An enum requires transpilation; do not preload tsx and mask a broken CLI loader.
  writeFixture('helper.ts', 'export enum Prefix { Value = "fixture:" }\n');
  const typescript = writeFixture(
    'provider.ts',
    `
    import { Prefix } from './helper.ts';
    export default class Provider {
      id() { return 'docker-typescript'; }
      async callApi(prompt: string) {
        return prompt === 'error' ? { error: 'fixture provider failure' } : { output: Prefix.Value + prompt };
      }
    }
  `,
  );
  const python = writeFixture(
    'provider.py',
    `
def call_api(prompt, options, context):
    if prompt == "error":
        return {"error": "fixture provider failure"}
    return {"output": "fixture:" + prompt}
`,
  );
  const summaries = [];
  for (const scenario of ['success', 'assertion-failure', 'provider-error']) {
    const prompt = scenario === 'provider-error' ? 'error' : 'hello';
    const config = writeFixture(
      `${scenario}.json`,
      JSON.stringify({
        description: `Docker smoke ${scenario}`,
        prompts: [prompt],
        providers: [`file://${typescript}`, `file://${python}`],
        tests: [
          {
            assert: [
              {
                type: 'equals',
                value: scenario === 'assertion-failure' ? 'wrong' : 'fixture:hello',
              },
            ],
          },
        ],
      }),
    );
    const output = path.join(temporaryDir, `${scenario}-output.json`);
    run(
      'promptfoo',
      [
        'eval',
        '-c',
        config,
        '-o',
        output,
        '--no-cache',
        '--no-table',
        '--no-progress-bar',
        '--max-concurrency',
        '1',
        ...(scenario === 'success' ? [] : ['--no-write']),
      ],
      scenario === 'success' ? 0 : 100,
    );
    const {
      results: { results },
    } = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.success, scenario === 'success', JSON.stringify(result));
      assert.equal(result.score, scenario === 'success' ? 1 : 0, JSON.stringify(result));
      if (scenario === 'provider-error') {
        assert.match(result.error, /fixture provider failure/);
        assert.equal(result.response.error, 'fixture provider failure');
      } else {
        assert.equal(result.response.output, 'fixture:hello');
        assert.equal(result.response.error, undefined);
        if (scenario === 'success') {
          assert.equal(result.error, undefined);
        } else {
          assert.match(result.error, /Expected output/);
        }
      }
    }
    summaries.push({
      scenario,
      results: results.map(({ success, score, error, response }) => ({
        success,
        score,
        error,
        response,
      })),
    });
  }

  server = spawn('node', ['dist/src/server/index.js'], {
    cwd: app,
    env: { ...env, API_PORT: '3000', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  server.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, serverLog);
    try {
      ready = (await request('/health')).ok;
    } catch {
      // The process may still be starting and applying migrations.
    }
    if (ready) {
      break;
    }
    await delay(500);
  }
  assert(ready, `Server did not become healthy:\n${serverLog}`);
  const page = await request('/');
  assert(page.ok);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  for (const extension of ['js', 'css']) {
    const asset = html.match(new RegExp(`(?:src|href)="([^"]+\\.${extension})"`))?.[1];
    assert(asset, `Missing built ${extension} asset in HTML`);
    const response = await request(asset);
    assert(response.ok, `Missing asset: ${asset}`);
    assert.match(
      response.headers.get('content-type'),
      extension === 'js' ? /javascript/ : /text\/css/,
    );
    assert((await response.text()).length > 0);
  }
  const list = await request('/api/results');
  assert(list.ok);
  const { data } = await list.json();
  assert.equal(
    data.length,
    1,
    'Server must read the successful CLI eval from the isolated database',
  );
  assert.equal(data[0].description, 'Docker smoke success');
  const detail = await request(`/api/results/${data[0].evalId}`);
  assert(detail.ok);
  const persisted = (await detail.json()).data;
  assert.equal(persisted.config.description, 'Docker smoke success');
  assert.equal(persisted.results.results.length, 2);
  for (const result of persisted.results.results) {
    assert.equal(result.success, true);
    assert.equal(result.score, 1);
    assert.equal(result.response.output, 'fixture:hello');
    assert.equal(result.error, undefined);
  }
  assert.equal((await request('/api/results/missing-eval')).status, 404);

  if (process.env.PROMPTFOO_TEST_PRODUCTION_DEPS === '1') {
    for (const dependency of ['vitest', '@docusaurus/core', '@testing-library/react']) {
      assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' });
    }
  }
  console.log(
    JSON.stringify(
      {
        version,
        native: ['libsql', 'sharp'],
        server: 'health, UI JS/CSS, persisted eval, missing eval',
        evals: summaries,
      },
      null,
      2,
    ),
  );
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    const forceKill = setTimeout(() => server.kill('SIGKILL'), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(forceKill);
    }
  }
  fs.rmSync(temporaryDir, { recursive: true, force: true });
}
