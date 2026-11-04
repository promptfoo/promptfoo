import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';
import { createTempDir, removeTempDir } from './util/utils';

it('isolates inherited application settings in a fresh backend test worker', () => {
  const tempDir = createTempDir('promptfoo-test-environment-');
  try {
    // Supply a synthetic developer file without reading the repository's optional .env.
    const envFile = path.join(tempDir, '.env');
    writeFileSync(envFile, 'PROMPTFOO_AUTHOR=dotenv-author\nPROMPTFOO_DOTENV_PROBE=fixture\n');
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'test/fixtures/test-environment/vitest.config.ts',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          DOTENV_PATH: envFile,
          DOTENV_CONFIG_PATH: envFile,
          DOTENV_ENCODING: 'utf8',
          DOTENV_CONFIG_ENCODING: 'utf16le',
          DOTENV_OVERRIDE: 'true',
          DOTENV_CONFIG_OVERRIDE: 'true',
          PROMPTFOO_AUTHOR: 'host-author',
          PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
          OPENAI_API_BASE_URL: 'https://host-gateway.invalid/v1',
          CLAUDE_CODE_ENABLE_TELEMETRY: '1',
          OTEL_RESOURCE_ATTRIBUTES: 'service.name=host-agent',
          ENABLE_ENHANCED_TELEMETRY_BETA: '1',
          PROMPTFOO_PYTHON: '/fixture/python',
          PROMPTFOO_RUBY: '/fixture/ruby',
          PROMPTFOO_NODE20_BIN: '/fixture/node20',
          PROMPTFOO_MIN_NODE_BIN: '/fixture/node-min',
          PROMPTFOO_TEST_SHOW_OUTPUT: 'true',
          PROMPTFOO_IGNORE_UNHANDLED_TEST_ERRORS: 'false',
          HTTPS_PROXY: 'http://host-proxy.invalid:8080',
          CI: '1',
          TEST_ENVIRONMENT_PATH: process.env.PATH,
        },
      },
    );

    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  } finally {
    removeTempDir(tempDir);
  }
});
