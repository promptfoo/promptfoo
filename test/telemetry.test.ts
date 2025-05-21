import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid'),
}));

jest.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: jest
    .fn()
    .mockReturnValue({ id: 'test-user-id', account: { email: 'test@example.com' } }),
}));

jest.mock('../src/constants', () => ({
  VERSION: '1.0.0',
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
  let originalDate: DateConstructor;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.PROMPTFOO_POSTHOG_KEY = 'test-key';

    originalDate = global.Date;
    const mockDate = new Date('2025-05-21T20:47:30.981Z');
    global.Date = class extends Date {
      constructor() {
        super();
        return mockDate;
      }
    } as DateConstructor;

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve({ ok: true } as Response));

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.Date = originalDate;
    jest.resetAllMocks();
    fetchSpy.mockRestore();
  });

  it('should not track events with PostHog when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const _telemetry = new Telemetry();
    fetchSpy.mockClear();
    _telemetry.record('eval_ran', { foo: 'bar' });

    const calls = fetchSpy.mock.calls;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.events[0].event).toBe('feature_used');
    expect(body.events[0].properties.feature).toBe('telemetry disabled');
  });

  it('should include version in telemetry events', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    const _telemetry = new Telemetry();
    fetchSpy.mockClear();

    _telemetry.record('eval_ran', { foo: 'bar' });

    const calls = fetchSpy.mock.calls;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.events[0].properties.packageVersion).toBe('1.0.0');
  });

  it('should include version and CI status in telemetry events', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '0';
    const isCI = jest.requireMock('../src/envars').isCI;
    isCI.mockReturnValue(true);

    const _telemetry = new Telemetry();
    fetchSpy.mockClear();
    _telemetry.record('eval_ran', { test: 'value' });

    const calls = fetchSpy.mock.calls;
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.events[0].properties).toEqual(
      expect.objectContaining({
        test: 'value',
        packageVersion: '1.0.0',
        isRunningInCi: true,
      }),
    );
  });

  it('should save consent successfully', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as Response);
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
    jest.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    } as Response);
    const _telemetry = new Telemetry();

    await _telemetry.saveConsent('test@example.com');

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/consent',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', metadata: undefined }),
      }),
      1000,
    );
  });

  it('should handle error in saveConsent', async () => {
    jest.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('timeout'));
    const _telemetry = new Telemetry();
    await expect(_telemetry.saveConsent('test@example.com')).resolves.toBeUndefined();
  });
});
