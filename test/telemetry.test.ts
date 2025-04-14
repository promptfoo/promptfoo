import packageJson from '../package.json';
import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../package.json', () => ({
  version: '1.0.0',
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
      properties: { foo: 'bar' },
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
          { event: 'eval_ran', packageVersion: '1.0.0', properties: { foo: 'bar' } },
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
});
