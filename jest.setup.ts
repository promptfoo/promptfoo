/* eslint-disable jest/require-top-level-describe */
import { rm } from 'fs/promises';
import type { IncomingMessage } from 'http';
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

// Disable all real network requests
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

nock.emitter.on('no match', (req: IncomingMessage) => {
  if (!req.headers?.host?.includes('127.0.0.1') && !req.headers?.host?.includes('localhost')) {
    console.error(`Unexpected HTTP request: ${req.method} ${req.url}`);
  }
});

afterAll(async () => {
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {
    // Ignore error if directory doesn't exist
  }
});
