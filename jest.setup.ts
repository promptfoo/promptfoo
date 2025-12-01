import { rm } from 'fs/promises';
import nock from 'nock';
import { TEST_CONFIG_DIR } from './.jest/setEnvVars';

jest.mock('./src/logger');
jest.mock('./src/globalConfig/globalConfig');

// Don't mock telemetry module - let tests work but prevent network calls with nock

// Don't mock remoteGeneration functions - let nock handle the network calls

// Don't mock updates module - let nock handle the network calls

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

  // Only monitor fetch calls for logging - let nock handle the blocking
  const originalFetch = global.fetch;

  // Monitor but don't block - let nock handle it
  if (!jest.isMockFunction(global.fetch)) {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const urlObj = new URL(url);

      // Log external network attempts for monitoring only
      if (!urlObj.hostname.includes('localhost') && !urlObj.hostname.includes('127.0.0.1')) {
        networkCalls.push({
          host: urlObj.hostname,
          path: urlObj.pathname,
          method: init?.method || 'GET',
          timestamp: Date.now(),
        });
      }

      // Always call the original fetch and let nock handle interception
      return originalFetch(input, init);
    });
  }
});

// Set up nock interceptors before each test to avoid conflicts with test-specific mocks
beforeEach(() => {
  // Skip nock setup for tests that mock global.Function (like sagemaker tests)
  if (jest.isMockFunction(global.Function)) {
    return;
  }

  // Mock promptfoo API endpoints with nock
  nock('https://api.promptfoo.app')
    .persist()
    .post('/api/v1/task')
    .reply(200, { status: 'success', data: 'mocked response' })
    .post('/api/v1/task/harmful')
    .reply(200, { status: 'success', data: 'mocked harmful response' })
    .get('/version')
    .reply(200, { version: '1.0.0' })
    .get('/health')
    .reply(200, { status: 'ok' });

  // Mock telemetry endpoints
  nock('https://r.promptfoo.app').persist().post('/').reply(200, { status: 'success' });

  nock('https://a.promptfoo.app').persist().post(/.*/).reply(200, { status: 'success' });

  nock('https://api.promptfoo.dev')
    .persist()
    .get('/api/latestVersion')
    .reply(200, { latestVersion: '1.0.0' })
    .post('/consent')
    .reply(200, { status: 'success' });

  // Mock other external APIs
  nock('https://pypi.org')
    .persist()
    .get('/pypi/modelaudit/json')
    .reply(200, { info: { version: '1.0.0' } });
});

afterEach(() => {
  // Report any network calls that were attempted during the test
  if (networkCalls.length > 0) {
    console.log(`\n📊 Network calls attempted in this test: ${networkCalls.length}`);
    networkCalls.forEach((call) => {
      console.log(`  - ${call.method} ${call.host}${call.path}`);
    });
  }
  networkCalls.length = 0; // Clear for next test

  // Clean up nock interceptors after each test to prevent socket issues on Windows
  // This helps avoid EINVAL errors from @mswjs/interceptors when sockets aren't properly closed
  nock.abortPendingRequests();
  nock.cleanAll();
});

afterAll(async () => {
  // Restore original fetch
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    jest.restoreAllMocks();
  }

  // Clean up nock
  nock.abortPendingRequests();
  nock.cleanAll();
  nock.enableNetConnect();

  // Clean up test directory
  try {
    await rm(TEST_CONFIG_DIR, { recursive: true });
  } catch {
    // Ignore error if directory doesn't exist
  }
});
