import {
  ValidationError,
  NotFoundError,
  ConfigurationError,
  ProviderError,
  TimeoutError,
  ServiceUnavailableError,
  AuthenticationError,
  SharingError,
  RateLimitError,
  FileOperationError,
  toMcpError,
  isMcpError,
} from '../../../../src/commands/mcp/lib/errors';

describe('MCP Errors', () => {
  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should include details when provided', () => {
      const details = { field: 'email', value: 'invalid' };
      const error = new ValidationError('Invalid email', details);
      expect(error.details).toEqual(details);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ValidationError('Test error', { foo: 'bar' });
      expect(error.toJSON()).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Test error',
        details: { foo: 'bar' },
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource and id', () => {
      const error = new NotFoundError('Evaluation', 'eval_123');
      expect(error.message).toBe('Evaluation with ID "eval_123" not found');
      expect(error.details).toEqual({ resource: 'Evaluation', id: 'eval_123' });
    });

    it('should create error with resource only', () => {
      const error = new NotFoundError('Configuration');
      expect(error.message).toBe('Configuration not found');
      expect(error.details).toEqual({ resource: 'Configuration', id: undefined });
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Invalid config', '/path/to/config.yaml');
      expect(error.message).toBe('Invalid config');
      expect(error.details).toEqual({ configPath: '/path/to/config.yaml' });
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ProviderError', () => {
    it('should create provider error with details', () => {
      const error = new ProviderError('openai:gpt-4', 'API key invalid', { endpoint: '/v1/chat' });
      expect(error.message).toBe('Provider "openai:gpt-4" error: API key invalid');
      expect(error.details).toEqual({ providerId: 'openai:gpt-4', endpoint: '/v1/chat' });
      expect(error.statusCode).toBe(500);
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('API call', 30000);
      expect(error.message).toBe('Operation "API call" timed out after 30000ms');
      expect(error.details).toEqual({ operation: 'API call', timeoutMs: 30000 });
      expect(error.statusCode).toBe(408);
    });
  });

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Database', { reason: 'Connection failed' });
      expect(error.message).toBe('Service "Database" is unavailable');
      expect(error.details).toEqual({ service: 'Database', reason: 'Connection failed' });
      expect(error.statusCode).toBe(503);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid API key');
      expect(error.message).toBe('Invalid API key');
    });
  });

  describe('SharingError', () => {
    it('should create sharing error', () => {
      const error = new SharingError('Sharing service down', { evalId: 'eval_123' });
      expect(error.message).toBe('Sharing service down');
      expect(error.details).toEqual({ evalId: 'eval_123' });
      expect(error.statusCode).toBe(503);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error without retry after', () => {
      const error = new RateLimitError('OpenAI API');
      expect(error.message).toBe('Rate limit exceeded for OpenAI API');
      expect(error.statusCode).toBe(429);
    });

    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('OpenAI API', 60, { requests: 100 });
      expect(error.message).toBe('Rate limit exceeded for OpenAI API. Retry after 60 seconds.');
      expect(error.details).toEqual({ service: 'OpenAI API', retryAfter: 60, requests: 100 });
    });
  });

  describe('FileOperationError', () => {
    it('should create file operation error', () => {
      const originalError = new Error('Permission denied');
      const error = new FileOperationError('write', '/path/to/file.txt', originalError);
      expect(error.message).toBe('Failed to write file: /path/to/file.txt');
      expect(error.details).toEqual({
        operation: 'write',
        filePath: '/path/to/file.txt',
        originalError: 'Permission denied',
      });
    });
  });

  describe('toMcpError', () => {
    it('should return McpError as-is', () => {
      const error = new ValidationError('Test');
      expect(toMcpError(error)).toBe(error);
    });

    it('should convert rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(RateLimitError);
    });

    it('should convert not found errors', () => {
      const error = new Error('File not found');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(NotFoundError);
    });

    it('should convert ENOENT errors', () => {
      const error = new Error('ENOENT: no such file or directory');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(NotFoundError);
    });

    it('should convert timeout errors', () => {
      const error = new Error('Request timed out');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(TimeoutError);
    });

    it('should convert authentication errors', () => {
      const error = new Error('Unauthorized access');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(AuthenticationError);
    });

    it('should convert configuration errors', () => {
      const error = new Error('Invalid configuration');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(ConfigurationError);
    });

    it('should convert generic errors to ValidationError', () => {
      const error = new Error('Some other error');
      const mcpError = toMcpError(error);
      expect(mcpError).toBeInstanceOf(ValidationError);
      expect(mcpError.message).toBe('Some other error');
    });

    it('should handle non-Error objects', () => {
      const mcpError = toMcpError('string error');
      expect(mcpError).toBeInstanceOf(ValidationError);
      expect(mcpError.message).toBe('Unknown error occurred');
      expect(mcpError.details).toEqual({ originalError: 'string error' });
    });

    it('should use custom default message', () => {
      const mcpError = toMcpError(null, 'Custom error message');
      expect(mcpError.message).toBe('Custom error message');
    });
  });

  describe('isMcpError', () => {
    it('should return true for McpError instances', () => {
      expect(isMcpError(new ValidationError('Test'))).toBe(true);
      expect(isMcpError(new NotFoundError('Resource'))).toBe(true);
      expect(isMcpError(new RateLimitError('Service'))).toBe(true);
    });

    it('should return false for non-McpError instances', () => {
      expect(isMcpError(new Error('Test'))).toBe(false);
      expect(isMcpError('string')).toBe(false);
      expect(isMcpError(null)).toBe(false);
      expect(isMcpError(undefined)).toBe(false);
      expect(isMcpError({})).toBe(false);
    });
  });
});
