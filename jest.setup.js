/* eslint-disable jest/require-top-level-describe */
import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';

// Disable all real network requests
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

nock.emitter.on('no match', (req) => {
  if (!req.host.includes('127.0.0.1') && !req.host.includes('localhost')) {
    console.error(`Unexpected HTTP request: ${req.method} ${req.href}`);
  }
});

// Ensure mocks are loaded before tests
jest.mock('fs');
jest.mock('./src/globalConfig/globalConfig');
jest.mock('./src/globalConfig/cloud');
jest.mock('./src/globalConfig/accounts');

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  // Reset fs mock state
  const mockFs = require('fs');
  mockFs.__clearMockFiles();
  // Initialize with default config
  const configPath = '/mock/config/dir/promptfoo.yaml';
  const defaultConfig = {
    account: { email: 'test-mock-user@test.example' },
    cloud: {
      appUrl: 'http://test-mock-app.example',
      apiHost: 'http://test-mock-api.example',
      apiKey: 'test-mock-key-123',
    },
  };
  mockFs.__setMockFileContent(configPath, require('js-yaml').dump(defaultConfig));
});

afterAll(async () => {
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {}
});
