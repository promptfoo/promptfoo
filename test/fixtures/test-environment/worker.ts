import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it, vi } from 'vitest';
import { getEnvString } from '../../../src/envars';
import { createTempDir, mockProcessEnv, removeTempDir } from '../../util/utils';

// Match the loader suites: opting into the real loader must be safe during imports too.
vi.mock('../../../src/util/envFile', async (importOriginal) => importOriginal());

// Capture during import, before test hooks could hide a setup-order regression.
const importedAuthor = getEnvString('PROMPTFOO_AUTHOR');
const importedProbe = process.env.PROMPTFOO_DOTENV_PROBE;

it('starts clean while retaining executable selections and unrelated environment', () => {
  expect(importedAuthor).toBeUndefined();
  expect(importedProbe).toBeUndefined();
  for (const key of [
    'PROMPTFOO_DISABLE_REMOTE_GENERATION',
    'OPENAI_API_BASE_URL',
    'CLAUDE_CODE_ENABLE_TELEMETRY',
    'OTEL_RESOURCE_ATTRIBUTES',
    'ENABLE_ENHANCED_TELEMETRY_BETA',
    'DOTENV_CONFIG_PATH',
    'DOTENV_ENCODING',
    'DOTENV_CONFIG_ENCODING',
    'DOTENV_OVERRIDE',
    'DOTENV_CONFIG_OVERRIDE',
  ]) {
    expect(process.env[key], key).toBeUndefined();
  }
  expect(process.env).toMatchObject({
    NODE_ENV: 'test',
    IS_TESTING: 'true',
    PROMPTFOO_CACHE_TYPE: 'memory',
    OPENAI_API_KEY: 'test-openai-api-key',
    PROMPTFOO_PYTHON: '/fixture/python',
    PROMPTFOO_RUBY: '/fixture/ruby',
    PROMPTFOO_NODE20_BIN: '/fixture/node20',
    PROMPTFOO_MIN_NODE_BIN: '/fixture/node-min',
    PROMPTFOO_TEST_SHOW_OUTPUT: 'true',
    PROMPTFOO_IGNORE_UNHANDLED_TEST_ERRORS: 'false',
    HTTPS_PROXY: 'http://host-proxy.invalid:8080',
    CI: '1',
    PATH: process.env.TEST_ENVIRONMENT_PATH,
  });

  const restoreEnv = mockProcessEnv({ PROMPTFOO_AUTHOR: 'explicit-test-author' });
  try {
    expect(getEnvString('PROMPTFOO_AUTHOR')).toBe('explicit-test-author');
  } finally {
    restoreEnv();
  }
  expect(getEnvString('PROMPTFOO_AUTHOR')).toBeUndefined();
});

it.each([false, true])('isolates child processes unless a fixture is selected (%s)', (explicit) => {
  const tempDir = createTempDir('promptfoo-test-child-env-');
  try {
    const envFile = path.join(tempDir, '.env');
    writeFileSync(envFile, 'PROMPTFOO_DOTENV_PROBE=child-fixture\n');
    const envarsUrl = pathToFileURL(path.resolve(__dirname, '../../../src/envars.ts')).href;
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(require.resolve('tsx')).href,
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(envarsUrl)});
         process.stdout.write(process.env.PROMPTFOO_DOTENV_PROBE ?? 'missing');`,
      ],
      {
        cwd: tempDir,
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, ...(explicit ? { DOTENV_PATH: envFile } : {}) },
      },
    );

    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(explicit ? 'child-fixture' : 'missing');
  } finally {
    removeTempDir(tempDir);
  }
});
