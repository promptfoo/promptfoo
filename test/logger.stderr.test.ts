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

describe('CLI console configuration after env-file loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('applies late level/routing settings and does not follow evaluation scopes', async () => {
    const restore = mockProcessEnv({
      LOG_LEVEL: 'info',
      PROMPTFOO_LOG_TO_STDERR: undefined,
      PROMPTFOO_DISABLE_DEBUG_LOG: 'true',
      PROMPTFOO_DISABLE_ERROR_LOG: 'true',
    });
    try {
      vi.resetModules();
      const { getLogLevel, initializeRunLogging, winstonLogger } = await import('../src/logger');
      const cliState = (await import('../src/cliState')).default;
      const restoreLateEnv = mockProcessEnv({ LOG_LEVEL: 'warn', PROMPTFOO_LOG_TO_STDERR: 'true' });
      try {
        initializeRunLogging();
        expect(getLogLevel()).toBe('warn');
        expect(
          (winstonLogger.transports[0] as ConsoleTransportWithStderrLevels).stderrLevels,
        ).toEqual({ error: true, warn: true, info: true, debug: true });
        await cliState.withEnv(
          { LOG_LEVEL: 'debug', PROMPTFOO_LOG_TO_STDERR: 'false' },
          async () => {
            expect(getLogLevel()).toBe('warn');
          },
        );
      } finally {
        restoreLateEnv();
      }
    } finally {
      restore();
    }
  });

  it('preserves structured-output protection even when the env file requests stdout logging', async () => {
    const restore = mockProcessEnv({
      LOG_LEVEL: 'debug',
      PROMPTFOO_LOG_TO_STDERR: 'false',
      PROMPTFOO_DISABLE_DEBUG_LOG: 'true',
      PROMPTFOO_DISABLE_ERROR_LOG: 'true',
    });
    try {
      vi.resetModules();
      const { getLogLevel, initializeRunLogging, winstonLogger } = await import('../src/logger');
      initializeRunLogging({ structuredOutput: true });
      expect(getLogLevel()).toBe('error');
      expect(
        (winstonLogger.transports[0] as ConsoleTransportWithStderrLevels).stderrLevels,
      ).toEqual({ error: true, warn: true, info: true, debug: true });
    } finally {
      restore();
    }
  });
});
