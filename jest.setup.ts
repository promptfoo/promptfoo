import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';

jest.mock('./src/logger');
jest.mock('./src/globalConfig/globalConfig');

// Track network calls for monitoring
const networkCalls: Array<{ host: string; path: string; method: string; timestamp: number }> = [];

// Configure nock with enhanced network monitoring
beforeAll(() => {
  // Disable all real network requests
  nock.disableNetConnect();

  // Allow localhost connections for tests
  nock.enableNetConnect((host) => {
    const isAllowed = host.includes('127.0.0.1') || host.includes('localhost');

    // Log all connection attempts for monitoring
    if (!isAllowed) {
      networkCalls.push({
        host,
        path: 'unknown',
        method: 'unknown',
        timestamp: Date.now(),
      });
      console.warn(`🚫 Blocked network call to: ${host}`);
    }

    return isAllowed;
  });

  // Monitor fetch calls that might bypass nock
  const originalFetch = global.fetch;

  // Only apply strict fetch blocking if not already mocked
  if (!jest.isMockFunction(global.fetch)) {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const urlObj = new URL(url);

      // Log external network attempts
      if (!urlObj.hostname.includes('localhost') && !urlObj.hostname.includes('127.0.0.1')) {
        networkCalls.push({
          host: urlObj.hostname,
          path: urlObj.pathname,
          method: init?.method || 'GET',
          timestamp: Date.now(),
        });
        console.warn(`🚫 Blocked fetch call to: ${url}`);
        throw new Error(`Network call blocked in tests: ${url}`);
      }

      // Allow local calls to proceed (if any test needs them)
      return originalFetch(input, init);
    });
  }
});

afterEach(() => {
  // Report any network calls that were attempted during the test
  if (networkCalls.length > 0) {
    console.log(`\n📊 Network calls attempted in this test: ${networkCalls.length}`);
    networkCalls.forEach((call) => {
      console.log(`  - ${call.method} ${call.host}${call.path}`);
    });
    networkCalls.length = 0; // Clear for next test
  }
});

afterAll(async () => {
  // Restore original fetch
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    jest.restoreAllMocks();
  }

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
