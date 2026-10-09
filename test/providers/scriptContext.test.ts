import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { sanitizeScriptContext } from '../../src/providers/scriptContext';
import { createMockProvider } from '../factories/provider';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('sanitizeScriptContext', () => {
  beforeEach(() => {
    vi.mocked(logger.debug).mockClear();
  });

  it('returns undefined when context is undefined', () => {
    expect(sanitizeScriptContext('PythonProvider', undefined)).toBeUndefined();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('strips non-serializable keys and logs them', () => {
    const originalProvider = createMockProvider({ id: 'x' });
    const context = {
      vars: { foo: 'bar' },
      getCache: vi.fn(),
      logger: { debug: vi.fn() },
      filters: { uppercase: () => '' },
      originalProvider,
    } as unknown as CallApiContextParams;

    const sanitized = sanitizeScriptContext('PythonProvider', context);

    expect(sanitized).toEqual({ vars: { foo: 'bar' } });
    expect(sanitized).not.toHaveProperty('getCache');
    expect(sanitized).not.toHaveProperty('logger');
    expect(sanitized).not.toHaveProperty('filters');
    expect(sanitized).not.toHaveProperty('originalProvider');

    expect(logger.debug).toHaveBeenCalledTimes(1);
    const message = vi.mocked(logger.debug).mock.calls[0][0] as string;
    expect(message).toBe(
      'PythonProvider sanitized context: stripped non-serializable keys [getCache, logger, filters, originalProvider]',
    );
  });

  it('does not mutate the caller-owned context', () => {
    const originalProvider = createMockProvider({ id: 'x' });
    const context = {
      vars: { foo: 'bar' },
      getCache: vi.fn(),
      logger: { debug: vi.fn() },
      filters: { uppercase: () => '' },
      originalProvider,
    } as unknown as CallApiContextParams;

    sanitizeScriptContext('RubyProvider', context);

    expect(context.getCache).toBeDefined();
    expect(context.logger).toBeDefined();
    expect(context.filters).toBeDefined();
    expect(context.originalProvider).toBe(originalProvider);
  });

  it('does not log when no non-serializable keys are present', () => {
    const context = { vars: { foo: 'bar' } } as unknown as CallApiContextParams;

    const sanitized = sanitizeScriptContext('PythonProvider', context);

    expect(sanitized).toEqual({ vars: { foo: 'bar' } });
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('uses the provided provider label in the log message', () => {
    const context = {
      vars: {},
      logger: { debug: vi.fn() },
    } as unknown as CallApiContextParams;

    sanitizeScriptContext('RubyProvider', context);

    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.debug).mock.calls[0][0]).toContain('RubyProvider');
  });

  it('only strips keys that are actually present', () => {
    const context = {
      vars: { foo: 'bar' },
      getCache: vi.fn(),
    } as unknown as CallApiContextParams;

    const sanitized = sanitizeScriptContext('PythonProvider', context);

    expect(sanitized).toEqual({ vars: { foo: 'bar' } });
    expect(sanitized).not.toHaveProperty('getCache');
    expect(logger.debug).toHaveBeenCalledTimes(1);
    const message = vi.mocked(logger.debug).mock.calls[0][0] as string;
    expect(message).toContain('getCache');
    expect(message).not.toContain('logger');
    expect(message).not.toContain('filters');
    expect(message).not.toContain('originalProvider');
  });
});
