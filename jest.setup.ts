/* eslint-disable jest/require-top-level-describe */
import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';

// Mock common dependencies
jest.mock('./src/logger', () => {
  const actual = jest.requireActual('./src/logger');
  let mockLogCallback: ((message: string) => void) | null = null;
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual.default,
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setLogCallback: jest.fn((callback: ((message: string) => void) | null) => {
      mockLogCallback = callback;
    }),
    get globalLogCallback() {
      return mockLogCallback;
    },
  };
});

// Mock global config by default
jest.mock('./src/globalConfig/globalConfig', () => ({
  __esModule: true,
  default: {},
  readGlobalConfig: jest.fn().mockReturnValue({}),
  writeGlobalConfig: jest.fn(),
  writeGlobalConfigPartial: jest.fn(),
}));

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
