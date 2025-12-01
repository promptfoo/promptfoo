/**
 * Vitest setup file for all backend tests
 *
 * This file configures the test environment for all tests in the test/ directory.
 */

const TEST_CONFIG_DIR = './.local/vitest/config';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.PROMPTFOO_CACHE_TYPE = 'memory';
process.env.IS_TESTING = 'true';
process.env.PROMPTFOO_CONFIG_DIR = TEST_CONFIG_DIR;

// Clean up any remote generation URL
delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
