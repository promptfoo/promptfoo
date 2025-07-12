/* eslint-disable jest/require-top-level-describe */
import { rm } from 'fs/promises';
import nock from 'nock';
import { beforeAll, afterAll, jest } from '@jest/globals';

const TEST_CONFIG_DIR = './.local/jest/config';

// In ESM, we need to use dynamic imports for mocking
beforeAll(async () => {
  // Mock modules
  await jest.unstable_mockModule('./src/logger.js', () => ({
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  
  await jest.unstable_mockModule('./src/globalConfig/globalConfig.js', () => ({
    getGlobalConfig: jest.fn(),
    maybeReadConfig: jest.fn(),
  }));

  // Disable all real network requests
  nock.disableNetConnect();
  // Allow localhost connections for tests
  nock.enableNetConnect((host) => {
    return host.includes('127.0.0.1') || host.includes('localhost');
  });
});

afterAll(async () => {
  // Clean up nock
  nock.cleanAll();
  nock.enableNetConnect();

  // Clean up test directory
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {
    // Ignore error if directory doesn't exist
  }
});