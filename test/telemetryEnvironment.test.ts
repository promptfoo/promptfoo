import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PostHog } from 'posthog-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnvFiles } from '../src/util/envFile';
import { createDeferred, mockProcessEnv } from './util/utils';

// Exercise implicit loading with the temporary DOTENV_PATH fixture.
vi.mock('../src/util/envFile', async (importOriginal) => importOriginal());

const client = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  flush: vi.fn(),
  shutdown: vi.fn(),
}));

const request = vi.hoisted(() => vi.fn());
const loadPostHog = vi.hoisted(() => vi.fn());

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (url: string | URL) => {
      const require = actual.createRequire(url);
      return Object.assign(
        (id: string) => (id === 'posthog-node' ? loadPostHog() : require(id)),
        require,
      );
    },
  };
});

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
const hostTestModeKey = Symbol.for('promptfoo.envars.isHostTesting');
let previousHostTestMode: unknown;

beforeEach(() => {
  previousHostTestMode = Reflect.get(process, hostTestModeKey);
  Reflect.deleteProperty(process, hostTestModeKey);
  vi.resetModules();
  loadPostHog.mockReturnValue({ PostHog });
  vi.mocked(PostHog).mockImplementation(function () {
    return client as unknown as PostHog;
  });
  request.mockResolvedValue({ ok: true });
  client.flush.mockResolvedValue(undefined);
  client.shutdown.mockResolvedValue(undefined);
  restoreEnv = mockProcessEnv({ IS_TESTING: undefined, PROMPTFOO_DISABLE_TELEMETRY: undefined });
});

afterEach(async () => {
  const registry = Reflect.get(process, Symbol.for('promptfoo.telemetry.clients')) as
    | {
        clients: Set<{ client: PostHog; shutdown?: Promise<void> }>;
        exiting: boolean;
      }
    | undefined;
  if (registry) {
    await Promise.allSettled(
      [...registry.clients].map(
        (record) => (record.shutdown ??= Promise.resolve().then(() => record.client.shutdown())),
      ),
    );
    registry.clients.clear();
    registry.exiting = false;
  }
  restoreEnv();
  Reflect.set(process, hostTestModeKey, previousHostTestMode);
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('telemetry test-mode environment restrictions', () => {
  it('loads the SDK only for enabled use and reuses it across borrowers', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const telemetry = new Telemetry(false);
    await telemetry.shutdown();
    expect(loadPostHog).not.toHaveBeenCalled();

    for (const env of [{ IS_TESTING: 'true' }, { PROMPTFOO_DISABLE_TELEMETRY: 'true' }]) {
      await cliState.withEnv(env, async () => {
        telemetry.record('eval_ran', {});
        await telemetry.shutdown();
      });
      expect(loadPostHog).not.toHaveBeenCalled();
    }

    telemetry.record('eval_ran', {});
    const peer = new Telemetry();
    expect(loadPostHog).toHaveBeenCalledOnce();
    expect(PostHog).toHaveBeenCalledOnce();
    await telemetry.shutdown();
    expect(client.shutdown).not.toHaveBeenCalled();
    await peer.shutdown();
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('drains an in-flight SDK flush when the last two borrowers shut down together', async () => {
    const { PostHog: ActualPostHog } =
      await vi.importActual<typeof import('posthog-node')>('posthog-node');
    vi.mocked(PostHog).mockImplementation(function (key, options) {
      return new ActualPostHog(key, { ...options, disableCompression: true });
    });
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const events: { event: string; properties: { fixture?: string } }[] = [];
    request.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/batch/')) {
        events.push(...JSON.parse(options.body).batch);
        entered.resolve();
        await release.promise;
      }
      return Response.json({ status: 1 });
    });
    const { Telemetry } = await import('../src/telemetry');
    const first = new Telemetry();
    const last = new Telemetry();
    let drained = false;
    try {
      await entered.promise;
      first.record('eval_ran', { fixture: 'first' });
      const firstClosing = first.shutdown();
      last.record('eval_ran', { fixture: 'last' });
      const lastClosing = last.shutdown().then(() => {
        drained = true;
      });
      await new Promise(setImmediate);
      expect(PostHog).toHaveBeenCalledOnce();
      expect(drained).toBe(false);
      release.resolve();
      await Promise.all([firstClosing, lastClosing]);
      expect(
        events
          .filter(({ event }) => event === 'eval_ran')
          .map(({ properties }) => properties.fixture),
      ).toEqual(['first', 'last']);
    } finally {
      release.resolve();
      await Promise.all([first.shutdown(), last.shutdown()]);
    }
  });

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
  it('suppresses an existing client when invocation-file test mode is enabled', async () => {
    const { default: cliState } = await import('../src/cliState');
    const { Telemetry } = await import('../src/telemetry');
    const telemetry = new Telemetry();
    expect(PostHog).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    mockProcessEnv({ IS_TESTING: 'true' });

    await cliState.withEnvFileOverrides({ IS_TESTING: 'true' }, () =>
      cliState.withEnv({ IS_TESTING: 'false' }, async () => {
        await telemetry.identify();
        telemetry.record('eval_ran', {});
        await telemetry.shutdown();
      }),
    );

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

  it('keeps the shared client available until the last instance releases it', async () => {
    const { Telemetry } = await import('../src/telemetry');
    const first = new Telemetry();
    const second = new Telemetry();
    await Promise.all([first.shutdown(), first.shutdown()]);
    second.record('eval_ran', {});
    expect(PostHog).toHaveBeenCalledOnce();
    expect(client.shutdown).not.toHaveBeenCalled();
    expect(client.capture).toHaveBeenCalledOnce();
    await second.shutdown();
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('reuses one client for repeatedly constructed direct instances', async () => {
    const { Telemetry } = await import('../src/telemetry');
    const instances = Array.from({ length: 100 }, () => new Telemetry());
    try {
      expect(PostHog).toHaveBeenCalledOnce();
    } finally {
      await Promise.all(instances.map((instance) => instance.shutdown()));
    }
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('waits for a released instance to flush while another instance keeps using the client', async () => {
    const { Telemetry } = await import('../src/telemetry');
    const first = new Telemetry();
    const second = new Telemetry();
    const flushing = createDeferred<void>();
    client.flush.mockReturnValueOnce(flushing.promise);
    let finished = false;
    const releasing = first.shutdown().then(() => {
      finished = true;
    });
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(client.shutdown).not.toHaveBeenCalled();
      expect(finished).toBe(false);
      second.record('eval_ran', {});
      expect(PostHog).toHaveBeenCalledOnce();
      expect(client.capture).toHaveBeenCalledOnce();
      flushing.resolve();
      await releasing;
      expect(client.shutdown).not.toHaveBeenCalled();
    } finally {
      flushing.resolve();
      await releasing;
      await second.shutdown();
    }
    expect(client.shutdown).toHaveBeenCalledOnce();
  });

  it('suppresses both transports when another exit listener records during shutdown', async () => {
    const handlerKey = Symbol.for('promptfoo.telemetry.shutdownHandler');
    const previousFlag = Reflect.get(process, handlerKey);
    Reflect.deleteProperty(process, handlerKey);
    const once = vi.spyOn(process, 'once');
    const closing = createDeferred<void>();
    let handler: ((code: number) => void | Promise<void>) | undefined;
    let exiting: void | Promise<void> = undefined;
    try {
      const { Telemetry } = await import('../src/telemetry');
      const telemetry = new Telemetry();
      handler = once.mock.calls.find(([event]) => event === 'beforeExit')?.[1];
      expect(handler).toBeDefined();
      client.shutdown.mockReturnValueOnce(closing.promise);
      exiting = handler!(0);
      await Promise.resolve();
      telemetry.record('eval_ran', {});
      new Telemetry().record('eval_ran', {});
      expect(PostHog).toHaveBeenCalledOnce();
      expect(client.capture).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    } finally {
      closing.resolve();
      await exiting;
      if (handler) {
        process.removeListener('beforeExit', handler);
      }
      Reflect.set(process, handlerKey, previousFlag);
    }
  });

  it('drains shared and closing clients across module reloads at process exit', async () => {
    const handlerKey = Symbol.for('promptfoo.telemetry.shutdownHandler');
    const previousFlag = Reflect.get(process, handlerKey);
    Reflect.deleteProperty(process, handlerKey);
    const once = vi.spyOn(process, 'once');
    const closing = createDeferred<void>();
    let handler: ((code: number) => void | Promise<void>) | undefined;
    try {
      const firstModule = await import('../src/telemetry');
      const explicit = new firstModule.Telemetry();
      handler = once.mock.calls.find(([event]) => event === 'beforeExit')?.[1];
      expect(handler).toBeDefined();
      client.shutdown.mockReturnValueOnce(closing.promise);
      const explicitShutdown = explicit.shutdown();
      firstModule.default.initialize();
      vi.resetModules();
      const secondModule = await import('../src/telemetry');
      new secondModule.Telemetry();
      mockProcessEnv({ IS_TESTING: 'true' });
      new secondModule.Telemetry();
      expect(PostHog).toHaveBeenCalledTimes(3);
      let finished = false;
      const exiting = Promise.resolve(handler!(0)).then(() => {
        finished = true;
      });
      await Promise.resolve();
      expect(client.shutdown).toHaveBeenCalledTimes(3);
      expect(finished).toBe(false);
      closing.resolve();
      await Promise.all([exiting, explicitShutdown]);
      const registry = Reflect.get(process, Symbol.for('promptfoo.telemetry.clients')) as {
        clients: Set<unknown>;
      };
      expect(registry.clients.size).toBe(0);
    } finally {
      closing.resolve();
      if (handler) {
        process.removeListener('beforeExit', handler);
      }
      Reflect.set(process, handlerKey, previousFlag);
    }
  });

  it.each([true, false])(
    'captures host test mode for direct instances (eager=%s)',
    async (eager) => {
      mockProcessEnv({ IS_TESTING: 'true' });
      const { Telemetry } = await import('../src/telemetry');
      const telemetry = new Telemetry(eager);
      mockProcessEnv({ IS_TESTING: 'false' });
      telemetry.initialize();
      await telemetry.identify();
      telemetry.record('eval_ran', {});
      mockProcessEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' });
      telemetry.record('eval_ran', {});
      await telemetry.shutdown();
      expect(PostHog).not.toHaveBeenCalled();
      expect(client.capture).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('applies the saved CLI host restriction to instances created after env-file loading', async () => {
    mockProcessEnv({ IS_TESTING: 'true' });
    const { default: singleton } = await import('../src/telemetry');
    mockProcessEnv({ IS_TESTING: 'false' });
    singleton.initialize();
    vi.resetModules();
    const { Telemetry } = await import('../src/telemetry');
    const late = new Telemetry();
    await late.identify();
    late.record('eval_ran', {});
    mockProcessEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' });
    late.record('eval_ran', {});
    await late.shutdown();
    expect(PostHog).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([undefined, 'false'])(
    'lets an explicit env file override implicit .env test mode when the original host flag is %j',
    async (hostFlag) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-implicit-test-mode-'));
      const implicitFile = path.join(dir, '.env');
      const explicitFile = path.join(dir, 'explicit.env');
      fs.writeFileSync(implicitFile, 'IS_TESTING=true\n');
      fs.writeFileSync(explicitFile, 'IS_TESTING=false\n');
      mockProcessEnv({ IS_TESTING: hostFlag, DOTENV_PATH: implicitFile });
      try {
        const { Telemetry } = await import('../src/telemetry');
        const early = new Telemetry();
        if (hostFlag === undefined) {
          expect(PostHog).not.toHaveBeenCalled();
        }
        loadEnvFiles([explicitFile], { override: true });
        vi.resetModules();
        const { Telemetry: ReloadedTelemetry } = await import('../src/telemetry');
        const late = new ReloadedTelemetry();
        early.record('eval_ran', {});
        late.record('eval_ran', {});
        expect(process.env.IS_TESTING).toBe('false');
        expect(PostHog).toHaveBeenCalledTimes(2);
        expect(client.capture).toHaveBeenCalledTimes(2);
        await Promise.all([early.shutdown(), late.shutdown()]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it.each(['false', '0', ''])(
    'lets an isolated file override %j mask an implicit process test flag',
    async (fileFlag) => {
      const { default: cliState } = await import('../src/cliState');
      const { Telemetry } = await import('../src/telemetry');
      // The original host flag was absent; the implicit .env loaded this value later.
      mockProcessEnv({ IS_TESTING: 'true' });
      const telemetry = new Telemetry(false);
      await cliState.withEnvFileOverrides({ IS_TESTING: fileFlag }, () =>
        cliState.withEnv({ IS_TESTING: 'false' }, async () => {
          telemetry.record('eval_ran', {});
          await telemetry.shutdown();
        }),
      );
      expect(process.env.IS_TESTING).toBe('true');
      expect(client.capture).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each(['false', '0', ''])(
    'lets suite test mode %j override an implicit process default',
    async (suiteFlag) => {
      const { default: cliState } = await import('../src/cliState');
      const { Telemetry } = await import('../src/telemetry');
      mockProcessEnv({ IS_TESTING: 'true' });
      const telemetry = new Telemetry(false);
      await cliState.withEnv({ IS_TESTING: suiteFlag }, async () => {
        telemetry.record('eval_ran', {});
        await telemetry.shutdown();
      });
      expect(process.env.IS_TESTING).toBe('true');
      expect(client.capture).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    },
  );

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
