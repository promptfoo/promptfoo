import { mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';

jest.mock('./src/logger');
jest.mock('./src/globalConfig/globalConfig');

// Ensure test config directory exists
mkdirSync(TEST_CONFIG_DIR, { recursive: true });

// Configure nock
beforeAll(() => {
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
