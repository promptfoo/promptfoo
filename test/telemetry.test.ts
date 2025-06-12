import packageJson from '../package.json';
import cliState from '../src/cliState';
import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../package.json', () => ({
  version: '1.0.0',
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

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.mocked(fetchWithTimeout).mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should record only the "telemetry disabled" event when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    expect(telemetry['events']).toHaveLength(1);
    expect(telemetry['events'][0]).toEqual({
      event: 'feature_used',
      packageVersion: packageJson.version,
      properties: { feature: 'telemetry disabled' },
    });
  });

  it('should record events when telemetry is enabled', () => {
    delete process.env.PROMPTFOO_DISABLE_TELEMETRY;
    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    expect(telemetry['events']).toHaveLength(1);
    expect(telemetry['events'][0]).toEqual({
      event: 'eval_ran',
      packageVersion: packageJson.version,
      properties: { foo: 'bar', isRunningInCi: false, isRedteam: false },
    });
  });

  it('should send events and clear events array when telemetry is enabled and send is called', async () => {
    delete process.env.PROMPTFOO_DISABLE_TELEMETRY;
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);

    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    await telemetry.send();

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/telemetry',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            event: 'eval_ran',
            packageVersion: '1.0.0',
            properties: { foo: 'bar', isRedteam: false, isRunningInCi: false },
          },
        ]),
      },
      1000,
    );
    expect(telemetry['events']).toHaveLength(0);
  });

  it('should send only the "telemetry disabled" event when telemetry is disabled and send is called', async () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);

    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    await telemetry.send();

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/telemetry',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            event: 'feature_used',
            packageVersion: '1.0.0',
            properties: { feature: 'telemetry disabled' },
          },
        ]),
      },
      1000,
    );
    expect(telemetry['events']).toHaveLength(0);
  });

  it('should send telemetry disabled event only once', async () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    jest.mocked(fetchWithTimeout).mockResolvedValue({ ok: true } as any);

    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    await telemetry.send();

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/telemetry',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            event: 'feature_used',
            packageVersion: '1.0.0',
            properties: { feature: 'telemetry disabled' },
          },
        ]),
      },
      1000,
    );

    // Record another event and send again
    telemetry.record('command_used', { command: 'test' });
    await telemetry.send();

    // Ensure fetchWithTimeout was not called again
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('should include isRedteam: true when redteam configuration is present', () => {
    delete process.env.PROMPTFOO_DISABLE_TELEMETRY;

    // Mock cliState with redteam configuration
    cliState.config = { redteam: {} } as any;

    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });

    expect(telemetry['events']).toHaveLength(1);
    expect(telemetry['events'][0]).toEqual({
      event: 'eval_ran',
      packageVersion: packageJson.version,
      properties: { foo: 'bar', isRunningInCi: false, isRedteam: true },
    });

    // Clean up
    cliState.config = undefined;
  });
});
