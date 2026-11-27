import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

type ConsoleTransportWithStderrLevels = {
  stderrLevels?: Partial<Record<'error' | 'warn' | 'info' | 'debug', boolean>>;
};

// These tests exercise the real winston Console transport, so they live in a
// separate file from logger.test.ts (which mocks winston wholesale).
describe('PROMPTFOO_LOG_TO_STDERR', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('routes Console transport output to stderr when set', async () => {
    const restore = mockProcessEnv({ LOG_LEVEL: undefined, PROMPTFOO_LOG_TO_STDERR: 'true' });
    try {
      vi.resetModules();
      const { winstonLogger } = await import('../src/logger');
      // winston routes a level to stderr when it is present in stderrLevels;
      // all four levels means nothing the logger emits can reach stdout.
      const consoleTransport = winstonLogger.transports[0] as ConsoleTransportWithStderrLevels;
      expect(consoleTransport.stderrLevels).toMatchObject({
        error: true,
        warn: true,
        info: true,
        debug: true,
      });
    } finally {
      restore();
    }
  });

  it('keeps Console transport output on stdout by default', async () => {
    const restore = mockProcessEnv({ LOG_LEVEL: undefined, PROMPTFOO_LOG_TO_STDERR: undefined });
    try {
      vi.resetModules();
      const { winstonLogger } = await import('../src/logger');
      const consoleTransport = winstonLogger.transports[0] as ConsoleTransportWithStderrLevels;
      expect(consoleTransport.stderrLevels).toEqual({});
    } finally {
      restore();
    }
  });
});
