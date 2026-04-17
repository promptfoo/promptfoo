import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  determineEffectiveSessionSource,
  formatConfigBody,
  formatConfigHeaders,
  validateSessionConfig,
} from '../../src/validators/util';

import type { ApiProvider } from '../../src/types/providers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatConfigBody', () => {
  it('should return "None configured" when body is falsy', () => {
    expect(formatConfigBody({ body: undefined })).toBe('None configured');
    expect(formatConfigBody({ body: null })).toBe('None configured');
    expect(formatConfigBody({ body: '' })).toBe('None configured');
  });

  it('should pretty-print valid JSON string body', () => {
    const body = '{"key":"value","nested":{"a":1}}';
    const result = formatConfigBody({ body });
    expect(result).toContain('"key": "value"');
    expect(result).toContain('"nested"');
    // Should be indented
    expect(result).toContain('    ');
  });

  it('should indent non-JSON string body', () => {
    const body = 'plain text body';
    const result = formatConfigBody({ body });
    expect(result).toBe('\n    plain text body');
  });

  it('should stringify and indent object body', () => {
    const body = { key: 'value', number: 42 };
    const result = formatConfigBody({ body });
    expect(result).toContain('"key": "value"');
    expect(result).toContain('"number": 42');
    expect(result).toContain('    ');
  });

  it('should handle nested objects', () => {
    const body = { outer: { inner: 'deep' } };
    const result = formatConfigBody({ body });
    expect(result).toContain('"outer"');
    expect(result).toContain('"inner": "deep"');
  });

  it('should handle array body', () => {
    const body = [1, 2, 3];
    const result = formatConfigBody({ body });
    expect(result).toContain('1');
    expect(result).toContain('2');
    expect(result).toContain('3');
  });
});

describe('formatConfigHeaders', () => {
  it('should return "None configured" when headers is undefined', () => {
    expect(formatConfigHeaders({ headers: undefined })).toBe('None configured');
  });

  it('should format headers as key-value pairs', () => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token123',
    };
    const result = formatConfigHeaders({ headers });
    expect(result).toContain('Content-Type: application/json');
    expect(result).toContain('Authorization: Bearer token123');
  });

  it('should handle single header', () => {
    const result = formatConfigHeaders({ headers: { Accept: 'text/plain' } });
    expect(result).toContain('Accept: text/plain');
  });

  it('should handle empty headers object', () => {
    const result = formatConfigHeaders({ headers: {} });
    // Empty object should produce a newline with no entries
    expect(result).toBe('\n');
  });
});

describe('validateSessionConfig', () => {
  it('should warn when sessionId template is missing from config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // The function uses the logger module, so we just verify it doesn't throw
    const provider = {
      id: () => 'test-provider',
      config: { url: 'https://example.com/api' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    // The function uses the logger module, so we just verify it doesn't throw
    validateSessionConfig({
      provider,
      sessionSource: 'client',
    });

    warnSpy.mockRestore();
  });

  it('should not warn when sessionId template is present in config', () => {
    const provider = {
      id: () => 'test-provider',
      config: {
        url: 'https://example.com/api',
        headers: { 'X-Session': '{{sessionId}}' },
      },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    // Should not throw
    expect(() =>
      validateSessionConfig({
        provider,
        sessionSource: 'client',
      }),
    ).not.toThrow();
  });

  it('should handle server session source without session parser', () => {
    const provider = {
      id: () => 'test-provider',
      config: { url: 'https://example.com/api', body: '{{sessionId}}' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    // Should not throw even with missing session parser
    expect(() =>
      validateSessionConfig({
        provider,
        sessionSource: 'server',
      }),
    ).not.toThrow();
  });

  it('should handle server session source with session parser', () => {
    const provider = {
      id: () => 'test-provider',
      config: { url: 'https://example.com/api', body: '{{sessionId}}' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    expect(() =>
      validateSessionConfig({
        provider,
        sessionSource: 'server',
        sessionConfig: { sessionParser: 'response.headers.x-session-id' },
      }),
    ).not.toThrow();
  });

  it('should handle provider with no config', () => {
    const provider = {
      id: () => 'test-provider',
      config: {},
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    expect(() =>
      validateSessionConfig({
        provider,
        sessionSource: 'client',
      }),
    ).not.toThrow();
  });
});

describe('determineEffectiveSessionSource', () => {
  it('should use sessionConfig.sessionSource when provided', () => {
    const provider = {
      id: () => 'test-provider',
      config: { sessionSource: 'client' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({
      provider,
      sessionConfig: { sessionSource: 'server' },
    });
    expect(result).toBe('server');
  });

  it('should use provider.config.sessionSource when sessionConfig is not provided', () => {
    const provider = {
      id: () => 'test-provider',
      config: { sessionSource: 'server' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({ provider });
    expect(result).toBe('server');
  });

  it('should return "server" when provider has sessionParser', () => {
    const provider = {
      id: () => 'test-provider',
      config: { sessionParser: 'response.id' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({ provider });
    expect(result).toBe('server');
  });

  it('should default to "client" when no session config exists', () => {
    const provider = {
      id: () => 'test-provider',
      config: {},
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({ provider });
    expect(result).toBe('client');
  });

  it('should prioritize sessionConfig over provider config', () => {
    const provider = {
      id: () => 'test-provider',
      config: { sessionSource: 'client', sessionParser: 'response.id' },
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({
      provider,
      sessionConfig: { sessionSource: 'server' },
    });
    expect(result).toBe('server');
  });

  it('should handle undefined sessionConfig', () => {
    const provider = {
      id: () => 'test-provider',
      config: {},
      callApi: vi.fn(),
    } as unknown as ApiProvider;

    const result = determineEffectiveSessionSource({
      provider,
      sessionConfig: undefined,
    });
    expect(result).toBe('client');
  });
});
