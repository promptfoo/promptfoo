/* eslint-disable jest/require-top-level-describe */
import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';
import type { Logger } from './src/logger';

// Mock common dependencies
jest.mock('./src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as jest.Mocked<Logger>,
}));

jest.mock('./src/globalConfig/globalConfig', () => ({
  __esModule: true,
  default: {} as Record<string, unknown>,
}));

interface CliState {
  remote: boolean;
}

jest.mock('./src/cliState', () => ({
  __esModule: true,
  default: { remote: false } as CliState,
}));

// Disable all real network requests
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

nock.emitter.on('no match', (req: nock.ClientRequest) => {
  if (!req.host.includes('127.0.0.1') && !req.host.includes('localhost')) {
    console.error(`Unexpected HTTP request: ${req.method} ${req.href}`);
  }
});

afterAll(async () => {
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {
    // Ignore error if directory doesn't exist
  }
});
