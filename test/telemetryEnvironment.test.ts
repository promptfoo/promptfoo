import { PostHog } from 'posthog-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred, mockProcessEnv } from './util/utils';

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

afterEach(async () => {
  const owners = Reflect.get(process, Symbol.for('promptfoo.telemetry.clientOwners')) as
    | Set<{ shutdown(): Promise<void> }>
    | undefined;
  await Promise.allSettled([...(owners ?? [])].map((owner) => owner.shutdown()));
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

  it.each([{ IS_TESTING: 'true' }, { PROMPTFOO_DISABLE_TELEMETRY: 'true' }])(
    'does not let a suppressed instance shut down another instance: %j',
    async (env) => {
      const { default: cliState } = await import('../src/cliState');
      const { Telemetry } = await import('../src/telemetry');
      const active = new Telemetry();
      await cliState.withEnv(env, async () => {
        const suppressed = new Telemetry();
        await suppressed.shutdown();
      });
      expect(client.shutdown).not.toHaveBeenCalled();
      active.record('eval_ran', {});
      expect(client.capture).toHaveBeenCalledOnce();
      await active.shutdown();
      expect(client.shutdown).toHaveBeenCalledOnce();
    },
  );

  it('creates a fresh client when enabled use resumes after scoped shutdown', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const nextClient = {
      ...client,
      capture: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(PostHog)
      .mockImplementationOnce(function () {
        return client as unknown as PostHog;
      })
      .mockImplementationOnce(function () {
        return nextClient as unknown as PostHog;
      });
    const telemetry = new Telemetry();
    await cliState.withEnv({ IS_TESTING: 'true' }, () => telemetry.shutdown());
    telemetry.record('eval_ran', {});
    expect(PostHog).toHaveBeenCalledTimes(2);
    expect(nextClient.capture).toHaveBeenCalledOnce();
    expect(client.capture).not.toHaveBeenCalled();
    await Promise.all([telemetry.shutdown(), telemetry.shutdown()]);
    expect(client.shutdown).toHaveBeenCalledOnce();
    expect(nextClient.shutdown).toHaveBeenCalledOnce();
  });

  it('keeps enabled instances independently owned', async () => {
    const { Telemetry } = await import('../src/telemetry');
    const nextClient = {
      ...client,
      capture: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(PostHog)
      .mockImplementationOnce(function () {
        return client as unknown as PostHog;
      })
      .mockImplementationOnce(function () {
        return nextClient as unknown as PostHog;
      });
    const first = new Telemetry();
    const second = new Telemetry();
    await first.shutdown();
    second.record('eval_ran', {});
    expect(PostHog).toHaveBeenCalledTimes(2);
    expect(client.shutdown).toHaveBeenCalledOnce();
    expect(nextClient.shutdown).not.toHaveBeenCalled();
    expect(nextClient.capture).toHaveBeenCalledOnce();
    await second.shutdown();
    expect(nextClient.shutdown).toHaveBeenCalledOnce();
  });

  it('drains live and closing instances across module reloads at process exit', async () => {
    const handlerKey = Symbol.for('promptfoo.telemetry.shutdownHandler');
    const previousFlag = Reflect.get(process, handlerKey);
    Reflect.deleteProperty(process, handlerKey);
    const once = vi.spyOn(process, 'once');
    const closing = createDeferred<void>();
    let handler: ((code: number) => void | Promise<void>) | undefined;
    try {
      const firstModule = await import('../src/telemetry');
      firstModule.default.initialize();
      const explicit = new firstModule.Telemetry();
      handler = once.mock.calls.find(([event]) => event === 'beforeExit')?.[1];
      expect(handler).toBeDefined();
      client.shutdown.mockReturnValueOnce(closing.promise);
      const explicitShutdown = explicit.shutdown();
      const owners = Reflect.get(process, Symbol.for('promptfoo.telemetry.clientOwners')) as
        | Set<unknown>
        | undefined;
      expect(owners?.has(explicit)).toBe(true);
      vi.resetModules();
      const secondModule = await import('../src/telemetry');
      new secondModule.Telemetry();
      mockProcessEnv({ IS_TESTING: 'true' });
      new secondModule.Telemetry();
      expect(PostHog).toHaveBeenCalledTimes(3);
      const exiting = handler!(0);
      await Promise.resolve();
      expect(client.shutdown).toHaveBeenCalledTimes(3);
      expect(owners?.has(explicit)).toBe(true);
      closing.resolve();
      await Promise.all([exiting, explicitShutdown]);
      expect(owners?.size).toBe(0);
    } finally {
      closing.resolve();
      if (handler) {
        process.removeListener('beforeExit', handler);
      }
      Reflect.set(process, handlerKey, previousFlag);
    }
  });

  it('retains the captured CLI host restriction across later initialization calls', async () => {
    const { Telemetry } = await import('../src/telemetry');
    const telemetry = new Telemetry(false);
    telemetry.initialize(true);
    telemetry.initialize(false);
    await telemetry.identify();
    telemetry.record('eval_ran', {});
    mockProcessEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' });
    telemetry.record('eval_ran', {});
    expect(PostHog).not.toHaveBeenCalled();
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
