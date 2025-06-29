import {
  AuthenticationError,
  ConfigurationError,
  isMcpError,
  McpError,
  NotFoundError,
  ProviderError,
  ServiceUnavailableError,
  SharingError,
  TimeoutError,
  toMcpError,
  ValidationError,
} from '../../../../src/commands/mcp/lib/errors';

describe('MCP Error Classes', () => {
  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError('Invalid input', { field: 'test' });

      expect(error).toBeInstanceOf(McpError);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.name).toBe('ValidationError');
    });

    it('should create validation error without details', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.details).toBeUndefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new ValidationError('Invalid input', { field: 'test' });
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'test' },
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource and id', () => {
      const error = new NotFoundError('Evaluation', 'eval-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Evaluation with ID "eval-123" not found');
      expect(error.details).toEqual({ resource: 'Evaluation', id: 'eval-123' });
    });

    it('should create not found error with resource only', () => {
      const error = new NotFoundError('Evaluations');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Evaluations not found');
      expect(error.details).toEqual({ resource: 'Evaluations', id: undefined });
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error with config path', () => {
      const error = new ConfigurationError('Invalid config', '/path/to/config.yaml');

      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid config');
      expect(error.details).toEqual({ configPath: '/path/to/config.yaml' });
    });

    it('should create configuration error without config path', () => {
      const error = new ConfigurationError('Invalid config');

      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.message).toBe('Invalid config');
      expect(error.details).toEqual({ configPath: undefined });
    });
  });

  describe('ProviderError', () => {
    it('should create provider error with details', () => {
      const error = new ProviderError('openai', 'Rate limit exceeded', { remaining: 0 });

      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Provider "openai" error: Rate limit exceeded');
      expect(error.details).toEqual({ providerId: 'openai', remaining: 0 });
    });

    it('should create provider error without additional details', () => {
      const error = new ProviderError('openai', 'Connection failed');

      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.message).toBe('Provider "openai" error: Connection failed');
      expect(error.details).toEqual({ providerId: 'openai' });
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with operation and timeout', () => {
      const error = new TimeoutError('API call', 5000);

      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.statusCode).toBe(408);
      expect(error.message).toBe('Operation "API call" timed out after 5000ms');
      expect(error.details).toEqual({ operation: 'API call', timeoutMs: 5000 });
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error with details', () => {
      const error = new ServiceUnavailableError('database', { retryAfter: 60 });

      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Service "database" is unavailable');
      expect(error.details).toEqual({ service: 'database', retryAfter: 60 });
    });

    it('should create service unavailable error without details', () => {
      const error = new ServiceUnavailableError('api');

      expect(error.message).toBe('Service "api" is unavailable');
      expect(error.details).toEqual({ service: 'api' });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid API key');

      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid API key');
    });

    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Authentication failed');
    });
  });

  describe('SharingError', () => {
    it('should create sharing error with details', () => {
      const error = new SharingError('Sharing disabled', { feature: 'public-share' });

      expect(error.code).toBe('SHARING_ERROR');
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Sharing disabled');
      expect(error.details).toEqual({ feature: 'public-share' });
    });
  });

  describe('toMcpError utility', () => {
    it('should return McpError as-is', () => {
      const originalError = new ValidationError('test');
      const result = toMcpError(originalError);

      expect(result).toBe(originalError);
    });

    it('should convert regular Error to ValidationError', () => {
      const originalError = new Error('Something went wrong');
      const result = toMcpError(originalError);

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe('Something went wrong');
    });

    it('should convert unknown error to ValidationError with default message', () => {
      const result = toMcpError('string error');

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe('Unknown error occurred');
      expect(result.details).toEqual({ originalError: 'string error' });
    });

    it('should convert unknown error with custom default message', () => {
      const result = toMcpError(null, 'Custom default');

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe('Custom default');
      expect(result.details).toEqual({ originalError: null });
    });
  });

  describe('isMcpError type guard', () => {
    it('should return true for McpError instances', () => {
      const error = new ValidationError('test');
      expect(isMcpError(error)).toBe(true);
    });

    it('should return true for all MCP error types', () => {
      const errors = [
        new ValidationError('test'),
        new NotFoundError('resource'),
        new ConfigurationError('test'),
        new ProviderError('test', 'message'),
        new TimeoutError('test', 1000),
        new ServiceUnavailableError('test'),
        new AuthenticationError(),
        new SharingError('test'),
      ];

      for (const error of errors) {
        expect(isMcpError(error)).toBe(true);
      }
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('regular error');
      expect(isMcpError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isMcpError('string')).toBe(false);
      expect(isMcpError(null)).toBe(false);
      expect(isMcpError(undefined)).toBe(false);
      expect(isMcpError({})).toBe(false);
      expect(isMcpError(123)).toBe(false);
    });
  });

  describe('Error inheritance and stack traces', () => {
    it('should maintain proper prototype chain', () => {
      const error = new ValidationError('test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof McpError).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new ValidationError('test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });
});
