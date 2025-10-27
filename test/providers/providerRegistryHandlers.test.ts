import { ProviderRegistry } from '../../src/providers/providerRegistry';

type ProcessEvent = NodeJS.Signals | 'beforeExit';

type DeferredPromise = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): DeferredPromise {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

function createProcessMock() {
  const handlers = new Map<ProcessEvent, (...args: any[]) => void>();
  const exitMock = jest.fn();
  let mockProcess: any;

  const once = jest.fn((event: ProcessEvent, handler: (...args: any[]) => void) => {
    handlers.set(event, handler);
    return mockProcess;
  });

  mockProcess = {
    once,
    exit: ((code?: number) => {
      exitMock(code);
      return undefined as never;
    }) as (code?: number) => never,
    emit(event: ProcessEvent, ...args: any[]) {
      const handler = handlers.get(event);
      if (!handler) {
        return;
      }
      handlers.delete(event);
      handler(...args);
    },
    getHandler(event: ProcessEvent) {
      return handlers.get(event);
    },
    exitMock,
  };

  return mockProcess as {
    once: jest.MockedFunction<typeof once>;
    exit: (code?: number) => never;
    emit(event: ProcessEvent, ...args: any[]): void;
    getHandler(event: ProcessEvent): ((...args: any[]) => void) | undefined;
    exitMock: jest.Mock;
  };
}

describe('ProviderRegistry shutdown handlers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('waits for provider shutdown before exiting on SIGINT', async () => {
    const processMock = createProcessMock();
    const registry = new ProviderRegistry(processMock);

    const deferred = createDeferred();
    const provider = {
      shutdown: jest.fn(() => deferred.promise),
    };

    registry.register(provider);

    expect(processMock.once).toHaveBeenCalledTimes(3);

    processMock.emit('SIGINT');
    expect(provider.shutdown).toHaveBeenCalledTimes(1);
    expect(processMock.exitMock).not.toHaveBeenCalled();

    deferred.resolve();
    await flushAsyncWork();

    expect(processMock.exitMock).toHaveBeenCalledWith(130);
  });

  it('exits with signal-specific exit code on SIGTERM', async () => {
    const processMock = createProcessMock();
    const registry = new ProviderRegistry(processMock);

    registry.register({
      shutdown: jest.fn(() => Promise.resolve()),
    });

    processMock.emit('SIGTERM');
    await flushAsyncWork();

    expect(processMock.exitMock).toHaveBeenCalledWith(143);
  });

  it('does not force exit during beforeExit cleanup', () => {
    const processMock = createProcessMock();
    const registry = new ProviderRegistry(processMock);

    registry.register({
      shutdown: jest.fn(() => Promise.resolve()),
    });

    processMock.emit('beforeExit');

    expect(processMock.exitMock).not.toHaveBeenCalled();
  });
});
