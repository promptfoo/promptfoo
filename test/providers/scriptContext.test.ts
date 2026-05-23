import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import {
  buildCacheableScriptContext,
  containsSensitiveScriptInput,
  sanitizeScriptContext,
} from '../../src/providers/scriptContext';
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

  it('retains per-run identifiers so the sanitized payload can be forwarded to the script', () => {
    const context = {
      vars: { foo: 'bar' },
      evaluationId: 'eval-abc',
      testCaseId: 'case-123',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=value',
      testIdx: 0,
      promptIdx: 0,
    } as unknown as CallApiContextParams;

    const sanitized = sanitizeScriptContext('PythonProvider', context);

    expect(sanitized).toEqual({
      vars: { foo: 'bar' },
      evaluationId: 'eval-abc',
      testCaseId: 'case-123',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=value',
      testIdx: 0,
      promptIdx: 0,
    });
  });
});

describe('buildCacheableScriptContext', () => {
  it('returns undefined when context is undefined', () => {
    expect(buildCacheableScriptContext(undefined)).toBeUndefined();
  });

  it('strips non-serializable keys', () => {
    const context = {
      vars: { foo: 'bar' },
      getCache: vi.fn(),
      logger: { debug: vi.fn() },
      filters: { uppercase: () => '' },
      originalProvider: createMockProvider({ id: 'x' }),
    } as unknown as CallApiContextParams;

    const cacheable = buildCacheableScriptContext(context);

    expect(cacheable).toEqual({ vars: { foo: 'bar' } });
  });

  it('strips tracing identifiers while retaining script-visible indices', () => {
    const context = {
      vars: { foo: 'bar' },
      prompt: { raw: 'Hi', label: 'Hi' },
      evaluationId: 'eval-abc',
      testCaseId: 'case-123',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=value',
      testIdx: 3,
      promptIdx: 1,
    } as unknown as CallApiContextParams;

    const cacheable = buildCacheableScriptContext(context);

    expect(cacheable).toEqual({
      vars: { foo: 'bar' },
      prompt: { raw: 'Hi', label: 'Hi' },
      testIdx: 3,
      promptIdx: 1,
    });
    expect(cacheable).not.toHaveProperty('evaluationId');
    expect(cacheable).not.toHaveProperty('testCaseId');
    expect(cacheable).not.toHaveProperty('traceparent');
    expect(cacheable).not.toHaveProperty('tracestate');
  });

  it('produces an identical shape when only per-run identifiers differ', () => {
    const base = {
      vars: { name: 'Alice' },
      prompt: { raw: 'Hi Alice', label: 'Hi {{name}}' },
      test: { vars: { name: 'Alice' }, assert: [], options: {}, metadata: {} },
      repeatIndex: 0,
    };

    const contextA = {
      ...base,
      evaluationId: 'eval-first',
      testCaseId: 'case-first',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaaaaaa-01',
    } as unknown as CallApiContextParams;

    const contextB = {
      ...base,
      evaluationId: 'eval-second',
      testCaseId: 'case-second',
      traceparent: '00-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-bbbbbbbbbbbbbbbb-01',
    } as unknown as CallApiContextParams;

    const cacheableA = buildCacheableScriptContext(contextA);
    const cacheableB = buildCacheableScriptContext(contextB);

    expect(cacheableA).toEqual(cacheableB);
  });

  it('does not mutate the caller-owned context', () => {
    const context = {
      vars: { foo: 'bar' },
      evaluationId: 'eval-abc',
      getCache: vi.fn(),
    } as unknown as CallApiContextParams;

    buildCacheableScriptContext(context);

    expect(context.evaluationId).toBe('eval-abc');
    expect(context.getCache).toBeDefined();
  });
});

describe('containsSensitiveScriptInput', () => {
  it('detects secret fields and credential-shaped values', () => {
    expect(containsSensitiveScriptInput({ config: { apiKey: 'test-value' } })).toBe(true);
    expect(containsSensitiveScriptInput({ config: { tenantToken: 'opaque-value' } })).toBe(true);
    expect(
      containsSensitiveScriptInput({ config: { customHeaders: { 'X-Access': 'opaque-value' } } }),
    ).toBe(true);
    expect(containsSensitiveScriptInput({ vars: { value: 'sk-test-secret-material' } })).toBe(true);
  });

  it('permits ordinary script inputs', () => {
    expect(
      containsSensitiveScriptInput({
        vars: { name: 'Alice' },
        prompt: { label: 'Hello {{name}}' },
        testIdx: 0,
      }),
    ).toBe(false);
  });
});
