import chalk from 'chalk';
import type { Logger } from 'winston';
import type Transport from 'winston-transport';

jest.unmock('../src/logger');
jest.mock('../src/envars', () => ({
  getEnvString: jest.fn((key, defaultValue) => defaultValue),
}));

interface MockLogger extends Omit<Logger, 'transports'> {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  on: jest.Mock;
  add: jest.Mock;
  remove: jest.Mock;
  transports: Array<Partial<Transport>>;
}

const mockLogger: MockLogger = {
  error: jest.fn((info) => {
    process.stdout.write(chalk.red(info.message));
    return mockLogger;
  }),
  warn: jest.fn((info) => {
    process.stdout.write(chalk.yellow(info.message));
    return mockLogger;
  }),
  info: jest.fn((info) => {
    process.stdout.write(info.message);
    return mockLogger;
  }),
  debug: jest.fn((info) => {
    process.stdout.write(chalk.cyan(info.message));
    return mockLogger;
  }),
  on: jest.fn(),
  add: jest.fn(),
  remove: jest.fn(),
  transports: [{ level: 'info' }],
} as MockLogger;

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockLogger),
  format: {
    combine: jest.fn(),
    simple: jest.fn(),
    printf: jest.fn((cb) => cb),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(() => ({
      write: jest.fn(),
    })),
  },
}));

describe('logger', () => {
  let logger: any;
  let mockStdout: jest.SpyInstance;
  let originalError: typeof Error;

  beforeEach(async () => {
    originalError = global.Error;
    mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
    logger = await import('../src/logger');
    mockLogger.transports[0].level = 'info';
  });

  afterEach(() => {
    mockStdout.mockRestore();
    global.Error = originalError;
    jest.resetModules();
  });

  describe('logger methods', () => {
    it('should log messages at different levels', () => {
      logger.logger.error('test error');
      expect(mockLogger.error).toHaveBeenCalledWith({ message: 'test error', location: '' });

      logger.logger.warn('test warning');
      expect(mockLogger.warn).toHaveBeenCalledWith({ message: 'test warning', location: '' });

      logger.logger.info('test info');
      expect(mockLogger.info).toHaveBeenCalledWith({ message: 'test info', location: '' });

      logger.logger.debug('test debug');
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

      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', { value: mockStack });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

      logger.logger.debug('debug message');
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
      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', { value: undefined });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

      const location = logger.getCallerLocation();
      expect(location).toBe('');
    });

    it('should handle different stack trace formats', () => {
      const mockStack = `Error
        at getCallerLocation (file.ts:1:1)
        at Object.<anonymous> (test.ts:10:20)
        at Object.foo (/absolute/path/file.js:20:10)
        at plain/format/path.js:30:5`;
      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', { value: mockStack });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

      const location = logger.getCallerLocation();
      expect(location).toMatch(/\[.*:\d+\]/);
    });

    it('should handle empty stack trace', () => {
      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', { value: '' });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

      const location = logger.getCallerLocation();
      expect(location).toBe('');
    });

    it('should handle errors in stack trace parsing', () => {
      // Force an error in the try block by making stack.split throw
      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', {
        get: () => {
          throw new Error('Forced error');
        },
      });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

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
      const callback = jest.fn();
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
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-03-01T12:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
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

  describe('initializeSourceMapSupport', () => {
    let mockInstall: jest.Mock;

    beforeEach(async () => {
      // Reset the module between tests
      jest.resetModules();

      // Create a mock for source-map-support
      mockInstall = jest.fn();
      jest.doMock('source-map-support', () => ({
        install: mockInstall,
      }));

      // Import the logger using our mock
      logger = await import('../src/logger');
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('should initialize source map support only once', async () => {
      // First initialize - should call install
      expect(mockInstall).not.toHaveBeenCalled();
      await logger.initializeSourceMapSupport();
      expect(mockInstall).toHaveBeenCalledTimes(1);

      // Clear the mock to verify next call
      mockInstall.mockClear();

      // Second call - sourceMapSupportInitialized should be true
      // so install shouldn't be called again
      await logger.initializeSourceMapSupport();
      expect(mockInstall).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Override the mock to throw
      jest.doMock('source-map-support', () => {
        throw new Error('Module not found');
      });

      // Force re-importing logger module to use our mock
      jest.resetModules();
      logger = await import('../src/logger');

      // Should not throw error
      await expect(logger.initializeSourceMapSupport()).resolves.toBeUndefined();
    });
  });

  describe('error log file', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env.PROMPTFOO_LOG_DIR = '.';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create error log file on error', () => {
      const mockFileTransport = { write: jest.fn() };
      const winston = jest.requireMock('winston');
      winston.transports.File.mockReturnValue(mockFileTransport);

      const errorChunk = { level: 'error', message: 'test error' };
      mockLogger.on.mock.calls.find((call: any[]) => call[0] === 'data')?.[1](errorChunk);

      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
        }),
      );
      expect(mockLogger.add).toHaveBeenCalledWith(mockFileTransport);
      expect(mockFileTransport.write).toHaveBeenCalledWith(errorChunk);
    });

    it('should not create error log file when disabled', () => {
      process.env.PROMPTFOO_DISABLE_ERROR_LOG = 'true';
      logger.logger.error('test error');
      const winston = jest.requireMock('winston');
      expect(winston.transports.File).not.toHaveBeenCalled();
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
      logger.logger.info('');
      expect(mockLogger.info).toHaveBeenCalledWith({ message: '', location: '' });

      logger.logger.error('');
      expect(mockLogger.error).toHaveBeenCalledWith({ message: '', location: '' });

      logger.logger.warn('');
      expect(mockLogger.warn).toHaveBeenCalledWith({ message: '', location: '' });

      logger.logger.debug('');
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
      logger.logger.info('test info with debug enabled');

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
      expect(typeof logger.logger.add).toBe('function');
      expect(typeof logger.logger.remove).toBe('function');

      // Test that the methods are bound to winstonLogger
      const addSpy = jest.spyOn(mockLogger, 'add');
      const removeSpy = jest.spyOn(mockLogger, 'remove');

      const transport = { name: 'test' } as any;
      logger.logger.add(transport);
      expect(addSpy).toHaveBeenCalledWith(transport);

      logger.logger.remove(transport);
      expect(removeSpy).toHaveBeenCalledWith(transport);
    });

    it('should expose transports property', () => {
      // Test the transports property is correctly assigned (line 207-208)
      expect(logger.logger.transports).toBe(mockLogger.transports);

      // Verify we can access the transports array
      expect(Array.isArray(logger.logger.transports)).toBe(true);
    });
  });
});
