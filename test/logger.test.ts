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
  error: jest.fn((msg: string) => {
    process.stdout.write(chalk.red(msg));
    return mockLogger;
  }),
  warn: jest.fn((msg: string) => {
    process.stdout.write(chalk.yellow(msg));
    return mockLogger;
  }),
  info: jest.fn((msg: string) => {
    process.stdout.write(msg);
    return mockLogger;
  }),
  debug: jest.fn((msg: string) => {
    process.stdout.write(chalk.cyan(msg));
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
    File: jest.fn(),
  },
}));

describe('logger', () => {
  let loggerModule: any;
  let mockStdout: jest.SpyInstance;

  beforeEach(async () => {
    mockStdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.clearAllMocks();
    loggerModule = await import('../src/logger');
    loggerModule.setLogCallback(null);
  });

  afterEach(() => {
    mockStdout.mockRestore();
  });

  describe('logger methods', () => {
    it('should log messages at different levels', () => {
      loggerModule.logger.error('test error');
      expect(mockStdout).toHaveBeenCalledWith(chalk.red('test error'));

      loggerModule.logger.warn('test warning');
      expect(mockStdout).toHaveBeenCalledWith(chalk.yellow('test warning'));

      loggerModule.logger.info('test info');
      expect(mockStdout).toHaveBeenCalledWith('test info');

      loggerModule.logger.debug('test debug');
      expect(mockStdout).toHaveBeenCalledWith(chalk.cyan('test debug'));
    });
  });

  describe('getLogLevel', () => {
    it('should return current log level', () => {
      expect(loggerModule.getLogLevel()).toBe('info');
    });
  });

  describe('setLogLevel', () => {
    it('should set valid log levels', () => {
      loggerModule.setLogLevel('debug');
      expect(loggerModule.getLogLevel()).toBe('debug');
    });

    it('should throw error for invalid log level', () => {
      expect(() => loggerModule.setLogLevel('invalid')).toThrow('Invalid log level: invalid');
    });
  });

  describe('setLogCallback', () => {
    it('should allow setting null callback', () => {
      const callback = jest.fn();
      loggerModule.setLogCallback(callback);
      loggerModule.setLogCallback(null);
      loggerModule.logger.info('test message');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('error log file', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let winston: any;

    beforeEach(() => {
      originalEnv = process.env;
      process.env = { ...originalEnv };
      process.env.PROMPTFOO_LOG_DIR = '.';
      delete process.env.PROMPTFOO_DISABLE_ERROR_LOG;
      winston = jest.requireMock('winston');
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should not create error log file when disabled', () => {
      process.env.PROMPTFOO_DISABLE_ERROR_LOG = 'true';
      loggerModule.logger.error('test error');
      expect(winston.transports.File).not.toHaveBeenCalled();
    });
  });
});
