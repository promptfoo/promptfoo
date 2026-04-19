/**
 * Vitest setup file for all backend tests
 *
 * This file configures the test environment for all tests in the test/ directory.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, vi } from 'vitest';
import { mockProcessEnv } from './test/util/utils';

const TEST_CONFIG_DIR = path.join('.local', 'vitest', 'config', `worker-${process.pid}`);

mockProcessEnv({
  NODE_ENV: 'test',
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
  PROMPTFOO_REMOTE_GENERATION_URL: undefined,
});

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
afterAll(() => {
  // Reset all modules to clear any cached state
  vi.resetModules();

  // Each worker gets a unique config dir, so we can safely remove only its own files.
  rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
});
