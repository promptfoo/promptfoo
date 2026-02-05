import path from 'path';

import chalk from 'chalk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type MockInstance,
  vi,
} from 'vitest';
import type { Logger } from 'winston';
import type Transport from 'winston-transport';

// Create hoisted mocks
const { mockGetEnvString, mockGetEnvBool, mockGetConfigDirectoryPath, fsMock, mockLogger } =
  vi.hoisted(() => {
    const mockGetEnvString = vi.fn((_: string, defaultValue: any) => defaultValue);
    const mockGetEnvBool = vi.fn((_: string, defaultValue: any) => defaultValue);
    const mockGetConfigDirectoryPath = vi.fn(() => '/mock/config');
    const fsMock = {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn(),
      statSync: vi.fn(),
      unlinkSync: vi.fn(),
    };

    interface MockLogger extends Omit<Logger, 'transports'> {
      error: Mock;
      warn: Mock;
      info: Mock;
      debug: Mock;
      on: Mock;
      once: Mock;
      end: Mock;
      add: Mock;
      remove: Mock;
      transports: Array<Partial<Transport>>;
    }

    const mockLoggerInstance: MockLogger = {
      error: vi.fn((info) => {
        process.stdout.write(chalk.red(info.message));
        return mockLoggerInstance;
      }),
      warn: vi.fn((info) => {
        process.stdout.write(chalk.yellow(info.message));
        return mockLoggerInstance;
      }),
      info: vi.fn((info) => {
        process.stdout.write(info.message);
        return mockLoggerInstance;
      }),
      debug: vi.fn((info) => {
        process.stdout.write(chalk.cyan(info.message));
        return mockLoggerInstance;
      }),
      on: vi.fn(),
      once: vi.fn((event: string, callback: () => void) => {
        // Simulate the 'finish' event being emitted after end() is called
        if (event === 'finish') {
          setImmediate(callback);
        }
        return mockLoggerInstance;
      }),
      end: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      transports: [{ level: 'info' }],
    } as MockLogger;

    return {
      mockGetEnvString,
      mockGetEnvBool,
      mockGetConfigDirectoryPath,
      fsMock,
      mockLogger: mockLoggerInstance,
    };
  });

vi.unmock('../src/logger');
vi.mock('../src/envars', () => ({
  getEnvString: mockGetEnvString,
  getEnvBool: mockGetEnvBool,
}));

vi.mock('../src/util/config/manage', () => ({
  getConfigDirectoryPath: mockGetConfigDirectoryPath,
}));

vi.mock('fs', () => ({
  default: fsMock,
  ...fsMock,
}));

// Winston transports need to be classes (constructors)
const winstonMock = vi.hoisted(() => {
  return {
    createLogger: vi.fn(() => mockLogger),
    format: {
      combine: vi.fn(),
      simple: vi.fn(),
      printf: vi.fn((cb: (info: Record<string, unknown>) => string) => cb),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn().mockImplementation(function (this: { write: ReturnType<typeof vi.fn> }) {
        this.write = vi.fn();
      }),
    },
  };
});

vi.mock('winston', () => ({
  default: winstonMock,
}));

describe('logger', () => {
  let logger: any;
  let mockStdout: MockInstance;
  let originalError: typeof Error;

  beforeEach(async () => {
    originalError = global.Error;
    mockStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.clearAllMocks();
    mockGetEnvString.mockReset();
    mockGetEnvBool.mockReset();
    mockGetEnvString.mockImplementation((_, defaultValue) => defaultValue);
    mockGetEnvBool.mockImplementation((_, defaultValue) => defaultValue);
    mockGetConfigDirectoryPath.mockReset();
    mockGetConfigDirectoryPath.mockReturnValue('/mock/config');
    for (const fn of Object.values(fsMock)) {
      (fn as Mock).mockReset();
    }
    (fsMock.existsSync as Mock).mockReturnValue(true);
    (fsMock.readdirSync as Mock).mockReturnValue([]);
    (fsMock.statSync as Mock).mockReturnValue({ mtime: new Date() });
    logger = await import('../src/logger');
    mockLogger.transports[0].level = 'info';
  });

  afterEach(() => {
    mockStdout.mockRestore();
    global.Error = originalError;
    vi.resetModules();
  });

  describe('logger methods', () => {
    it('should log messages at different levels', () => {
      logger.default.error('test error');
      expect(mockLogger.error).toHaveBeenCalledWith({ message: 'test error', location: '' });

      logger.default.warn('test warning');
      expect(mockLogger.warn).toHaveBeenCalledWith({ message: 'test warning', location: '' });

      logger.default.info('test info');
      expect(mockLogger.info).toHaveBeenCalledWith({ message: 'test info', location: '' });

      logger.default.debug('test debug');
      expect(mockLogger.debug).toHaveBeenCalledWith({
        message: 'test debug',
        location: expect.any(String),
      });
    });

    it('should include location in debug mode', () => {
      logger.setLogLevel('debug');

      const mockStack = `Error
        at getCallerLocation (file.ts:1:1)
        at Object.<anonymous> (test.ts:10:20)
        at logger.test.ts:123:10
        at plain/format/path.js:30:5`;

      // Use a class-based mock for the Error constructor
      const OriginalError = global.Error;
      const mockErrorConstructor = function (message?: string) {
        const error = new OriginalError(message);
        Object.defineProperty(error, 'stack', { value: mockStack });
        return error;
      };
      vi.spyOn(global, 'Error').mockImplementation(mockErrorConstructor as unknown as typeof Error);

      logger.default.debug('debug message');
      expect(mockLogger.debug).toHaveBeenCalledWith({
        message: 'debug message',
        location: '[logger.test.ts:123]',
      });
    });
  });

  describe('getCallerLocation', () => {
    it('should return location string with filename and line number', () => {
      const location = logger.getCallerLocation();
      expect(location).toMatch(/\[.*:\d+\]/);
    });

    it('should handle missing stack trace', () => {
      const mockError = new Error('test error');
      Object.defineProperty(mockError, 'stack', { value: undefined });
      vi.spyOn(global, 'Error').mockImplementation(() => mockError as Error);

      const location = logger.getCallerLocation();
      expect(location).toBe('');
    });

    it('should handle different stack trace formats', () => {
      const mockStack = `Error
        at getCallerLocation (file.ts:1:1)
        at Object.<anonymous> (test.ts:10:20)
        at Object.foo (/absolute/path/file.js:20:10)
        at plain/format/path.js:30:5`;

      // Use a class-based mock for the Error constructor
      const OriginalError = global.Error;
      const mockErrorConstructor = function (message?: string) {
        const error = new OriginalError(message);
        Object.defineProperty(error, 'stack', { value: mockStack });
        return error;
      };
      vi.spyOn(global, 'Error').mockImplementation(mockErrorConstructor as unknown as typeof Error);

      const location = logger.getCallerLocation();
      expect(location).toMatch(/\[.*:\d+\]/);
    });

    it('should handle empty stack trace', () => {
      const mockError = new Error('test error');
      Object.defineProperty(mockError, 'stack', { value: '' });
      vi.spyOn(global, 'Error').mockImplementation(() => mockError as Error);

      const location = logger.getCallerLocation();
      expect(location).toBe('');
    });

    it('should handle errors in stack trace parsing', () => {
      // Force an error in the try block by making stack.split throw
      const mockError = new Error('test error');
      Object.defineProperty(mockError, 'stack', {
        get: () => {
          throw new Error('Forced stack access error');
        },
      });
      vi.spyOn(global, 'Error').mockImplementation(() => mockError as Error);

      const location = logger.getCallerLocation();
      expect(location).toBe('');
    });
  });

  describe('consoleFormatter', () => {
    it('should format messages with colors based on level', () => {
      const info = { level: 'error', message: 'test error', location: '[test:1]' } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe(chalk.red('[test:1] test error'));
    });

    it('should format messages without location', () => {
      const info = { level: 'error', message: 'test error' } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe(chalk.red('test error'));
    });

    it('should throw error for invalid log level', () => {
      const info = { level: 'invalid', message: 'test' } as any;
      expect(() => logger.consoleFormatter(info)).toThrow('Invalid log level: invalid');
    });

    it('should call global log callback if set', () => {
      const callback = vi.fn();
      logger.setLogCallback(callback);
      const info = { level: 'info', message: 'test message' } as any;
      logger.consoleFormatter(info);
      expect(callback).toHaveBeenCalledWith('test message');
    });

    it('should handle empty string messages', () => {
      const info = { level: 'info', message: '' } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('');
    });

    it('should handle nested message objects', () => {
      const info = {
        level: 'info',
        message: {
          message: 'nested message',
          location: '[test:1]',
        },
      } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('nested message');
    });

    it('should handle nested empty string messages', () => {
      const info = {
        level: 'info',
        message: {
          message: '',
          location: '[test:1]',
        },
      } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('');
    });

    it('should handle non-string message values', () => {
      const info = { level: 'info', message: 123 } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('123');
    });

    it('should handle non-string nested message values', () => {
      const info = {
        level: 'info',
        message: {
          message: 123,
          location: '[test:1]',
        },
      } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('123');
    });

    it('should test all log levels', () => {
      // Test error level
      let info = { level: 'error', message: 'error message' } as any;
      let result = logger.consoleFormatter(info);
      expect(result).toBe(chalk.red('error message'));

      // Test warn level
      info = { level: 'warn', message: 'warning message' } as any;
      result = logger.consoleFormatter(info);
      expect(result).toBe(chalk.yellow('warning message'));

      // Test info level
      info = { level: 'info', message: 'info message' } as any;
      result = logger.consoleFormatter(info);
      expect(result).toBe('info message');

      // Test debug level - chalk makes testing exact equality difficult, so check substring
      info = { level: 'debug', message: 'debug message' } as any;
      result = logger.consoleFormatter(info);
      expect(result).toContain('debug message');
    });
  });

  describe('fileFormatter', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-01T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should format messages with timestamp and level', () => {
      const info = { level: 'error', message: 'test error', location: '[test:1]' } as any;
      const result = logger.fileFormatter(info);
      expect(result).toBe('2025-03-01T12:00:00.000Z [ERROR] [test:1]: test error');
    });

    it('should format messages without location', () => {
      const info = { level: 'error', message: 'test error' } as any;
      const result = logger.fileFormatter(info);
      expect(result).toBe('2025-03-01T12:00:00.000Z [ERROR]: test error');
    });

    it('should handle empty string messages', () => {
      const info = { level: 'error', message: '' } as any;
      const result = logger.fileFormatter(info);
      expect(result).toBe('2025-03-01T12:00:00.000Z [ERROR]: ');
    });

    it('should handle nested message objects', () => {
      const info = {
        level: 'error',
        message: {
          message: 'nested message',
          location: '[test:1]',
        },
      } as any;
      const result = logger.fileFormatter(info);
      expect(result).toBe('2025-03-01T12:00:00.000Z [ERROR]: nested message');
    });
  });

  describe('getLogLevel', () => {
    it('should return current log level', () => {
      expect(logger.getLogLevel()).toBe('info');
    });
  });

  describe('setLogLevel', () => {
    it('should set valid log levels', async () => {
      logger.setLogLevel('debug');
      expect(mockLogger.transports[0].level).toBe('debug');

      logger.setLogLevel('info');
      expect(mockLogger.transports[0].level).toBe('info');
    });

    it('should throw error for invalid log level', () => {
      expect(() => logger.setLogLevel('invalid' as any)).toThrow('Invalid log level: invalid');
    });
  });

  describe('initializeRunLogging', () => {
    let cliState: { debugLogFile?: string; errorLogFile?: string };
    let winston: any;
    let expectedDebugFile: string;
    let expectedErrorFile: string;

    beforeEach(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-03-01T12:00:00.000Z'));
      expectedDebugFile = path.join(
        '/mock/config',
        'logs',
        'promptfoo-debug-2025-03-01_12-00-00-000Z.log',
      );
      expectedErrorFile = path.join(
        '/mock/config',
        'logs',
        'promptfoo-error-2025-03-01_12-00-00-000Z.log',
      );
      cliState = (await import('../src/cliState')).default;
      winston = await import('winston');
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create debug and error log files when enabled', () => {
      (fsMock.existsSync as Mock).mockReturnValue(false);
      (fsMock.readdirSync as Mock).mockReturnValue([]);

      logger.initializeRunLogging();

      expect(mockGetConfigDirectoryPath).toHaveBeenCalledWith(true);
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(path.join('/mock/config', 'logs'), {
        recursive: true,
      });
      expect(cliState.debugLogFile).toBe(expectedDebugFile);
      expect(cliState.errorLogFile).toBe(expectedErrorFile);

      const debugCall = vi
        .mocked(winston.default.transports.File)
        .mock.calls.find(([config]: any[]) => config.level === 'debug');
      const errorCall = vi
        .mocked(winston.default.transports.File)
        .mock.calls.find(([config]: any[]) => config.level === 'error');

      expect(debugCall?.[0]).toEqual(
        expect.objectContaining({
          level: 'debug',
          filename: cliState.debugLogFile,
        }),
      );
      expect(errorCall?.[0]).toEqual(
        expect.objectContaining({
          level: 'error',
          filename: cliState.errorLogFile,
        }),
      );

      expect(mockLogger.add).toHaveBeenCalledTimes(2);
      expect(winston.default.transports.File).toHaveBeenCalledTimes(2);
    });

    it('should respect PROMPTFOO_DISABLE_DEBUG_LOG', () => {
      mockGetEnvBool.mockImplementation((key, defaultValue) =>
        key === 'PROMPTFOO_DISABLE_DEBUG_LOG' ? true : defaultValue,
      );
      (fsMock.existsSync as Mock).mockReturnValue(false);

      logger.initializeRunLogging();

      expect(cliState.debugLogFile).toBeUndefined();
      expect(cliState.errorLogFile).toBe(expectedErrorFile);

      expect(winston.default.transports.File).toHaveBeenCalledTimes(1);
      const errorConfig = vi.mocked(winston.default.transports.File).mock.calls[0][0];
      expect(errorConfig.level).toBe('error');
      expect(mockLogger.add).toHaveBeenCalledTimes(1);
    });

    it('should respect PROMPTFOO_DISABLE_ERROR_LOG', () => {
      mockGetEnvBool.mockImplementation((key, defaultValue) =>
        key === 'PROMPTFOO_DISABLE_ERROR_LOG' ? true : defaultValue,
      );
      (fsMock.existsSync as Mock).mockReturnValue(false);

      logger.initializeRunLogging();

      expect(cliState.debugLogFile).toBe(expectedDebugFile);
      expect(cliState.errorLogFile).toBeUndefined();

      expect(winston.default.transports.File).toHaveBeenCalledTimes(1);
      const debugConfig = vi.mocked(winston.default.transports.File).mock.calls[0][0];
      expect(debugConfig.level).toBe('debug');
      expect(mockLogger.add).toHaveBeenCalledTimes(1);
    });

    it('should warn when creating file transports fails', () => {
      (fsMock.existsSync as Mock).mockReturnValue(false);

      // Use function keyword to make it constructable
      const throwingConstructor = function () {
        throw new Error('boom');
      };
      vi.mocked(winston.default.transports.File).mockImplementationOnce(
        throwingConstructor as unknown as typeof winston.default.transports.File,
      );

      logger.initializeRunLogging();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Error creating run log file: Error: boom'),
        }),
      );
      expect(cliState.debugLogFile).toBe(expectedDebugFile);
      expect(cliState.errorLogFile).toBeUndefined();
      expect(mockLogger.add).not.toHaveBeenCalled();
      expect(winston.default.transports.File).toHaveBeenCalledTimes(1);
    });

    it('should respect PROMPTFOO_LOG_DIR environment variable', () => {
      const customLogDir = '/custom/log/dir';
      mockGetEnvString.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'PROMPTFOO_LOG_DIR') {
          return customLogDir;
        }
        return defaultValue;
      });

      (fsMock.existsSync as Mock).mockReturnValue(false);
      (fsMock.readdirSync as Mock).mockReturnValue([]);

      logger.initializeRunLogging();

      // Use path.resolve() to match the actual implementation behavior (handles Windows paths correctly)
      const resolvedCustomLogDir = path.resolve(customLogDir);
      const expectedCustomDebugFile = path.join(
        resolvedCustomLogDir,
        'promptfoo-debug-2025-03-01_12-00-00-000Z.log',
      );
      const expectedCustomErrorFile = path.join(
        resolvedCustomLogDir,
        'promptfoo-error-2025-03-01_12-00-00-000Z.log',
      );

      expect(cliState.debugLogFile).toBe(expectedCustomDebugFile);
      expect(cliState.errorLogFile).toBe(expectedCustomErrorFile);
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(resolvedCustomLogDir, { recursive: true });
    });
  });

  describe('initializeSourceMapSupport', () => {
    it('should only call install once across multiple invocations', async () => {
      // Save and clear LOG_LEVEL to prevent auto-initialization during import
      const originalLogLevel = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      try {
        // Reset modules and set up fresh mocks
        vi.resetModules();

        const mockInstall = vi.fn();
        vi.doMock('source-map-support', () => ({
          install: mockInstall,
        }));

        // Import fresh logger with our mock (import needed for side effect)
        await import('../src/logger');

        // Clear any calls that happened during import
        mockInstall.mockClear();

        // Reset the initialized flag by reimporting with clean state
        vi.resetModules();
        vi.doMock('source-map-support', () => ({
          install: mockInstall,
        }));
        const cleanLogger = await import('../src/logger');
        mockInstall.mockClear();

        // First explicit call should trigger install
        await cleanLogger.initializeSourceMapSupport();
        expect(mockInstall).toHaveBeenCalledTimes(1);

        // Second call should NOT trigger install again (flag is set)
        mockInstall.mockClear();
        await cleanLogger.initializeSourceMapSupport();
        expect(mockInstall).not.toHaveBeenCalled();
      } finally {
        // Restore LOG_LEVEL
        if (originalLogLevel !== undefined) {
          process.env.LOG_LEVEL = originalLogLevel;
        }
        vi.resetModules();
      }
    });

    it('should handle errors gracefully when source-map-support fails', async () => {
      // Save and clear LOG_LEVEL
      const originalLogLevel = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      try {
        vi.resetModules();

        // Override the mock to throw
        vi.doMock('source-map-support', () => {
          throw new Error('Module not found');
        });

        const freshLogger = await import('../src/logger');

        // Should not throw error - the function handles errors gracefully
        await expect(freshLogger.initializeSourceMapSupport()).resolves.toBeUndefined();
      } finally {
        // Restore LOG_LEVEL
        if (originalLogLevel !== undefined) {
          process.env.LOG_LEVEL = originalLogLevel;
        }
        vi.resetModules();
      }
    });
  });

  describe('isDebugEnabled', () => {
    it('should return true when debug level is set', () => {
      mockLogger.transports[0].level = 'debug';
      expect(logger.isDebugEnabled()).toBe(true);
    });

    it('should return false for non-debug levels', () => {
      mockLogger.transports[0].level = 'info';
      expect(logger.isDebugEnabled()).toBe(false);
    });
  });

  describe('logger methods with empty strings', () => {
    it('should correctly log empty strings', () => {
      logger.default.info('');
      expect(mockLogger.info).toHaveBeenCalledWith({ message: '', location: '' });

      logger.default.error('');
      expect(mockLogger.error).toHaveBeenCalledWith({ message: '', location: '' });

      logger.default.warn('');
      expect(mockLogger.warn).toHaveBeenCalledWith({ message: '', location: '' });

      logger.default.debug('');
      expect(mockLogger.debug).toHaveBeenCalledWith({
        message: '',
        location: expect.any(String),
      });
    });
  });

  describe('extractMessage helper', () => {
    it('should extract message from string message', () => {
      const info = { level: 'info', message: 'direct message' } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('direct message');
    });

    it('should extract message from nested object', () => {
      const info = {
        level: 'info',
        message: {
          message: 'nested message content',
          location: '[test:1]',
        },
      } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('nested message content');
    });

    it('should convert non-string messages to strings', () => {
      const info = { level: 'info', message: 42 } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('42');
    });

    it('should convert undefined to string', () => {
      const info = { level: 'info', message: undefined } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('undefined');
    });

    it('should convert null to string', () => {
      const info = { level: 'info', message: null } as any;
      const result = logger.consoleFormatter(info);
      expect(result).toBe('null');
    });
  });

  describe('createLogMethod', () => {
    it('should include location when debug level is set even for non-debug methods', () => {
      // Set debug level
      logger.setLogLevel('debug');

      // Log with info level, should include location because debug is enabled
      logger.default.info('test info with debug enabled');

      // Verify location is included in the call to the underlying logger
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'test info with debug enabled',
        location: expect.any(String),
      });
    });
  });

  describe('logger instance', () => {
    it('should have properly bound add and remove methods', () => {
      // Testing line 207-208: Test that the methods are correctly bound
      expect(typeof logger.default.add).toBe('function');
      expect(typeof logger.default.remove).toBe('function');

      // Test that the methods are bound to winstonLogger
      const addSpy = vi.spyOn(mockLogger, 'add');
      const removeSpy = vi.spyOn(mockLogger, 'remove');

      const transport = { name: 'test' } as any;
      logger.default.add(transport);
      expect(addSpy).toHaveBeenCalledWith(transport);

      logger.default.remove(transport);
      expect(removeSpy).toHaveBeenCalledWith(transport);
    });

    it('should expose transports property', () => {
      // Test the transports property is correctly assigned (line 207-208)
      expect(logger.default.transports).toBe(mockLogger.transports);

      // Verify we can access the transports array
      expect(Array.isArray(logger.default.transports)).toBe(true);
    });
  });

  describe('closeLogger', () => {
    // Save original transports state and restore after each test
    let originalTransports: any[];

    beforeEach(() => {
      originalTransports = [...mockLogger.transports];
    });

    afterEach(() => {
      // Restore transports to original state
      mockLogger.transports.length = 0;
      mockLogger.transports.push(...originalTransports);
    });

    it('should set shutdown flag when closing', async () => {
      // Create mock file transports with once/end methods for proper flush handling
      const createMockFileTransport = (filename: string) => {
        const transport = {
          filename,
          once: vi.fn((event: string, callback: () => void) => {
            // Immediately call the callback to simulate finish event
            if (event === 'finish') {
              setImmediate(callback);
            }
          }),
          on: vi.fn(),
          off: vi.fn(),
          end: vi.fn(),
        };
        Object.setPrototypeOf(transport, winstonMock.transports.File.prototype);
        return transport;
      };

      const mockFileTransport1 = createMockFileTransport('/mock/path/debug.log');
      const mockFileTransport2 = createMockFileTransport('/mock/path/error.log');

      // Set up transports array with file transports
      mockLogger.transports.length = 0;
      mockLogger.transports.push(mockFileTransport1 as any, mockFileTransport2 as any);

      // Reset shutdown flag
      logger.setLoggerShuttingDown(false);

      await logger.closeLogger();

      // Shutdown flag should be set (critical for preventing writes during shutdown)
      expect(logger.getLoggerShuttingDown()).toBe(true);

      // Verify winstonLogger.end() was called to properly drain the stream pipeline
      // Winston's _final() internally calls transport.end() on each transport
      expect(mockLogger.end).toHaveBeenCalled();
      expect(mockLogger.once).toHaveBeenCalledWith('finish', expect.any(Function));

      // Reset for other tests
      logger.setLoggerShuttingDown(false);
    });

    it('should handle file transports gracefully', async () => {
      const mockTransport = {
        filename: '/mock/path/test.log',
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'finish') {
            setImmediate(callback);
          }
        }),
        on: vi.fn(),
        off: vi.fn(),
        end: vi.fn(),
      };

      Object.setPrototypeOf(mockTransport, winstonMock.transports.File.prototype);

      mockLogger.transports.length = 0;
      mockLogger.transports.push(mockTransport as any);

      // Should not throw
      await expect(logger.closeLogger()).resolves.not.toThrow();

      // Shutdown flag should be set
      expect(logger.getLoggerShuttingDown()).toBe(true);
      // Verify winstonLogger.end() was called for proper stream draining
      expect(mockLogger.end).toHaveBeenCalled();
      // Verify error handler was attached for "write after end" protection
      expect(mockTransport.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockTransport.off).toHaveBeenCalledWith('error', expect.any(Function));
      logger.setLoggerShuttingDown(false);
    });

    it('should skip non-file transports', async () => {
      const mockConsoleTransport = {};
      // Don't set File prototype - this is a console transport

      mockLogger.transports.length = 0;
      mockLogger.transports.push(mockConsoleTransport as any);

      await logger.closeLogger();

      // Shutdown flag should still be set even with no file transports
      expect(logger.getLoggerShuttingDown()).toBe(true);
      logger.setLoggerShuttingDown(false);
    });

    it('should handle errors gracefully', async () => {
      const mockTransport = {
        filename: '/mock/path/test.log',
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'finish') {
            setImmediate(callback);
          }
        }),
        on: vi.fn(),
        off: vi.fn(),
        end: vi.fn(),
      };

      Object.setPrototypeOf(mockTransport, winstonMock.transports.File.prototype);

      mockLogger.transports.length = 0;
      mockLogger.transports.push(mockTransport as any);

      // Should not throw
      await expect(logger.closeLogger()).resolves.not.toThrow();

      logger.setLoggerShuttingDown(false);
    });

    it('should catch write after end errors during shutdown', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let errorHandler: ((err: Error) => void) | undefined;

      const mockTransport = {
        filename: '/mock/path/test.log',
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'finish') {
            setImmediate(callback);
          }
        }),
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            errorHandler = handler;
          }
        }),
        off: vi.fn(),
        end: vi.fn(),
      };

      Object.setPrototypeOf(mockTransport, winstonMock.transports.File.prototype);

      mockLogger.transports.length = 0;
      mockLogger.transports.push(mockTransport as any);

      const closePromise = logger.closeLogger();

      // Simulate "write after end" error during shutdown
      if (errorHandler) {
        errorHandler(new Error('write after end'));
      }

      await closePromise;

      // The error should be silently handled, not logged to console
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      logger.setLoggerShuttingDown(false);
    });

    it('should handle empty transports array', async () => {
      mockLogger.transports.length = 0;

      logger.setLoggerShuttingDown(false);

      // Should not throw
      await expect(logger.closeLogger()).resolves.not.toThrow();

      // Shutdown flag should still be set even with no transports
      expect(logger.getLoggerShuttingDown()).toBe(true);
      logger.setLoggerShuttingDown(false);
    });

    it('should prevent logging after shutdown flag is set', async () => {
      const debugSpy = vi.spyOn(mockLogger, 'debug');

      // Set shutdown flag
      logger.setLoggerShuttingDown(true);

      // Try to log using default export
      logger.default.debug('This should not be logged');

      // Logger should not have been called (shutdown flag prevents it)
      expect(debugSpy).not.toHaveBeenCalled();

      // Reset flag for other tests
      logger.setLoggerShuttingDown(false);
    });
  });

  describe('logRequestResponse', () => {
    let mockResponse: Partial<Response>;
    let consoleSpy: MockInstance;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: vi.fn().mockReturnValue({
          text: vi.fn().mockResolvedValue('{"success": true}'),
        }),
      };
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      vi.clearAllMocks();
    });

    it('should log successful requests as debug', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      expect(mockLogger.debug).toHaveBeenCalled();
      const call = mockLogger.debug.mock.calls[0][0];
      expect(call.message).toContain('Api Request');
      const loggedMessage = call.message;
      expect(loggedMessage).toContain('"message": "API request"');
      expect(loggedMessage).toContain('"url": "https://api.example.com/test"');
      expect(loggedMessage).toContain('"method": "POST"');
      expect(loggedMessage).toContain('"status": 200');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log failed responses as debug when error flag not set', async () => {
      // @ts-expect-error
      mockResponse.ok = false;
      // @ts-expect-error
      mockResponse.status = 500;
      // @ts-expect-error
      mockResponse.statusText = 'Internal Server Error';

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      expect(mockLogger.debug).toHaveBeenCalled();
      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"status": 500');
      expect(loggedMessage).toContain('"statusText": "Internal Server Error"');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log as error when error flag is true', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
        error: true,
      });

      expect(mockLogger.error).toHaveBeenCalled();
      const loggedMessage = mockLogger.error.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"url": "https://api.example.com/test"');
      expect(loggedMessage).toContain('"method": "POST"');
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle requests without response', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
      });

      expect(mockLogger.debug).toHaveBeenCalled();
      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"url": "https://api.example.com/test"');
      expect(loggedMessage).toContain('"method": "POST"');
      expect(loggedMessage).toContain('"prompt": "test prompt"');
      // Should not have status or response when no response is provided
      expect(loggedMessage).not.toContain('"status"');
      expect(loggedMessage).not.toContain('"response"');
    });

    it('should sanitize sensitive data in URL and request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test?api_key=secret123',
        requestBody: {
          prompt: 'test prompt',
          api_key: 'secret456',
          password: 'mypassword',
        },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      // Check that sensitive data is redacted
      expect(loggedMessage).toContain('[REDACTED]');
      expect(loggedMessage).toContain('"prompt": "test prompt"');
    });

    it('should include all request/response details in message', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt', model: 'gpt-4' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"url": "https://api.example.com/test"');
      expect(loggedMessage).toContain('"method": "POST"');
      expect(loggedMessage).toContain('"prompt": "test prompt"');
      expect(loggedMessage).toContain('"model": "gpt-4"');
      expect(loggedMessage).toContain('"status": 200');
      expect(loggedMessage).toContain('"statusText": "OK"');
      // Response text is embedded as a string within the JSON
      expect(loggedMessage).toContain('success');
    });

    it('should handle response text extraction errors', async () => {
      mockResponse.clone = vi.fn().mockReturnValue({
        text: vi.fn().mockRejectedValue(new Error('Failed to read response')),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"response": "Unable to read response"');
    });

    it('should handle complex nested request bodies', async () => {
      const complexBody = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 100,
      };

      await logger.logRequestResponse({
        url: 'https://api.example.com/chat',
        requestBody: complexBody,
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"messages"');
      expect(loggedMessage).toContain('"role": "user"');
      expect(loggedMessage).toContain('"model": "gpt-4"');
    });

    it('should handle different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        mockLogger.debug.mockClear();

        await logger.logRequestResponse({
          url: 'https://api.example.com/test',
          requestBody: { data: 'test' },
          requestMethod: method,
          response: mockResponse as Response,
        });

        const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
        expect(loggedMessage).toContain(`"method": "${method}"`);
      }
    });

    it('should handle various HTTP status codes', async () => {
      const statusCodes = [
        { code: 200, text: 'OK' },
        { code: 201, text: 'Created' },
        { code: 400, text: 'Bad Request' },
        { code: 401, text: 'Unauthorized' },
        { code: 403, text: 'Forbidden' },
        { code: 404, text: 'Not Found' },
        { code: 500, text: 'Internal Server Error' },
        { code: 502, text: 'Bad Gateway' },
        { code: 503, text: 'Service Unavailable' },
      ];

      for (const { code, text } of statusCodes) {
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        // @ts-expect-error
        mockResponse.ok = code >= 200 && code < 300;
        // @ts-expect-error
        mockResponse.status = code;
        // @ts-expect-error
        mockResponse.statusText = text;

        await logger.logRequestResponse({
          url: 'https://api.example.com/test',
          requestBody: { data: 'test' },
          requestMethod: 'POST',
          response: mockResponse as Response,
        });

        // All status codes should log as debug when error flag is not set
        const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
        expect(loggedMessage).toContain(`"status": ${code}`);
        expect(loggedMessage).toContain(`"statusText": "${text}"`);
        expect(mockLogger.debug).toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
      }
    });

    it('should log as error when error flag is set regardless of status code', async () => {
      const statusCodes = [
        { code: 200, text: 'OK' },
        { code: 400, text: 'Bad Request' },
        { code: 500, text: 'Internal Server Error' },
      ];

      for (const { code, text } of statusCodes) {
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        // @ts-expect-error
        mockResponse.ok = code >= 200 && code < 300;
        // @ts-expect-error
        mockResponse.status = code;
        // @ts-expect-error
        mockResponse.statusText = text;

        await logger.logRequestResponse({
          url: 'https://api.example.com/test',
          requestBody: { data: 'test' },
          requestMethod: 'POST',
          response: mockResponse as Response,
          error: true, // Explicitly set error flag
        });

        // Should always log as error when error flag is true
        const loggedMessage = mockLogger.error.mock.calls[0][0].message;
        expect(loggedMessage).toContain(`"status": ${code}`);
        expect(loggedMessage).toContain(`"statusText": "${text}"`);
        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockLogger.debug).not.toHaveBeenCalled();
      }
    });

    it('should handle empty request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: {},
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"requestBody": {}');
    });

    it('should handle null request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: null,
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('"requestBody": null');
    });

    it('should handle undefined request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: undefined,
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      // When undefined is passed through sanitizeObject, it may be omitted or converted to null
      // Just verify the log message exists and doesn't crash
      expect(loggedMessage).toContain('Api Request');
      expect(loggedMessage).toContain('"url"');
    });

    it('should handle response with empty body', async () => {
      mockResponse.clone = vi.fn().mockReturnValue({
        text: vi.fn().mockResolvedValue(''),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { data: 'test' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      // Empty response text should not be included in the log object
      expect(loggedMessage).not.toContain('"response"');
    });

    it('should handle response with whitespace-only body', async () => {
      mockResponse.clone = vi.fn().mockReturnValue({
        text: vi.fn().mockResolvedValue('   \n\t  '),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { data: 'test' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      // Whitespace-only response should be included
      expect(loggedMessage).toContain('"response": "   \\n\\t  "');
    });

    it('should log requests with very long URLs', async () => {
      const longUrl = 'https://api.example.com/test?' + 'param=value&'.repeat(100);

      await logger.logRequestResponse({
        url: longUrl,
        requestBody: { data: 'test' },
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('https://api.example.com/test');
    });

    it('should handle concurrent logging calls', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        logger.logRequestResponse({
          url: `https://api.example.com/test${i}`,
          requestBody: { id: i },
          requestMethod: 'POST',
          response: mockResponse as Response,
        }),
      );

      await Promise.all(promises);
      expect(mockLogger.debug).toHaveBeenCalledTimes(5);
    });

    it('should maintain message format consistency', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('Api Request');
      expect(loggedMessage).toContain('"message": "API request"');
      expect(loggedMessage).toContain('"url":');
      expect(loggedMessage).toContain('"method":');
      expect(loggedMessage).toContain('"requestBody":');
      expect(loggedMessage).toContain('"status":');
      expect(loggedMessage).toContain('"response":');
    });
  });

  describe('setStructuredLogging with custom logger', () => {
    let customLogger: {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      // Set custom logger to bypass default createLogMethod wrappers
      logger.setLogger(customLogger);
    });

    afterEach(() => {
      // Reset to default state after each test
      logger.setStructuredLogging(false);
    });

    it('should pass structured object when enabled', () => {
      logger.setStructuredLogging(true);

      logger.default.info('test message', { userId: '123', action: 'test' });

      // When structured logging is enabled, custom logger receives object
      expect(customLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'test message',
          userId: '123',
          action: 'test',
        }),
      );
    });

    it('should pass string with appended JSON when disabled', () => {
      logger.setStructuredLogging(false);

      logger.default.info('test message', { userId: '123' });

      // When structured logging is disabled, context is appended as JSON string
      const call = customLogger.info.mock.calls[0][0];
      expect(typeof call).toBe('string');
      expect(call).toContain('test message');
      expect(call).toContain('"userId"');
      expect(call).toContain('123');
    });

    it('should include all context fields in structured output', () => {
      logger.setStructuredLogging(true);

      const context = {
        userId: 'user-123',
        requestId: 'req-456',
        duration: 100,
      };

      logger.default.info('operation completed', context);

      expect(customLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'operation completed',
          userId: 'user-123',
          requestId: 'req-456',
          duration: 100,
        }),
      );
    });

    it('should pass plain string when no context provided', () => {
      logger.setStructuredLogging(true);

      logger.default.info('simple message');

      // Without context, just pass the string regardless of structured logging setting
      expect(customLogger.info).toHaveBeenCalledWith('simple message');
    });
  });

  describe('setLogger', () => {
    let customLogger: {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
    });

    afterEach(() => {
      // Reset structured logging
      logger.setStructuredLogging(false);
    });

    it('should route logs through custom logger', () => {
      logger.setLogger(customLogger);

      logger.default.info('test message');

      expect(customLogger.info).toHaveBeenCalledWith('test message');
    });

    it('should pass structured objects to custom logger when structured logging enabled', () => {
      logger.setLogger(customLogger);
      logger.setStructuredLogging(true);

      logger.default.info('test message', { requestId: 'req-123' });

      expect(customLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'test message',
          requestId: 'req-123',
        }),
      );
    });

    it('should validate custom logger has required methods', () => {
      expect(() => logger.setLogger(null as any)).toThrow(
        'Custom logger must be a valid object with required logging methods',
      );

      expect(() => logger.setLogger({} as any)).toThrow(
        'Custom logger is missing required methods',
      );

      expect(() => logger.setLogger({ info: vi.fn() } as any)).toThrow(
        'Custom logger is missing required methods: debug, warn, error',
      );
    });

    it('should work with winston-style loggers that accept objects', () => {
      // Simulate a winston-style logger that handles object arguments
      const winstonStyleLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      logger.setLogger(winstonStyleLogger);
      logger.setStructuredLogging(true);

      logger.default.info('structured log', { key: 'value' });

      expect(winstonStyleLogger.info).toHaveBeenCalledWith({
        message: 'structured log',
        key: 'value',
      });
    });
  });

  describe('logRequestResponse with structured logging', () => {
    let mockResponse: Partial<Response>;
    let customLogger: {
      debug: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: vi.fn().mockReturnValue({
          text: vi.fn().mockResolvedValue('{"success": true}'),
        }),
      };
      customLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      // Set custom logger to test structured logging behavior
      logger.setLogger(customLogger);
    });

    afterEach(() => {
      logger.setStructuredLogging(false);
    });

    it('should pass structured object with all request details', async () => {
      logger.setStructuredLogging(true);

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      expect(customLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API request',
          url: 'https://api.example.com/test',
          method: 'POST',
          status: 200,
          statusText: 'OK',
        }),
      );
    });

    it('should include response text in structured output', async () => {
      logger.setStructuredLogging(true);

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: null,
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const callArg = customLogger.debug.mock.calls[0][0];
      // Response text comes from the mock - exact format depends on mock implementation
      expect(callArg).toHaveProperty('response');
      expect(callArg.response).toContain('success');
    });

    it('should use error level when error flag is set', async () => {
      logger.setStructuredLogging(true);

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: null,
        requestMethod: 'GET',
        response: mockResponse as Response,
        error: true,
      });

      expect(customLogger.error).toHaveBeenCalled();
      expect(customLogger.debug).not.toHaveBeenCalled();
    });

    it('should sanitize sensitive data in structured output', async () => {
      logger.setStructuredLogging(true);

      await logger.logRequestResponse({
        url: 'https://api.example.com/test?api_key=secret123',
        requestBody: { password: 'secret', data: 'safe' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const callArg = customLogger.debug.mock.calls[0][0];
      // URL should have sensitive params redacted (may be URL-encoded as %5BREDACTED%5D)
      expect(callArg.url).toMatch(/(\[REDACTED\]|%5BREDACTED%5D)/);
      // Request body should have sensitive fields redacted
      expect(JSON.stringify(callArg.requestBody)).toContain('[REDACTED]');
    });
  });
});
