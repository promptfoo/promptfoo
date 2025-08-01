import { Telemetry } from '../src/telemetry';
import { fetchWithTimeout } from '../src/util/fetch';

jest.mock('../src/util/fetch/index.ts', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid'),
}));

jest.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: jest
    .fn()
    .mockReturnValue({ id: 'test-user-id', account: { email: 'test@example.com' } }),
  writeGlobalConfig: jest.fn(),
}));

jest.mock('../src/constants', () => ({
  VERSION: '1.0.0',
}));

jest.mock('../src/cliState', () => ({
  __esModule: true,
  default: {
    config: undefined,
  },
}));

jest.mock('../src/envars', () => ({
  ...jest.requireActual('../src/envars'),
  getEnvBool: jest.fn().mockImplementation((key) => {
    if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
      return process.env.PROMPTFOO_DISABLE_TELEMETRY === '1';
    }
    if (key === 'IS_TESTING') {
      return process.env.IS_TESTING === 'true' || process.env.IS_TESTING === '1';
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

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
  },
}));

jest.mock('../src/globalConfig/accounts', () => ({
  isLoggedIntoCloud: jest.fn().mockReturnValue(false),
  getUserEmail: jest.fn().mockReturnValue('test@example.com'),
  getUserId: jest.fn().mockReturnValue('test-user-id'),
}));

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchSpy: jest.SpyInstance;
  let sendEventSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.PROMPTFOO_POSTHOG_KEY = 'test-key';

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve({ ok: true } as Response));

    sendEventSpy = jest.spyOn(Telemetry.prototype, 'sendEvent' as any);

    jest.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('should not track events with PostHog when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const _telemetry = new Telemetry();
    _telemetry.record('eval_ran', { foo: 'bar' });
    expect(sendEventSpy).not.toHaveBeenCalledWith('eval_ran', expect.anything());
  });

  it('should include version in telemetry events', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    const _telemetry = new Telemetry();
    _telemetry.record('eval_ran', { foo: 'bar' });

    expect(sendEventSpy).toHaveBeenCalledWith('eval_ran', { foo: 'bar' });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
      }),
    );

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

  it('should include version and CI status in telemetry events', async () => {
    jest.useRealTimers(); // Temporarily use real timers for this test

    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    process.env.IS_TESTING = ''; // Clear IS_TESTING to allow fetch calls

    const isCI = jest.requireMock('../src/envars').isCI;
    isCI.mockReturnValue(true);
    fetchSpy.mockClear();

    const _telemetry = new Telemetry();
    _telemetry.record('feature_used', { test: 'value' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const fetchCalls = fetchSpy.mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);

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
    isCI.mockReset();
    process.env.IS_TESTING = 'true'; // Reset IS_TESTING
    jest.useFakeTimers(); // Restore fake timers
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

    await _telemetry.saveConsent('test@example.com', { source: 'test' });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/consent',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          metadata: { source: 'test' },
        }),
      }),
      1000,
    );
  });

  it('should not initialize PostHog client when telemetry is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';

    jest.resetModules();

    const telemetryModule = await import('../src/telemetry');
    const telemetryInstance = telemetryModule.default;

    telemetryInstance.record('eval_ran', { foo: 'bar' });

    expect(sendEventSpy).toHaveBeenCalledTimes(0);
  });

  describe('PostHog client initialization', () => {
    it('should initialize PostHog client when telemetry is enabled and POSTHOG_KEY is present', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const mockPostHog = jest.fn().mockImplementation(() => ({
        identify: jest.fn(),
        capture: jest.fn(),
        flush: jest.fn().mockResolvedValue(undefined),
      }));

      jest.resetModules();
      jest.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      _telemetry.identify();

      expect(mockPostHog).toHaveBeenCalledWith('test-posthog-key', {
        host: 'https://a.promptfoo.app',
      });
    });

    it('should handle PostHog initialization errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const mockPostHog = jest.fn().mockImplementation(() => {
        throw new Error('PostHog initialization failed');
      });

      jest.resetModules();
      jest.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      expect(() => _telemetry.identify()).not.toThrow();
    });
  });

  describe('PostHog operations', () => {
    let mockPostHogInstance: any;
    let mockPostHog: jest.Mock;

    beforeEach(() => {
      mockPostHogInstance = {
        identify: jest.fn(),
        capture: jest.fn(),
        flush: jest.fn().mockResolvedValue(undefined),
      };
      mockPostHog = jest.fn().mockImplementation(() => mockPostHogInstance);

      jest.resetModules();
      jest.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));
    });

    it('should call PostHog identify when telemetry is enabled', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      _telemetry.identify();

      expect(mockPostHogInstance.identify).toHaveBeenCalledWith({
        distinctId: 'test-user-id',
        properties: { email: 'test@example.com', isLoggedIntoCloud: false },
      });
      expect(mockPostHogInstance.flush).toHaveBeenCalledWith();
    });

    it('should handle PostHog identify errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.identify.mockImplementation(() => {
        throw new Error('Identify failed');
      });

      const { default: logger } = await import('../src/logger');
      const loggerSpy = jest.spyOn(logger, 'debug');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      expect(() => _telemetry.identify()).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith('PostHog identify error: Error: Identify failed');
    });

    it('should call PostHog capture when sending events', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      _telemetry.record('eval_ran', { test: 'value' });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: 'test-user-id',
        event: 'eval_ran',
        properties: {
          test: 'value',
          packageVersion: '1.0.0',
          isRunningInCi: false,
        },
      });
      expect(mockPostHogInstance.flush).toHaveBeenCalledWith();
    });

    it('should handle PostHog capture errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.capture.mockImplementation(() => {
        throw new Error('Capture failed');
      });

      const { default: logger } = await import('../src/logger');
      const loggerSpy = jest.spyOn(logger, 'debug');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      expect(() => _telemetry.record('eval_ran', { test: 'value' })).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith('PostHog capture error: Error: Capture failed');
    });

    it('should handle PostHog flush errors silently', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = '';
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.flush.mockRejectedValue(new Error('Flush failed'));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      expect(() => _telemetry.identify()).not.toThrow();
    });
  });

  describe('telemetry disabled recording', () => {
    it('should record telemetry disabled event only once', () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
      const _telemetry = new Telemetry();

      _telemetry.record('eval_ran', { foo: 'bar' });
      expect(sendEventSpy).toHaveBeenCalledWith('feature_used', { feature: 'telemetry disabled' });
      expect(sendEventSpy).toHaveBeenCalledTimes(1);

      sendEventSpy.mockClear();
      _telemetry.record('command_used', { name: 'test' });
      expect(sendEventSpy).not.toHaveBeenCalled();
    });
  });

  describe('consent save error handling', () => {
    it('should handle network errors when saving consent', async () => {
      const mockError = new Error('Network error');

      // Reset modules to ensure clean state
      jest.resetModules();

      // Re-mock fetchWithTimeout
      jest.doMock('../src/util/fetch', () => ({
        fetchWithTimeout: jest.fn().mockRejectedValue(mockError),
      }));

      // Re-mock logger to capture debug calls
      jest.doMock('../src/logger', () => ({
        __esModule: true,
        default: {
          debug: jest.fn(),
        },
      }));

      const { default: logger } = await import('../src/logger');
      const { Telemetry: TelemetryClass } = await import('../src/telemetry');

      const _telemetry = new TelemetryClass();
      await _telemetry.saveConsent('test@example.com');

      expect(logger.debug).toHaveBeenCalledWith('Failed to save consent: Network error');
    });

    it('should save consent without metadata', async () => {
      jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);
      const _telemetry = new Telemetry();

      await _telemetry.saveConsent('test@example.com');

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        'https://api.promptfoo.dev/consent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com', metadata: undefined }),
        },
        1000,
      );
    });
  });

  describe('KA endpoint calls', () => {
    beforeEach(() => {
      jest.useRealTimers(); // Use real timers for these tests
    });

    afterEach(() => {
      jest.useFakeTimers(); // Restore fake timers
    });

    it('should send identify data to KA endpoint', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      process.env.IS_TESTING = ''; // Clear IS_TESTING to allow telemetry

      // Need to reset modules to pick up the env change
      jest.resetModules();

      // Re-mock fetchWithTimeout
      jest.doMock('../src/util/fetch', () => ({
        fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true }),
      }));

      const { fetchWithTimeout } = await import('../src/util/fetch');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      // Wait for constructor identify to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        'https://ka.promptfoo.app/',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ profile_id: 'test-user-id', email: 'test@example.com' }),
        }),
        1000,
      );
    });

    it('should handle KA endpoint errors silently', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      fetchSpy.mockRejectedValue(new Error('KA endpoint error'));

      const _telemetry = new Telemetry();

      // Should not throw error
      expect(() => _telemetry.identify()).not.toThrow();
    });
  });
});
