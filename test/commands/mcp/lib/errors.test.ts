import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../../../src/commands/mcp/lib/errors';

describe('MCP Errors', () => {
  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Invalid config', '/path/to/config.yaml');
      expect(error.message).toBe('Invalid config');
      expect(error.details).toEqual({ configPath: '/path/to/config.yaml' });
      expect(error.statusCode).toBe(400);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.name).toBe('ConfigurationError');
    });
  });

  it('serializes the live configuration error with its public fields', () => {
    const error = new ConfigurationError('Invalid config', '/path/to/config.yaml');
    expect(error.toJSON()).toEqual({
      code: 'CONFIGURATION_ERROR',
      message: 'Invalid config',
      details: { configPath: '/path/to/config.yaml' },
    });
  });
});
