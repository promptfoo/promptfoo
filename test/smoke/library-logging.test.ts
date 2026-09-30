import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it.each(['cjs', 'esm'])('formats warning and error logs through the built %s library', (format) => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-library-logging-'));
  temporaryDirectories.push(configDir);
  const entry = path.join(root, 'dist/src', format === 'cjs' ? 'index.cjs' : 'index.js');
  const load =
    format === 'cjs'
      ? `const { evaluate } = require(${JSON.stringify(entry)});`
      : `import { evaluate } from ${JSON.stringify(pathToFileURL(entry).href)};`;
  const script = `${load}
    (async () => {
      const successful = await evaluate({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ assert: [{ type: 'javascript', value: '1', metric: '__count' }] }],
        derivedMetrics: [{ name: 'Count', value: () => 1 }],
      }, { cache: false });
      const success = await successful.toEvaluateSummary();
      if (!success.results[0].success) throw new Error('Expected successful evaluation');

      const failed = await evaluate({
        prompts: ['hello'],
        providers: [async () => { throw new Error('logging regression fixture'); }],
        tests: [{ vars: {} }],
      }, { cache: false });
      const failure = await failed.toEvaluateSummary();
      if (failure.results[0].success || !failure.results[0].error?.includes('logging regression fixture')) {
        throw new Error('Provider error was not preserved');
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type', format === 'cjs' ? 'commonjs' : 'module', '-e', script],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
      env: {
        ...process.env,
        PROMPTFOO_CONFIG_DIR: configDir,
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        LOG_LEVEL: 'warn',
        NO_COLOR: '1',
      },
    },
  );
  const output = `${result.stdout}${result.stderr}`;
  expect(result.error, output).toBeUndefined();
  expect(result.status, output).toBe(0);
  expect(output).toContain("Metric name '__count' is reserved for derived metrics");
  expect(output).toContain('Provider call failed during eval');
  expect(output).toContain('logging regression fixture');
});
