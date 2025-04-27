import { PostHog } from 'posthog-node';
import type { EnvVarKey } from '../src/envars';
import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

// Mock PostHog
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
  getEnvBool: jest.fn().mockImplementation((key) => {
    if (key === 'PROMPTFOO_DISABLE_TELEMETRY') {
      return process.env.PROMPTFOO_DISABLE_TELEMETRY === '1';
    }
    return false;
  }),
  getEnvString: jest.fn().mockImplementation((key) => {
    if (key === 'POSTHOG_KEY') {
      return process.env.POSTHOG_KEY || undefined;
    }
    if (key === 'NODE_ENV') {
      return process.env.NODE_ENV || undefined;
    }
    return undefined;
  }),
}));

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockPostHogInstance: any;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.POSTHOG_KEY = 'test-key';

    // Setup fetch mock
    mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    // Reset PostHog mock
    jest.mocked(PostHog).mockClear();
    mockPostHogInstance = {
      capture: jest.fn(),
      identify: jest.fn(),
    };
    jest.mocked(PostHog).mockImplementation(() => mockPostHogInstance);

    // Reset fetchWithTimeout mock
    jest.mocked(fetchWithTimeout).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('should not track events with PostHog when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';

    // Create telemetry instance with telemetry disabled
    const _telemetry = new Telemetry();

    // Record an event
    _telemetry.record('eval_ran', { foo: 'bar' });

    // PostHog capture should not be called
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

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/consent',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
      expect.any(Number),
    );
  });

  it('should use POSTHOG_KEY from getEnvString', () => {
    // Reset the mocks
    jest.mocked(PostHog).mockClear();

    // Set up the environment
    process.env.POSTHOG_KEY = undefined;

    // Mock getEnvString to return a key as if it came from cliState.config.env
    const { getEnvString } = jest.requireMock('../src/envars');
    jest.mocked(getEnvString).mockImplementation((key: EnvVarKey) => {
      if (key === 'POSTHOG_KEY') {
        return 'config-posthog-key';
      }
      if (key === 'NODE_ENV') {
        return process.env.NODE_ENV || undefined;
      }
      return undefined;
    });

    // Re-import to trigger the initialization code
    jest.doMock('../src/constants', () => ({
      VERSION: '1.0.0',
    }));
    require('../src/telemetry');

    // Verify PostHog was initialized with the key from getEnvString
    expect(PostHog).toHaveBeenCalledWith('config-posthog-key', expect.any(Object));
  });
});
