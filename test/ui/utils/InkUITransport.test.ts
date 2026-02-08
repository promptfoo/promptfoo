/**
 * Tests for InkUITransport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InkUITransport,
  isInkUITransportActive,
  type LogEntry,
  registerInkUITransport,
  setInkUITransportLevel,
  unregisterInkUITransport,
} from '../../../src/ui/utils/InkUITransport';
import type { Mock } from 'vitest';
import type Transport from 'winston-transport';

type MockLogger = {
  add: Mock<(transport: Transport) => void>;
  remove: Mock<(transport: Transport) => void>;
};

/**
 * Helper to wait for setImmediate callbacks to complete.
 * The transport.log() method uses setImmediate, so we need to wait for it.
 */
async function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('InkUITransport', () => {
  describe('log filtering by level', () => {
    it('should capture error logs when level is error', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'error' });

      transport.log({ level: 'error', message: 'Error message' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning message' }, vi.fn());
      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Error message',
        }),
      );
    });

    it('should capture error and warn logs when level is warn', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'warn' });

      transport.log({ level: 'error', message: 'Error message' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning message' }, vi.fn());
      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          level: 'error',
          message: 'Error message',
        }),
      );
      expect(callback).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          level: 'warn',
          message: 'Warning message',
        }),
      );
    });

    it('should capture error, warn, and info logs when level is info', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log({ level: 'error', message: 'Error message' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning message' }, vi.fn());
      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should capture all logs when level is debug', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'debug' });

      transport.log({ level: 'error', message: 'Error message' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning message' }, vi.fn());
      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should default to info level when no level specified', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback });

      transport.log({ level: 'error', message: 'Error message' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning message' }, vi.fn());
      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());

      await flushSetImmediate();

      // Default is info, so error/warn/info should be captured, not debug
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('ANSI code stripping', () => {
    it('should strip ANSI color codes from messages', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log({ level: 'info', message: '\x1b[31mRed text\x1b[0m' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Red text',
        }),
      );
    });

    it('should strip multiple ANSI codes', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log(
        { level: 'info', message: '\x1b[1m\x1b[33mBold yellow\x1b[0m\x1b[0m text' },
        vi.fn(),
      );

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Bold yellow text',
        }),
      );
    });

    it('should handle messages without ANSI codes', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log({ level: 'info', message: 'Plain text' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Plain text',
        }),
      );
    });
  });

  describe('nested message objects', () => {
    it('should extract message from nested message object', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log(
        { level: 'info', message: { message: 'Nested message content' } as any },
        vi.fn(),
      );

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Nested message content',
        }),
      );
    });

    it('should stringify object when no message property exists', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      const messageObj = { status: 'error', code: 500 };
      transport.log({ level: 'info', message: messageObj as any }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: JSON.stringify(messageObj),
        }),
      );
    });

    it('should handle string messages normally', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log({ level: 'info', message: 'String message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'String message',
        }),
      );
    });
  });

  describe('log entry structure', () => {
    it('should generate unique IDs for each log entry', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      transport.log({ level: 'info', message: 'First message' }, vi.fn());
      transport.log({ level: 'info', message: 'Second message' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(2);

      const firstCall = callback.mock.calls[0][0] as LogEntry;
      const secondCall = callback.mock.calls[1][0] as LogEntry;

      expect(firstCall.id).toBeDefined();
      expect(secondCall.id).toBeDefined();
      expect(firstCall.id).not.toBe(secondCall.id);
    });

    it('should include timestamp in log entries', async () => {
      vi.useFakeTimers();

      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'info' });

      const beforeTimestamp = Date.now();
      transport.log({ level: 'info', message: 'Test message' }, vi.fn());
      const afterTimestamp = Date.now();

      // With fake timers, advance to run setImmediate callbacks
      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );

      const logEntry = callback.mock.calls[0][0] as LogEntry;
      expect(logEntry.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(logEntry.timestamp).toBeLessThanOrEqual(afterTimestamp);

      vi.useRealTimers();
    });

    it('should preserve log level in entry', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'debug' });

      transport.log({ level: 'error', message: 'Error' }, vi.fn());
      transport.log({ level: 'warn', message: 'Warning' }, vi.fn());
      transport.log({ level: 'info', message: 'Info' }, vi.fn());
      transport.log({ level: 'debug', message: 'Debug' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({ level: 'error' }));
      expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ level: 'warn' }));
      expect(callback).toHaveBeenNthCalledWith(3, expect.objectContaining({ level: 'info' }));
      expect(callback).toHaveBeenNthCalledWith(4, expect.objectContaining({ level: 'debug' }));
    });
  });

  describe('setLevel', () => {
    it('should update filter level dynamically', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'error' });

      transport.log({ level: 'info', message: 'Info message' }, vi.fn());
      await flushSetImmediate();
      expect(callback).not.toHaveBeenCalled();

      transport.setLevel('info');

      transport.log({ level: 'info', message: 'Info message after change' }, vi.fn());
      await flushSetImmediate();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Info message after change',
        }),
      );
    });

    it('should filter more restrictively when level becomes higher priority', async () => {
      const callback = vi.fn();
      const transport = new InkUITransport({ callback, level: 'debug' });

      transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());
      await flushSetImmediate();
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();
      transport.setLevel('error');

      transport.log({ level: 'debug', message: 'Debug after change' }, vi.fn());
      transport.log({ level: 'info', message: 'Info after change' }, vi.fn());
      transport.log({ level: 'error', message: 'Error after change' }, vi.fn());

      await flushSetImmediate();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
        }),
      );
    });
  });
});

describe('registerInkUITransport', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = {
      add: vi.fn<(transport: Transport) => void>(),
      remove: vi.fn<(transport: Transport) => void>(),
    };
  });

  afterEach(() => {
    // Clean up any active transport
    unregisterInkUITransport(mockLogger);
  });

  it('should create and register transport with logger', () => {
    const callback = vi.fn();

    const transport = registerInkUITransport(mockLogger, callback, 'warn');

    expect(transport).toBeInstanceOf(InkUITransport);
    expect(mockLogger.add).toHaveBeenCalledWith(transport);
  });

  it('should default to warn level', async () => {
    const callback = vi.fn();

    const transport = registerInkUITransport(mockLogger, callback);

    transport.log({ level: 'error', message: 'Error' }, vi.fn());
    transport.log({ level: 'warn', message: 'Warn' }, vi.fn());
    transport.log({ level: 'info', message: 'Info' }, vi.fn());

    await flushSetImmediate();

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should remove existing transport before registering new one', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const transport1 = registerInkUITransport(mockLogger, callback1, 'info');
    const transport2 = registerInkUITransport(mockLogger, callback2, 'info');

    expect(mockLogger.remove).toHaveBeenCalledWith(transport1);
    expect(mockLogger.add).toHaveBeenCalledWith(transport2);
  });

  it('should make transport active', () => {
    const callback = vi.fn();

    expect(isInkUITransportActive()).toBe(false);

    registerInkUITransport(mockLogger, callback);

    expect(isInkUITransportActive()).toBe(true);
  });
});

describe('unregisterInkUITransport', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = {
      add: vi.fn<(transport: Transport) => void>(),
      remove: vi.fn<(transport: Transport) => void>(),
    };
  });

  it('should remove active transport from logger', () => {
    const callback = vi.fn();
    const transport = registerInkUITransport(mockLogger, callback);

    unregisterInkUITransport(mockLogger);

    expect(mockLogger.remove).toHaveBeenCalledWith(transport);
  });

  it('should clear active transport reference', () => {
    const callback = vi.fn();
    registerInkUITransport(mockLogger, callback);

    expect(isInkUITransportActive()).toBe(true);

    unregisterInkUITransport(mockLogger);

    expect(isInkUITransportActive()).toBe(false);
  });

  it('should handle being called when no transport is active', () => {
    expect(() => {
      unregisterInkUITransport(mockLogger);
    }).not.toThrow();

    expect(mockLogger.remove).not.toHaveBeenCalled();
  });

  it('should handle errors when ending transport stream', () => {
    const callback = vi.fn();
    const transport = registerInkUITransport(mockLogger, callback);

    // Mock transport.end to throw an error
    vi.spyOn(transport, 'end').mockImplementation(() => {
      throw new Error('Stream end error');
    });

    expect(() => {
      unregisterInkUITransport(mockLogger);
    }).not.toThrow();

    expect(isInkUITransportActive()).toBe(false);
  });

  it('should handle errors when removing transport from logger', () => {
    const callback = vi.fn();
    registerInkUITransport(mockLogger, callback);

    mockLogger.remove.mockImplementation(() => {
      throw new Error('Remove error');
    });

    expect(() => {
      unregisterInkUITransport(mockLogger);
    }).not.toThrow();

    expect(isInkUITransportActive()).toBe(false);
  });
});

describe('setInkUITransportLevel', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = {
      add: vi.fn<(transport: Transport) => void>(),
      remove: vi.fn<(transport: Transport) => void>(),
    };
  });

  afterEach(() => {
    unregisterInkUITransport(mockLogger);
  });

  it('should update level on active transport', async () => {
    const callback = vi.fn();
    registerInkUITransport(mockLogger, callback, 'error');

    setInkUITransportLevel('debug');

    // Get the transport and verify it filters at debug level
    const transport = mockLogger.add.mock.calls[0][0] as InkUITransport;

    transport.log({ level: 'debug', message: 'Debug message' }, vi.fn());
    await flushSetImmediate();
    expect(callback).toHaveBeenCalled();
  });

  it('should do nothing when no transport is active', () => {
    expect(() => {
      setInkUITransportLevel('debug');
    }).not.toThrow();
  });
});

describe('isInkUITransportActive', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = {
      add: vi.fn<(transport: Transport) => void>(),
      remove: vi.fn<(transport: Transport) => void>(),
    };
  });

  afterEach(() => {
    unregisterInkUITransport(mockLogger);
  });

  it('should return false when no transport is registered', () => {
    expect(isInkUITransportActive()).toBe(false);
  });

  it('should return true when transport is registered', () => {
    const callback = vi.fn();

    expect(isInkUITransportActive()).toBe(false);

    registerInkUITransport(mockLogger, callback);

    expect(isInkUITransportActive()).toBe(true);
  });

  it('should return false after transport is unregistered', () => {
    const callback = vi.fn();
    registerInkUITransport(mockLogger, callback);

    expect(isInkUITransportActive()).toBe(true);

    unregisterInkUITransport(mockLogger);

    expect(isInkUITransportActive()).toBe(false);
  });
});
