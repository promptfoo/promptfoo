import packageJson from '../package.json';
import { fetchWithTimeout } from '../src/fetch';
import { Telemetry } from '../src/telemetry';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));
jest.mock('../src/globalConfig', () => ({
  maybeRecordFirstRun: jest.fn(),
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

  it('should not record events when telemetry is disabled', () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    expect(telemetry['events']).toHaveLength(0);
  });

  it('should record events when telemetry is enabled', () => {
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

  it('should not send events when telemetry is disabled and send is called', async () => {
    process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
    const telemetry = new Telemetry();
    telemetry.record('eval_ran', { foo: 'bar' });
    await telemetry.send();

    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});
