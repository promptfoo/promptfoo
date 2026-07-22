import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../../../src/commands/mcp/lib/errors';

describe('ConfigurationError', () => {
  it('preserves the configuration error contract', () => {
    const error = new ConfigurationError('Invalid config', '/path/to/config.yaml');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toBe('Invalid config');
    expect(error.code).toBe('CONFIGURATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ configPath: '/path/to/config.yaml' });
    expect(error.toJSON()).toEqual({
      code: 'CONFIGURATION_ERROR',
      message: 'Invalid config',
      details: { configPath: '/path/to/config.yaml' },
    });
  });
});
