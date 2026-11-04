import { expect, it } from 'vitest';
import { getEnvString } from '../../../src/envars';
import { mockProcessEnv } from '../../util/utils';

// Capture during import, before test hooks could hide a setup-order regression.
const importedAuthor = getEnvString('PROMPTFOO_AUTHOR');

it('starts clean while retaining executable selections and unrelated environment', () => {
  expect(importedAuthor).toBeUndefined();
  for (const key of [
    'PROMPTFOO_DISABLE_REMOTE_GENERATION',
    'OPENAI_API_BASE_URL',
    'CLAUDE_CODE_ENABLE_TELEMETRY',
    'OTEL_RESOURCE_ATTRIBUTES',
    'ENABLE_ENHANCED_TELEMETRY_BETA',
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
