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
    it('should initialize source map support only once', async () => {
      await logger.initializeSourceMapSupport();
      expect(logger.sourceMapSupportInitialized).toBe(true);

      await logger.initializeSourceMapSupport();
      expect(logger.sourceMapSupportInitialized).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      jest.doMock('source-map-support', () => {
        throw new Error('Module not found');
      });
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
});
