import { PostHog } from 'posthog-node';
import { getEnvBool } from '../src/envars';
import { fetchWithTimeout } from '../src/fetch';
import logger from '../src/logger';
import { Telemetry } from '../src/telemetry';

jest.mock('posthog-node', () => {
  const mockCapture = jest.fn();
  const mockIdentify = jest.fn();

  return {
    PostHog: jest.fn().mockImplementation(() => ({
      capture: mockCapture,
      identify: mockIdentify,
    })),
  };
});

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

jest.mock('../src/logger', () => ({
  debug: jest.fn(),
}));

jest.mock('../src/envars', () => ({
  getEnvBool: jest.fn().mockImplementation((key: string) => {
    if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
      return false;
    }
    if (key === 'IS_TESTING') {
      return false;
    }
    return false;
  }),
  getEnvString: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
    if (key === 'PROMPTFOO_POSTHOG_KEY') {
      return process.env.PROMPTFOO_POSTHOG_KEY || defaultValue;
    }
    if (key === 'PROMPTFOO_POSTHOG_HOST') {
      return process.env.PROMPTFOO_POSTHOG_HOST || defaultValue;
    }
    return defaultValue;
  }),
}));

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockPostHogInstance: any;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.PROMPTFOO_POSTHOG_KEY = 'test-key';

    mockFetch = jest.fn().mockResolvedValue({ ok: true } as any);
    global.fetch = mockFetch;

    jest.mocked(PostHog).mockClear();
    mockPostHogInstance = {
      capture: jest.fn(),
      identify: jest.fn(),
    };
    jest.mocked(PostHog).mockReturnValue(mockPostHogInstance);
    jest.mocked(logger.debug).mockClear();
    jest.mocked(fetchWithTimeout).mockClear();

    const { readGlobalConfig } = jest.requireMock('../src/globalConfig/globalConfig');
    readGlobalConfig.mockReturnValue({
      id: 'test-user-id',
      account: { email: 'test@example.com' },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
    jest.resetModules();
  });

  it('should not track events with PostHog when telemetry is disabled', () => {
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
        return true;
      }
      return false;
    });

    const _telemetry = new Telemetry();
    _telemetry.record('eval_ran', { foo: 'bar' });
    expect(mockPostHogInstance.capture).not.toHaveBeenCalled();
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

    expect(jest.mocked(logger.debug).mock.calls).toEqual(
      expect.arrayContaining([
        ['Telemetry enabled: true'],
        ['Failed to save consent: Failed to save consent: Not Found'],
      ]),
    );
  });

  it('should call recordTelemetryDisabled only once when telemetry is disabled', () => {
    jest.mocked(getEnvBool).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
        return true;
      }
      return false;
    });

    const { readGlobalConfig } = jest.requireMock('../src/globalConfig/globalConfig');
    readGlobalConfig.mockReturnValue({
      id: 'test-user-id',
      account: { email: 'test@example.com' },
    });

    const _telemetry = new Telemetry();
    const spy = jest.spyOn(_telemetry as any, 'sendEvent').mockImplementation(() => {});

    _telemetry.record('eval_ran', { foo: 'bar' });
    _telemetry.record('eval_ran', { foo: 'baz' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('feature_used', { feature: 'telemetry disabled' });
  });
});
