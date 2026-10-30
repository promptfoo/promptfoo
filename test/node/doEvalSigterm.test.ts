import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { doEval, SIGTERM_CLEANUP_TIMEOUT_MS, terminateOnSigterm } from '../../src/node/doEval';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { flushOtel, shutdownOtel } from '../../src/tracing/otelSdk';
import { writeMultipleOutputs } from '../../src/util/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

vi.mock('../../src/tracing/otelSdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/otelSdk')>()),
  flushOtel: vi.fn(),
  shutdownOtel: vi.fn(),
}));

vi.mock('../../src/util/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/index')>()),
  writeMultipleOutputs: vi.fn(),
}));

// The handler re-raises SIGTERM and removes every SIGTERM listener, so each test runs with only
// its own process listeners and puts the runner's back afterwards.
const events = ['SIGTERM', 'SIGINT', 'beforeExit'] as const;
type ProcessListener = (...args: unknown[]) => void;
let saved: (readonly [(typeof events)[number], ProcessListener[]])[] = [];
let kill: MockInstance<typeof process.kill>;

beforeEach(() => {
  saved = events.map((event) => [event, process.rawListeners(event) as ProcessListener[]] as const);
  for (const event of events) {
    process.removeAllListeners(event);
  }
  kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
  vi.mocked(flushOtel).mockResolvedValue();
  vi.mocked(shutdownOtel).mockResolvedValue();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [event, listeners] of saved) {
    process.removeAllListeners(event);
    for (const listener of listeners) {
      process.on(event, listener);
    }
  }
});

describe('CLI SIGTERM handling', () => {
  it('flushes spans, drains provider calls, then shuts tracing down before re-raising', async () => {
    const order: string[] = [];
    const drained = createDeferred<void>();
    const shutDown = createDeferred<void>();
    vi.mocked(flushOtel).mockImplementation(async () => {
      order.push('flush');
    });
    vi.spyOn(providerRegistry, 'shutdownForProcess').mockImplementation(async () => {
      order.push('drain');
      await drained.promise;
    });
    vi.mocked(shutdownOtel).mockImplementation(async () => {
      order.push('shutdownOtel');
      shutDown.resolve();
    });
    terminateOnSigterm();

    process.emit('SIGTERM');
    await vi.waitFor(() => expect(order).toEqual(['flush', 'drain']));
    // A call that settles during the drain can still end spans, so tracing waits for the drain.
    expect(shutdownOtel).not.toHaveBeenCalled();
    drained.resolve();
    await shutDown.promise;
    await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM'));

    expect(order).toEqual(['flush', 'drain', 'shutdownOtel']);
    expect(process.listenerCount('SIGTERM')).toBe(0);
  });

  it('re-raises when the shared deadline runs out, skipping steps with no budget left', async () => {
    vi.useFakeTimers();
    vi.spyOn(providerRegistry, 'shutdownForProcess').mockReturnValue(new Promise(() => {}));
    terminateOnSigterm();

    process.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(SIGTERM_CLEANUP_TIMEOUT_MS - 1);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    expect(shutdownOtel).not.toHaveBeenCalled();
  });

  it('gives tracing shutdown only what the drain left of the deadline', async () => {
    vi.useFakeTimers();
    const drained = createDeferred<void>();
    vi.spyOn(providerRegistry, 'shutdownForProcess').mockImplementation(() => {
      // The drain finishes 2 s into the 3 s budget, on the fake clock.
      setTimeout(() => drained.resolve(), 2_000);
      return drained.promise;
    });
    vi.mocked(shutdownOtel).mockReturnValue(new Promise(() => {}));
    terminateOnSigterm();

    process.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(SIGTERM_CLEANUP_TIMEOUT_MS - 1);
    expect(shutdownOtel).toHaveBeenCalledTimes(1);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it.each([
    ['cli', 1],
    ['library', 0],
  ] as const)(
    '%s eval keeps %i temporary SIGTERM listeners while writing outputs',
    async (eventSource, expectedListeners) => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_SHARING: 'true',
      });
      const previousExitCode = process.exitCode;
      const writing = createDeferred<void>();
      const written = createDeferred<void>();
      vi.mocked(writeMultipleOutputs).mockImplementation(async () => {
        writing.resolve();
        await written.promise;
      });
      try {
        const run = doEval(
          {
            write: false,
            share: false,
            table: false,
            progressBar: false,
            output: ['sigterm-unit-output.json'],
          },
          { prompts: ['hello'], providers: ['echo'], tests: [{ vars: {} }] },
          undefined,
          { eventSource, cache: false },
        );
        await writing.promise;
        const whileWriting = process.listenerCount('SIGTERM');
        written.resolve();
        await run;

        // Only the CLI run adds a temporary listener on top of process-wide cleanup.
        expect(whileWriting - process.listenerCount('SIGTERM')).toBe(expectedListeners);
      } finally {
        process.exitCode = previousExitCode;
        restoreEnv();
      }
    },
  );
});
