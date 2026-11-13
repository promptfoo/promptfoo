import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

it('runs explicit runtimes in a fresh process without Node fallback or migrations', () => {
  const configDir = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-explicit-runtime-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'test/fixtures/evaluator/explicitRuntime.ts'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          PROMPTFOO_CONFIG_DIR: configDir,
          PROMPTFOO_CACHE_TYPE: 'memory',
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: '1',
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('"standalone":true');
    expect(result.stdout).toContain('"databaseFiles":0');
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});
