/**
 * Vitest setup file for codeScans tests
 *
 * This is a minimal setup for the codeScans test suite.
 * As we migrate more tests, we can expand this setup.
 */

const TEST_CONFIG_DIR = './.local/vitest/config';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.PROMPTFOO_CACHE_TYPE = 'memory';
process.env.IS_TESTING = 'true';
process.env.PROMPTFOO_CONFIG_DIR = TEST_CONFIG_DIR;

// Clean up any remote generation URL
delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
