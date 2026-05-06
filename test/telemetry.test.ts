import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  type MockInstance,
  vi,
} from 'vitest';
import * as envars from '../src/envars';
import { TELEMETRY_EVENTS, Telemetry, TelemetryEventSchema } from '../src/telemetry';
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

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchWithProxySpy: MockedFunction<typeof fetchWithProxy>;
  let sendEventSpy: MockInstance;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
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

    vi.mocked(envars.isCI).mockReturnValue(false);
  });

  it('should not track user events when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const _telemetry = new Telemetry();
    _telemetry.record('eval_ran', { foo: 'bar' });
    expect(sendEventSpy).not.toHaveBeenCalledWith('eval_ran', expect.anything());
  });

  it('re-exports telemetry DTO helpers for deep import compatibility', () => {
    expect(TELEMETRY_EVENTS).toContain('webui_api');

    expect(
      TelemetryEventSchema.parse({
        event: 'webui_api',
        properties: { route: '/api/results', ok: true, count: 1, tags: ['api'] },
      }),
    ).toEqual({
      event: 'webui_api',
      packageVersion: '1.0.0',
      properties: { route: '/api/results', ok: true, count: 1, tags: ['api'] },
    });
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
    vi.useRealTimers();

    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    delete process.env.IS_TESTING;

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

          if (data.meta) {
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

    if (originalMockValue) {
      isCIMock.mockImplementation(originalMockValue);
    } else {
      isCIMock.mockReturnValue(false);
    }
    process.env.IS_TESTING = 'true';
    vi.useFakeTimers();
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

    vi.doMock('../src/util/fetch/index.ts', () => ({
      fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
      fetchWithProxy: vi.fn().mockResolvedValue({ ok: true }),
    }));

    const telemetryModule = await import('../src/telemetry');
    const { Telemetry: TelemetryClass, default: telemetryInstance } = telemetryModule;

    const localSendEventSpy = vi.spyOn(TelemetryClass.prototype as any, 'sendEvent');

    telemetryInstance.record('eval_ran', { foo: 'bar' });

    expect(localSendEventSpy).toHaveBeenCalledWith('feature_used', {
      feature: 'telemetry disabled',
    });
    expect(localSendEventSpy).not.toHaveBeenCalledWith('eval_ran', expect.anything());
    localSendEventSpy.mockRestore();
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

      vi.resetModules();

      vi.doMock('../src/util/fetch', () => ({
        fetchWithTimeout: vi.fn().mockRejectedValue(mockError),
      }));

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
});
