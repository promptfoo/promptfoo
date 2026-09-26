import { PostHog } from 'posthog-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

const client = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn(),
  shutdown: vi.fn(),
}));

const request = vi.hoisted(() => vi.fn());

vi.mock('posthog-node', () => ({ PostHog: vi.fn() }));
vi.mock('../src/constants/build', () => ({ POSTHOG_KEY: 'fixture-key' }));
vi.mock('../src/globalConfig/accounts', () => ({
  getUserId: () => 'fixture-user',
  getUserAuthInfo: () => ({}),
}));
vi.mock('../src/util/fetch/index', () => ({
  fetchWithProxy: request,
  fetchWithTimeout: vi.fn(),
}));

let restoreEnv = () => {};

beforeEach(() => {
  vi.resetModules();
  vi.mocked(PostHog).mockImplementation(function () {
    return client as unknown as PostHog;
  });
  request.mockResolvedValue({ ok: true });
  client.flush.mockResolvedValue(undefined);
  client.shutdown.mockResolvedValue(undefined);
  restoreEnv = mockProcessEnv({ IS_TESTING: undefined, PROMPTFOO_DISABLE_TELEMETRY: undefined });
});

afterEach(() => {
  restoreEnv();
  vi.resetAllMocks();
});

describe('telemetry test-mode environment restrictions', () => {
  it.each(['false', '0', ''])(
    'keeps host test mode when suite and file overrides are %j',
    async (override) => {
      mockProcessEnv({ IS_TESTING: 'true' });
      const { default: cliState } = await import('../src/cliState');
      const { Telemetry } = await import('../src/telemetry');
      const { fetchWithProxy } = await import('../src/util/fetch/index');

      await cliState.withEnvFileOverrides({ IS_TESTING: override }, () =>
        cliState.withEnv({ IS_TESTING: override }, async () => {
          const telemetry = new Telemetry();
          await telemetry.identify();
          telemetry.record('eval_ran', {});
          await telemetry.shutdown();
        }),
      );

      expect(process.env.IS_TESTING).toBe('true');
      expect(PostHog).not.toHaveBeenCalled();
      expect(client.identify).not.toHaveBeenCalled();
      expect(client.capture).not.toHaveBeenCalled();
      expect(fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it('keeps invocation-file test mode when a suite opts back in', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const { fetchWithProxy } = await import('../src/util/fetch/index');

    await cliState.withEnvFileOverrides({ IS_TESTING: 'TRUE' }, () =>
      cliState.withEnv({ IS_TESTING: 'false' }, async () => {
        const telemetry = new Telemetry();
        telemetry.record('eval_ran', {});
        await telemetry.shutdown();
      }),
    );

    expect(process.env.IS_TESTING).toBeUndefined();
    expect(PostHog).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
  it('suppresses an existing client when host test mode is enabled', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const telemetry = new Telemetry();
    expect(PostHog).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    mockProcessEnv({ IS_TESTING: 'true' });

    await cliState.withEnv({ IS_TESTING: 'false' }, async () => {
      await telemetry.identify();
      telemetry.record('eval_ran', {});
      await telemetry.shutdown();
    });

    expect(client.shutdown).toHaveBeenCalledOnce();
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.capture).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('sends the production opt-out acknowledgment after a test scope suppressed it', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const telemetry = new Telemetry(false);
    await cliState.withEnv({ IS_TESTING: 'true', PROMPTFOO_DISABLE_TELEMETRY: 'true' }, () => {
      telemetry.record('eval_ran', {});
    });
    expect(request).not.toHaveBeenCalled();
    await cliState.withEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' }, () => {
      telemetry.record('eval_ran', {});
      telemetry.record('eval_ran', {});
    });
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      meta: { feature: 'telemetry disabled' },
    });
    expect(client.capture).not.toHaveBeenCalled();
  });

  it.each(['false', '0', '', undefined])(
    'allows telemetry when test mode is %j everywhere',
    async (flag) => {
      mockProcessEnv({ IS_TESTING: flag });
      const { default: cliState } = await import('../src/cliState');
      const { Telemetry } = await import('../src/telemetry');

      await cliState.withEnvFileOverrides({ IS_TESTING: flag }, () =>
        cliState.withEnv({ IS_TESTING: flag }, async () => {
          const telemetry = new Telemetry();
          telemetry.record('eval_ran', {});
          await telemetry.shutdown();
        }),
      );

      expect(process.env.IS_TESTING).toBe(flag);
      expect(PostHog).toHaveBeenCalledOnce();
      expect(client.identify).toHaveBeenCalledOnce();
      expect(client.capture).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    },
  );
});
