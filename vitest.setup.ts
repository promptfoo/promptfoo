/**
 * Vitest setup file for all backend tests
 *
 * This file configures the test environment for all tests in the test/ directory.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, vi } from 'vitest';
import { closeTestDatabaseClients } from './src/database/testing';
import { mockProcessEnv } from './test/util/utils';

// Suppress implicit developer files in this suite; explicit fixtures still load.
vi.mock('./src/util/envFile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./src/util/envFile')>();
  return {
    ...actual,
    loadEnvFiles: (...args: Parameters<typeof actual.loadEnvFiles>) => {
      if (args[0] !== undefined) {
        actual.loadEnvFiles(...args);
      }
    },
  };
});

const TEST_CONFIG_DIR = path.join('.local', 'vitest', 'config', `worker-${process.pid}`);

// Keep test-runner and executable selections while isolating application defaults
// from the developer's shell. Unrelated variables (PATH, proxies, CI, etc.) survive.
const testRuntimeEnv = Object.fromEntries(
  [
    'PROMPTFOO_PYTHON',
    'PROMPTFOO_RUBY',
    'PROMPTFOO_NODE20_BIN',
    'PROMPTFOO_MIN_NODE_BIN',
    'PROMPTFOO_TEST_SHOW_OUTPUT',
    'PROMPTFOO_IGNORE_UNHANDLED_TEST_ERRORS',
  ].map((key) => [key, process.env[key]]),
);

mockProcessEnv(
  {
    ...testRuntimeEnv,
    NODE_ENV: 'test',
    // Protect real-loader suites during imports and children that cannot inherit mocks.
    DOTENV_PATH: path.resolve(__dirname, 'test/fixtures/test-environment/empty.env'),
    CODEX_HOME: './.local/vitest/codex-home',
    PROMPTFOO_CACHE_TYPE: 'memory',
    IS_TESTING: 'true',
    PROMPTFOO_CONFIG_DIR: TEST_CONFIG_DIR,
    ANTHROPIC_API_KEY: 'test-anthropic-api-key',
    AZURE_OPENAI_API_HOST: 'test.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-azure-api-key',
    AZURE_API_KEY: 'test-azure-api-key',
    HF_API_TOKEN: 'test-hf-token',
    OPENAI_API_KEY: 'test-openai-api-key',
    ENABLE_ENHANCED_TELEMETRY_BETA: undefined,
  },
  { clearPrefixes: ['PROMPTFOO_', 'OPENAI_', 'CLAUDE_CODE_', 'OTEL_', 'DOTENV_'] },
);

/**
 * Global cleanup after each test to prevent memory leaks.
 * This runs in every worker process after every test.
 */
afterEach(() => {
  // Clear all mocks to prevent state leakage between tests
  // Note: We use clearAllMocks() instead of restoreAllMocks() because
  // restoreAllMocks() would break tests that set up spies at module/describe
  // level expecting them to persist across tests within a describe block.
  vi.clearAllMocks();

  // Clear any pending timers
  vi.clearAllTimers();

  // Restore real timers if fake timers were used
  vi.useRealTimers();
});

/**
 * Cleanup after all tests in this worker complete.
 */
afterAll(async () => {
  await closeTestDatabaseClients();

  // Reset all modules to clear any cached state
  vi.resetModules();

  // Each worker gets a unique config dir, so we can safely remove only its own files.
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
});
