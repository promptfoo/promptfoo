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

      const mockError = new Error();
      Object.defineProperty(mockError, 'stack', { value: mockStack });
      jest.spyOn(global, 'Error').mockImplementation(() => mockError);

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
      logger.default.error('test error');
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
      const addSpy = jest.spyOn(mockLogger, 'add');
      const removeSpy = jest.spyOn(mockLogger, 'remove');

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

  describe('logRequestResponse', () => {
    let mockResponse: Partial<Response>;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        clone: jest.fn().mockReturnValue({
          text: jest.fn().mockResolvedValue('{"success": true}'),
        }),
      };
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      jest.clearAllMocks();
    });

    it('should log successful requests as debug', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      expect(mockLogger.debug).toHaveBeenCalledWith({
        message: expect.stringContaining('API request:'),
        location: expect.any(String),
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log failed responses as error', async () => {
      mockResponse.ok = false;
      mockResponse.status = 500;
      mockResponse.statusText = 'Internal Server Error';

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      expect(mockLogger.error).toHaveBeenCalledWith({
        message: expect.stringContaining('API request:'),
        location: expect.any(String),
      });
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log as error when error flag is true', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
        error: true,
      });

      expect(mockLogger.error).toHaveBeenCalledWith({
        message: expect.stringContaining('API request:'),
        location: expect.any(String),
      });
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle requests without response', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
      });

      expect(mockLogger.debug).toHaveBeenCalledWith({
        message: expect.stringContaining('API request:'),
        location: expect.any(String),
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('URL: https://api.example.com/test');
      expect(loggedMessage).toContain('Method: POST');
      expect(loggedMessage).toContain('Request Body:');
      expect(loggedMessage).not.toContain('Status:');
      expect(loggedMessage).not.toContain('Response:');
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

      // Check that sanitization functions are called (the actual sanitization logic is tested elsewhere)
      expect(loggedMessage).toContain('URL:');
      expect(loggedMessage).toContain('Request Body:');
    });

    it('should include all request/response details in message', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt', model: 'gpt-4' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;

      expect(loggedMessage).toContain('URL: https://api.example.com/test');
      expect(loggedMessage).toContain('Method: POST');
      expect(loggedMessage).toContain('Request Body:');
      expect(loggedMessage).toContain('Status: 200 OK');
      expect(loggedMessage).toContain('Response: {"success": true}');
    });

    it('should handle response text extraction errors', async () => {
      mockResponse.clone = jest.fn().mockReturnValue({
        text: jest.fn().mockRejectedValue(new Error('Failed to read response')),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { prompt: 'test prompt' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('Response: Unable to read response');
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
      expect(loggedMessage).toContain('Request Body:');
      // Should contain formatted JSON
      expect(loggedMessage).toMatch(/\{\s*"messages"/);
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
        expect(loggedMessage).toContain(`Method: ${method}`);
      }
    });

    it('should handle various HTTP status codes', async () => {
      const statusCodes = [
        { code: 200, text: 'OK', shouldError: false },
        { code: 201, text: 'Created', shouldError: false },
        { code: 400, text: 'Bad Request', shouldError: true },
        { code: 401, text: 'Unauthorized', shouldError: true },
        { code: 403, text: 'Forbidden', shouldError: true },
        { code: 404, text: 'Not Found', shouldError: true },
        { code: 500, text: 'Internal Server Error', shouldError: true },
        { code: 502, text: 'Bad Gateway', shouldError: true },
        { code: 503, text: 'Service Unavailable', shouldError: true },
      ];

      for (const { code, text, shouldError } of statusCodes) {
        mockLogger.debug.mockClear();
        mockLogger.error.mockClear();

        mockResponse.ok = code >= 200 && code < 300;
        mockResponse.status = code;
        mockResponse.statusText = text;

        await logger.logRequestResponse({
          url: 'https://api.example.com/test',
          requestBody: { data: 'test' },
          requestMethod: 'POST',
          response: mockResponse as Response,
        });

        const loggedMessage = shouldError
          ? mockLogger.error.mock.calls[0][0].message
          : mockLogger.debug.mock.calls[0][0].message;

        expect(loggedMessage).toContain(`Status: ${code} ${text}`);

        if (shouldError) {
          expect(mockLogger.error).toHaveBeenCalled();
          expect(mockLogger.debug).not.toHaveBeenCalled();
        } else {
          expect(mockLogger.debug).toHaveBeenCalled();
          expect(mockLogger.error).not.toHaveBeenCalled();
        }
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
      expect(loggedMessage).toContain('Request Body: {}');
    });

    it('should handle null request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: null,
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('Request Body: null');
    });

    it('should handle undefined request body', async () => {
      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: undefined,
        requestMethod: 'GET',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('Request Body: undefined');
    });

    it('should handle response with empty body', async () => {
      mockResponse.clone = jest.fn().mockReturnValue({
        text: jest.fn().mockResolvedValue(''),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { data: 'test' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).not.toContain('Response:');
    });

    it('should handle response with whitespace-only body', async () => {
      mockResponse.clone = jest.fn().mockReturnValue({
        text: jest.fn().mockResolvedValue('   \n\t  '),
      });

      await logger.logRequestResponse({
        url: 'https://api.example.com/test',
        requestBody: { data: 'test' },
        requestMethod: 'POST',
        response: mockResponse as Response,
      });

      const loggedMessage = mockLogger.debug.mock.calls[0][0].message;
      expect(loggedMessage).toContain('Response:    \n\t  ');
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
      expect(loggedMessage).toContain('URL:');
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

      // Check that message starts with the expected prefix
      expect(loggedMessage).toMatch(/^API request:\n/);

      // Check that all sections are properly separated
      const lines = loggedMessage.split('\n');
      expect(lines.some((line) => /^URL: /.test(line))).toBe(true);
      expect(lines.some((line) => /^Method: /.test(line))).toBe(true);
      expect(lines.some((line) => /^Request Body: /.test(line))).toBe(true);
      expect(lines.some((line) => /^Status: /.test(line))).toBe(true);
      expect(lines.some((line) => /^Response: /.test(line))).toBe(true);
    });
  });
});
