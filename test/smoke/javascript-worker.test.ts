import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('built JavaScript assertion worker', () => {
  let configDir: string;

  beforeAll(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-worker-smoke-'));
  });

  afterAll(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it.each([
    [['--input-type=module'], "import { assertions } from './dist/src/index.js';"],
    [['--input-type', 'commonjs'], "const { assertions } = require('./dist/src/index.cjs');"],
  ])('runs a file worker from a string library entry point %j', (flags, load) => {
    const result = spawnSync(
      process.execPath,
      [
        ...flags,
        '-e',
        `${load}
        assertions.runAssertion({
          assertion: { type: 'javascript', executionMode: 'worker', value: 'output === "fixture"' },
          test: {},
          providerResponse: { output: 'fixture' },
        }).then(result => {
          if (!result.pass || result.score !== 1) throw new Error(result.reason);
          console.log('worker passed');
        }).catch(error => { console.error(error); process.exitCode = 1; });`,
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_UPDATE: 'true',
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('worker passed');
  });
});
