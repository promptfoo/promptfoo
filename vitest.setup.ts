/**
 * Vitest setup file for all backend tests
 *
 * This file configures the test environment for all tests in the test/ directory.
 */

import { afterAll, afterEach, vi } from 'vitest';

const TEST_CONFIG_DIR = './.local/vitest/config';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.PROMPTFOO_CACHE_TYPE = 'memory';
process.env.IS_TESTING = 'true';
process.env.PROMPTFOO_CONFIG_DIR = TEST_CONFIG_DIR;

// Set mock API keys to prevent authentication errors during tests
// These are dummy values that allow provider instantiation without real credentials
process.env.ANTHROPIC_API_KEY = 'test-anthropic-api-key';
process.env.AZURE_OPENAI_API_HOST = 'test.openai.azure.com';
process.env.AZURE_OPENAI_API_KEY = 'test-azure-api-key';
process.env.AZURE_API_KEY = 'test-azure-api-key';
process.env.HF_API_TOKEN = 'test-hf-token';
process.env.OPENAI_API_KEY = 'test-openai-api-key';

// Clean up any remote generation URL
delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;

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
});
