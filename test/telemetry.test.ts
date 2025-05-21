import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

// Mock fetch
jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid'),
}));

// Mock globalConfig
jest.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: jest
    .fn()
    .mockReturnValue({ id: 'test-user-id', account: { email: 'test@example.com' } }),
}));

// Mock constants
jest.mock('../src/constants', () => ({
  VERSION: '1.0.0',
}));

// Mock envars
jest.mock('../src/envars', () => ({
  ...jest.requireActual('../src/envars'),
  getEnvBool: jest.fn().mockImplementation((key) => {
    if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
      return process.env.PROMPTFOO_DISABLE_TELEMETRY === '1';
    }
    if (key === 'IS_TESTING') {
      return false;
    }
    return false;
  }),
  getEnvString: jest.fn().mockImplementation((key) => {
    if (key === 'PROMPTFOO_POSTHOG_KEY') {
      return process.env.PROMPTFOO_POSTHOG_KEY || 'test-key';
    }
    if (key === 'PROMPTFOO_POSTHOG_HOST') {
      return process.env.PROMPTFOO_POSTHOG_HOST || undefined;
    }
    if (key === 'NODE_ENV') {
      return process.env.NODE_ENV || undefined;
    }
    return undefined;
  }),
  isCI: jest.fn().mockReturnValue(false),
}));

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchSpy: jest.SpyInstance;
  let sendEventSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.PROMPTFOO_POSTHOG_KEY = 'test-key';

    // Setup fetch spy
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve({ ok: true } as Response));

    // Mock the private sendEvent method
    sendEventSpy = jest.spyOn(Telemetry.prototype, 'sendEvent' as any);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
    fetchSpy.mockRestore();
    sendEventSpy.mockRestore();
  });

  it('should not track events with PostHog when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';

    // Create telemetry instance with telemetry disabled
    const _telemetry = new Telemetry();

    // Record an event
    _telemetry.record('eval_ran', { foo: 'bar' });

    // sendEvent should not be called with the eval_ran event
    expect(sendEventSpy).not.toHaveBeenCalledWith('eval_ran', expect.anything());
  });

  it('should include version in telemetry events', () => {
    // Ensure telemetry is not disabled
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';

    // Create telemetry instance
    const _telemetry = new Telemetry();

    // Record an event
    _telemetry.record('eval_ran', { foo: 'bar' });

    // Check that sendEvent was called with the expected metadata
    expect(sendEventSpy).toHaveBeenCalledWith('eval_ran', { foo: 'bar' });

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
      }),
    );

    // Verify packageVersion is included in the events
    const fetchCalls = fetchSpy.mock.calls;
    let foundVersion = false;

    for (const call of fetchCalls) {
      if (
        call[1] &&
        call[1].body &&
        typeof call[1].body === 'string' &&
        call[1].body.includes('packageVersion')
      ) {
        foundVersion = true;
        break;
      }
    }

    expect(foundVersion).toBe(true);
  });

  it('should include version and CI status in telemetry events', () => {
    // Ensure telemetry is not disabled
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';

    // Mock the isCI function to return true for this test
    const isCI = jest.requireMock('../src/envars').isCI;
    isCI.mockReturnValue(true);

    // Spy on fetch to see what data is actually sent
    fetchSpy.mockClear();

    // Create telemetry instance
    const _telemetry = new Telemetry();

    // Call sendEvent directly with our own properties
    // @ts-ignore - accessing private method for testing
    _telemetry.sendEvent('test_event', { test: 'value' });

    // Check the fetch calls to see the actual data sent to the server
    const fetchCalls = fetchSpy.mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);

    // Parse the fetch request body to check for properties
    let foundExpectedProperties = false;

    for (const call of fetchCalls) {
      if (call[1] && call[1].body && typeof call[1].body === 'string') {
        try {
          const data = JSON.parse(call[1].body);

          if (data.events && data.events.length > 0) {
            const properties = data.events[0].properties;

            if (
              properties &&
              properties.test === 'value' &&
              properties.packageVersion === '1.0.0' &&
              properties.isRunningInCi === true
            ) {
              foundExpectedProperties = true;
              break;
            }
          }
        } catch {
          // Skip JSON parse errors
        }
      }
    }

    expect(foundExpectedProperties).toBe(true);

    // Reset mocks
    isCI.mockReset();
  });

  it('should save consent successfully', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);
    const _telemetry = new Telemetry();

    await _telemetry.saveConsent('test@example.com', { source: 'test' });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/consent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com', metadata: { source: 'test' } }),
      },
      1000,
    );
  });

  it('should handle failed consent save', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: false, statusText: 'Not Found' } as any);
    const _telemetry = new Telemetry();

    await _telemetry.saveConsent('test@example.com');

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/consent',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
      expect.any(Number),
    );
  });
});
