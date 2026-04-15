/**
 * Vitest setup file for all backend tests
 *
 * This file configures the test environment for all tests in the test/ directory.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

import { afterAll, afterEach, vi } from 'vitest';

const TEST_CONFIG_DIR = path.join('.local', 'vitest', 'config', `worker-${process.pid}`);

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.CODEX_HOME = './.local/vitest/codex-home';
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
afterEach(async () => {
  // Clear all mocks to prevent state leakage between tests
  // Note: We use clearAllMocks() instead of restoreAllMocks() because
  // restoreAllMocks() would break tests that set up spies at module/describe
  // level expecting them to persist across tests within a describe block.
  vi.clearAllMocks();

  // Clear any pending timers
  vi.clearAllTimers();

  // Restore real timers if fake timers were used
  vi.useRealTimers();

  // Belt-and-braces reset for the module-scoped redteam provider loader
  // seam. Individual test files that call setRedteamProviderLoader are
  // responsible for restoring via the returned disposer, but a crash between
  // install and disposal would otherwise leak the mutated loader across
  // files under random ordering. Dynamic import keeps the redteam module
  // graph out of tests that never exercise it; after the first load Node's
  // ESM cache makes this a microtask.
  try {
    const shared = await import('./src/redteam/providers/shared');
    shared.resetRedteamProviderLoader();
  } catch {
    // Module not loadable in this test environment — nothing to reset.
  }
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
