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

afterAll(async () => {
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {}
});
