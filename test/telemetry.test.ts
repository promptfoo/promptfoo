import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

jest.mock('../src/fetch', () => ({
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

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve({ ok: true } as Response));

    sendEventSpy = jest.spyOn(Telemetry.prototype, 'sendEvent' as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    jest.restoreAllMocks();
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

  it('should include version and CI status in telemetry events', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    const isCI = jest.requireMock('../src/envars').isCI;
    isCI.mockReturnValue(true);
    fetchSpy.mockClear();

    const _telemetry = new Telemetry();
    _telemetry.record('feature_used', { test: 'value' });

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
