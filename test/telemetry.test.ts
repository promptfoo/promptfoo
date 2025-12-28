import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockedFunction,
  type MockInstance,
  vi,
} from 'vitest';
import * as envars from '../src/envars';
import { Telemetry } from '../src/telemetry';
import { fetchWithProxy, fetchWithTimeout } from '../src/util/fetch/index';

vi.mock('../src/util/fetch/index.ts', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
  fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid'),
}));

vi.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: vi
    .fn()
    .mockReturnValue({ id: 'test-user-id', account: { email: 'test@example.com' } }),
  writeGlobalConfig: vi.fn(),
}));

vi.mock('../src/constants', async () => {
  const actual = await vi.importActual<typeof import('../src/constants')>('../src/constants');
  return {
    ...actual,
    VERSION: '1.0.0',
  };
});

vi.mock('../src/cliState', () => ({
  __esModule: true,
  default: {
    config: undefined,
  },
}));

vi.mock('../src/envars', async () => {
  const actual = await vi.importActual<typeof import('../src/envars')>('../src/envars');
  return {
    ...actual,
    getEnvBool: vi.fn().mockImplementation((key) => {
      if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
        return process.env.PROMPTFOO_DISABLE_TELEMETRY === '1';
      }
      if (key === 'IS_TESTING') {
        return process.env.IS_TESTING === 'true' || process.env.IS_TESTING === '1';
      }
      return false;
    }),
    getEnvString: vi.fn().mockImplementation((key) => {
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
    isCI: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
  },
}));

vi.mock('../src/globalConfig/accounts', () => ({
  isLoggedIntoCloud: vi.fn().mockReturnValue(false),
  getAuthMethod: vi.fn().mockReturnValue('none'),
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
  getUserId: vi.fn().mockReturnValue('test-user-id'),
}));

vi.mock('../src/constants/build', () => ({
  POSTHOG_KEY: 'test-posthog-key',
}));

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchWithProxySpy: MockedFunction<typeof fetchWithProxy>;
  let sendEventSpy: MockInstance;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.PROMPTFOO_POSTHOG_KEY = 'test-key';

    // Get the mocked fetchWithProxy function
    fetchWithProxySpy = fetchWithProxy as MockedFunction<typeof fetchWithProxy>;
    fetchWithProxySpy.mockClear();
    fetchWithProxySpy.mockResolvedValue({ ok: true } as any);

    sendEventSpy = vi.spyOn(Telemetry.prototype, 'sendEvent' as any);

    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();

    // Reset isCI mock to default value to prevent test pollution
    vi.mocked(envars.isCI).mockReturnValue(false);
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
    expect(fetchWithProxySpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const fetchCalls = fetchWithProxySpy.mock.calls;
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
    vi.useRealTimers(); // Temporarily use real timers for this test

    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    delete process.env.IS_TESTING; // Clear IS_TESTING to allow fetch calls

    const isCIMock = vi.mocked(envars.isCI);
    const originalMockValue = isCIMock.getMockImplementation();
    isCIMock.mockReturnValue(true);
    fetchWithProxySpy.mockClear();

    const _telemetry = new Telemetry();
    _telemetry.record('feature_used', { test: 'value' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const fetchCalls = fetchWithProxySpy.mock.calls;
    expect(fetchCalls.length).toBeGreaterThan(0);

    let foundExpectedProperties = false;

    for (const call of fetchCalls) {
      if (call[1] && call[1].body && typeof call[1].body === 'string') {
        try {
          const data = JSON.parse(call[1].body);

          // Check for the structure sent to R_ENDPOINT
          if (data.meta) {
            // Verify that isRunningInCi property is present (value can be true or false depending on test order)
            if (
              data.meta.test === 'value' &&
              data.meta.packageVersion === '1.0.0' &&
              typeof data.meta.isRunningInCi === 'boolean'
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

    // Restore original mock
    if (originalMockValue) {
      isCIMock.mockImplementation(originalMockValue);
    } else {
      isCIMock.mockReturnValue(false);
    }
    process.env.IS_TESTING = 'true'; // Reset IS_TESTING
    vi.useFakeTimers(); // Restore fake timers
  });

  it('should save consent successfully', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);
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
    vi.mocked(fetchWithTimeout).mockResolvedValue({ ok: false, statusText: 'Not Found' } as any);
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

  it('should not send user events when telemetry is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';

    vi.resetModules();

    // Re-establish fetch mocks after module reset
    vi.doMock('../src/util/fetch/index.ts', () => ({
      fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
      fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
    }));

    const telemetryModule = await import('../src/telemetry');
    const { Telemetry: TelemetryClass, default: telemetryInstance } = telemetryModule;

    // Create spy on the dynamically imported class (not the statically imported one)
    const localSendEventSpy = vi.spyOn(TelemetryClass.prototype as any, 'sendEvent');

    telemetryInstance.record('eval_ran', { foo: 'bar' });

    // When telemetry is disabled, sendEvent is called with the "telemetry disabled" event
    // but NOT with the user's event ('eval_ran')
    expect(localSendEventSpy).toHaveBeenCalledWith('feature_used', {
      feature: 'telemetry disabled',
    });
    expect(localSendEventSpy).not.toHaveBeenCalledWith('eval_ran', expect.anything());
    localSendEventSpy.mockRestore();
  });

  describe('PostHog client initialization', () => {
    it('should initialize PostHog client when telemetry is enabled and POSTHOG_KEY is present', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const mockPostHog = vi.fn().mockImplementation(() => ({
        identify: vi.fn(),
        capture: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined),
      }));

      vi.resetModules();

      // Re-establish fetch mocks after module reset
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      vi.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await _telemetry.identify();

      expect(mockPostHog).toHaveBeenCalledWith('test-posthog-key', {
        host: 'https://a.promptfoo.app',
        fetch: expect.any(Function),
        flushInterval: 0,
      });
    });

    it('should handle PostHog initialization errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const mockPostHog = vi.fn().mockImplementation(() => {
        throw new Error('PostHog initialization failed');
      });

      vi.resetModules();

      // Re-establish fetch mocks after module reset
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      vi.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await expect(_telemetry.identify()).resolves.not.toThrow();
    });
  });

  describe('PostHog operations', () => {
    let mockPostHogInstance: any;
    let mockPostHog: Mock;

    beforeEach(async () => {
      mockPostHogInstance = {
        identify: vi.fn(),
        capture: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(), // Add the 'on' method for error handling
      };
      // Use a class-like constructor for PostHog
      mockPostHog = vi.fn(function (this: any) {
        Object.assign(this, mockPostHogInstance);
        return this;
      });

      // Clear all modules and re-mock
      vi.resetModules();
      vi.clearAllMocks();

      // Re-establish all mocks after module reset
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      vi.doMock('posthog-node', () => ({
        PostHog: mockPostHog,
      }));

      vi.doMock('../src/constants', async () => {
        const actual = await vi.importActual('../src/constants');
        return { ...actual, VERSION: '1.0.0' };
      });

      vi.doMock('../src/cliState', () => ({
        __esModule: true,
        default: { config: undefined },
      }));

      vi.doMock('../src/envars', async () => {
        const actual = await vi.importActual('../src/envars');
        return {
          ...actual,
          getEnvBool: vi.fn().mockImplementation((key: string) => {
            if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
              return process.env.PROMPTFOO_DISABLE_TELEMETRY === '1';
            }
            if (key === 'IS_TESTING') {
              return process.env.IS_TESTING === 'true' || process.env.IS_TESTING === '1';
            }
            return false;
          }),
          getEnvString: vi.fn().mockImplementation((key: string) => {
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
          isCI: vi.fn().mockReturnValue(false),
        };
      });

      vi.doMock('../src/logger', () => ({
        __esModule: true,
        default: { debug: vi.fn() },
      }));

      vi.doMock('../src/globalConfig/accounts', () => ({
        isLoggedIntoCloud: vi.fn().mockReturnValue(false),
        getAuthMethod: vi.fn().mockReturnValue('none'),
        getUserEmail: vi.fn().mockReturnValue('test@example.com'),
        getUserId: vi.fn().mockReturnValue('test-user-id'),
      }));

      vi.doMock('../src/constants/build', () => ({
        POSTHOG_KEY: 'test-posthog-key',
      }));

      vi.doMock('../src/globalConfig/globalConfig', () => ({
        readGlobalConfig: vi
          .fn()
          .mockReturnValue({ id: 'test-user-id', account: { email: 'test@example.com' } }),
        writeGlobalConfig: vi.fn(),
      }));

      vi.doMock('crypto', () => ({
        randomUUID: vi.fn().mockReturnValue('test-uuid'),
      }));
    });

    it('should call PostHog identify when telemetry is enabled', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await _telemetry.identify();

      expect(mockPostHogInstance.identify).toHaveBeenCalledWith({
        distinctId: 'test-user-id',
        properties: {
          email: 'test@example.com',
          isLoggedIntoCloud: false,
          authMethod: 'none',
          isRunningInCi: false,
        },
      });
      expect(mockPostHogInstance.flush).toHaveBeenCalledWith();
    });

    it('should handle PostHog identify errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.identify.mockImplementation(() => {
        throw new Error('Identify failed');
      });

      const { default: logger } = await import('../src/logger');
      const loggerSpy = vi.spyOn(logger, 'debug');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await expect(_telemetry.identify()).resolves.not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith('PostHog identify error: Error: Identify failed');
    });

    it('should call PostHog capture when sending events', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
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
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.capture.mockImplementation(() => {
        throw new Error('Capture failed');
      });

      const { default: logger } = await import('../src/logger');
      const loggerSpy = vi.spyOn(logger, 'debug');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      expect(() => _telemetry.record('eval_ran', { test: 'value' })).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith('PostHog capture error: Error: Capture failed');
    });

    it('should handle PostHog flush errors silently', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.flush.mockRejectedValue(new Error('Flush failed'));

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await expect(_telemetry.identify()).resolves.not.toThrow();
    });

    it('should call PostHog shutdown when telemetry shutdown is called', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.shutdown = vi.fn().mockResolvedValue(undefined);

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await _telemetry.shutdown();

      expect(mockPostHogInstance.shutdown).toHaveBeenCalled();
    });

    it('should handle PostHog shutdown errors gracefully', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
      delete process.env.IS_TESTING;
      process.env.PROMPTFOO_POSTHOG_KEY = 'test-posthog-key';

      mockPostHogInstance.shutdown = vi.fn().mockRejectedValue(new Error('Shutdown failed'));

      const { default: logger } = await import('../src/logger');
      const loggerSpy = vi.spyOn(logger, 'debug');
      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await expect(_telemetry.shutdown()).resolves.not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith('PostHog shutdown error: Error: Shutdown failed');
    });

    it('should handle shutdown when PostHog client is not initialized', async () => {
      process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';

      const telemetryModule = await import('../src/telemetry');
      const _telemetry = new telemetryModule.Telemetry();

      await expect(_telemetry.shutdown()).resolves.not.toThrow();
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
      vi.resetModules();

      // Re-mock fetchWithTimeout
      vi.doMock('../src/util/fetch', () => ({
        fetchWithTimeout: vi.fn().mockRejectedValue(mockError),
      }));

      // Re-mock logger to capture debug calls
      vi.doMock('../src/logger', () => ({
        __esModule: true,
        default: {
          debug: vi.fn(),
        },
      }));

      const { default: logger } = await import('../src/logger');
      const { Telemetry: TelemetryClass } = await import('../src/telemetry');

      const _telemetry = new TelemetryClass();
      await _telemetry.saveConsent('test@example.com');

      expect(logger.debug).toHaveBeenCalledWith('Failed to save consent: Network error');
    });

    it('should save consent without metadata', async () => {
      vi.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);
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

  describe('beforeExit handler registration', () => {
    const SHUTDOWN_HANDLER_KEY = Symbol.for('promptfoo.telemetry.shutdownHandler');
    const TELEMETRY_INSTANCE_KEY = Symbol.for('promptfoo.telemetry.instance');

    beforeEach(() => {
      // Clear the process-level flags before each test
      delete (process as unknown as Record<symbol, unknown>)[SHUTDOWN_HANDLER_KEY];
      delete (process as unknown as Record<symbol, unknown>)[TELEMETRY_INSTANCE_KEY];
    });

    it('should register beforeExit handler only once across multiple module loads', async () => {
      const beforeExitListenersBefore = process.listenerCount('beforeExit');

      vi.resetModules();
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      // First import
      await import('../src/telemetry');
      const listenersAfterFirst = process.listenerCount('beforeExit');

      vi.resetModules();
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      // Second import
      await import('../src/telemetry');
      const listenersAfterSecond = process.listenerCount('beforeExit');

      // Should have added exactly one listener total
      expect(listenersAfterFirst).toBe(beforeExitListenersBefore + 1);
      expect(listenersAfterSecond).toBe(listenersAfterFirst);
    });

    it('should store telemetry instance on process for beforeExit handler', async () => {
      vi.resetModules();
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      const telemetryModule = await import('../src/telemetry');
      const telemetryInstance = telemetryModule.default;

      const storedInstance = (process as unknown as Record<symbol, unknown>)[
        TELEMETRY_INSTANCE_KEY
      ];
      expect(storedInstance).toBe(telemetryInstance);
    });

    it('should update stored instance when module is reloaded', async () => {
      vi.resetModules();
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      const firstModule = await import('../src/telemetry');
      const firstInstance = firstModule.default;

      vi.resetModules();
      vi.doMock('../src/util/fetch/index.ts', () => ({
        fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
        fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
      }));

      const secondModule = await import('../src/telemetry');
      const secondInstance = secondModule.default;

      // Instances should be different (new module load)
      expect(firstInstance).not.toBe(secondInstance);

      // Stored instance should be the most recent one
      const storedInstance = (process as unknown as Record<symbol, unknown>)[
        TELEMETRY_INSTANCE_KEY
      ];
      expect(storedInstance).toBe(secondInstance);
    });
  });
});
