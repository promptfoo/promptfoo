import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClientSession } from '../../../src/providers/mcp/session';
import { providerRegistry } from '../../../src/providers/providerRegistry';

const mocks = vi.hoisted(() => ({
  instances: [] as Array<{
    initialize: ReturnType<typeof vi.fn>;
    cleanup: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('../../../src/providers/mcp/client', () => ({
  MCPClient: class {
    initialize = vi.fn().mockResolvedValue(undefined);
    cleanup = vi.fn().mockResolvedValue(undefined);
    constructor() {
      mocks.instances.push(this);
    }
  },
}));
vi.mock('../../../src/logger');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.instances.length = 0;
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('McpClientSession', () => {
  it('recreates a connection after each evaluation', async () => {
    const session = new McpClientSession({ enabled: true });
    for (let i = 0; i < 3; i++) {
      await providerRegistry.withEvaluation(() => session.initialize());
      expect(mocks.instances[i].cleanup).toHaveBeenCalledOnce();
      expect(session.client).toBeNull();
    }
    expect(mocks.instances).toHaveLength(3);
  });

  it('keeps a shared connection alive until both evaluations finish', async () => {
    const session = new McpClientSession({ enabled: true });
    const first = deferred<void>();
    const second = deferred<void>();
    const entered = deferred<void>();
    const a = providerRegistry.withEvaluation(async () => {
      await session.initialize();
      await first.promise;
    });
    const b = providerRegistry.withEvaluation(async () => {
      await session.initialize();
      entered.resolve();
      await second.promise;
    });
    await entered.promise;
    first.resolve();
    await a;
    expect(mocks.instances[0].cleanup).not.toHaveBeenCalled();
    second.resolve();
    await b;
    expect(mocks.instances[0].cleanup).toHaveBeenCalledOnce();
  });

  it('waits for previous cleanup before publishing a replacement', async () => {
    const session = new McpClientSession({ enabled: true });
    await session.initialize();
    const closing = deferred<void>();
    mocks.instances[0].cleanup.mockReturnValue(closing.promise);
    const cleanup = session.cleanup();
    const use = session.initialize();
    await Promise.resolve();
    expect(mocks.instances).toHaveLength(1);
    closing.resolve();
    await cleanup;
    await use;
    expect(mocks.instances).toHaveLength(2);
  });
});
