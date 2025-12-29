import * as path from 'path';

import { describe, expect, it } from 'vitest';
import { filterRuntimeVars, resultIsForTestCase, varsMatch } from '../../src/util/comparison';

import type { EvaluateResult, TestCase } from '../../src/types/index';

describe('varsMatch', () => {
  it('true with both undefined', () => {
    expect(varsMatch(undefined, undefined)).toBe(true);
  });

  it('false with one undefined', () => {
    expect(varsMatch(undefined, {})).toBe(false);
    expect(varsMatch({}, undefined)).toBe(false);
  });

  it('true with matching non-empty objects', () => {
    expect(varsMatch({ key: 'value' }, { key: 'value' })).toBe(true);
    expect(varsMatch({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('false with different values', () => {
    expect(varsMatch({ key: 'value1' }, { key: 'value2' })).toBe(false);
    expect(varsMatch({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('false with different keys', () => {
    expect(varsMatch({ a: 1 }, { b: 1 })).toBe(false);
  });
});

describe('resultIsForTestCase', () => {
  const testCase: TestCase = {
    provider: 'provider',
    vars: {
      key: 'value',
    },
  };
  const result = {
    provider: 'provider',
    vars: {
      key: 'value',
    },
  } as any as EvaluateResult;

  it('is true', async () => {
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('is false if provider is different', async () => {
    const nonMatchTestCase: TestCase = {
      provider: 'different',
      vars: {
        key: 'value',
      },
    };

    expect(resultIsForTestCase(result, nonMatchTestCase)).toBe(false);
  });

  it('is false if vars are different', async () => {
    const nonMatchTestCase: TestCase = {
      provider: 'provider',
      vars: {
        key: 'different',
      },
    };

    expect(resultIsForTestCase(result, nonMatchTestCase)).toBe(false);
  });

  it('matches when test provider is label and result provider has label and id', async () => {
    const labelledResult = {
      provider: { id: 'file://provider.js', label: 'provider' },
      vars: { key: 'value' },
    } as any as EvaluateResult;

    expect(resultIsForTestCase(labelledResult, testCase)).toBe(true);
  });

  it('matches when test provider is relative path and result provider is absolute', async () => {
    const relativePathTestCase: TestCase = {
      provider: 'file://./provider.js',
      vars: { key: 'value' },
    };

    const absolutePathResult = {
      provider: { id: `file://${path.join(process.cwd(), 'provider.js')}` },
      vars: { key: 'value' },
    } as any as EvaluateResult;

    expect(resultIsForTestCase(absolutePathResult, relativePathTestCase)).toBe(true);
  });

  it('matches when test provider has no file:// prefix and result has absolute path', async () => {
    const noPathTestCase: TestCase = {
      provider: './provider.js',
      vars: { key: 'value' },
    };

    const absolutePathResult = {
      provider: `file://${path.join(process.cwd(), 'provider.js')}`,
      vars: { key: 'value' },
    } as any as EvaluateResult;

    expect(resultIsForTestCase(absolutePathResult, noPathTestCase)).toBe(true);
  });

  it('matches when result.vars has runtime variables like _conversation', async () => {
    // This tests the fix for issue #5849 - cache behavior regression
    // result.vars contains runtime variables that should be filtered out
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        input: 'hello',
        language: 'en',
      },
    };

    const result = {
      provider: 'provider',
      vars: {
        input: 'hello',
        language: 'en',
        _conversation: [], // Runtime variable added during evaluation
      },
      testCase: {
        vars: {
          input: 'hello',
          language: 'en',
        },
      },
    } as any as EvaluateResult;

    // Should match because _conversation is filtered out
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('matches when result.vars has runtime variables and testCase also has them', async () => {
    // Edge case: both have runtime vars (shouldn't happen in practice but should still work)
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        input: 'hello',
        language: 'en',
        _conversation: [],
      },
    };

    const result = {
      provider: 'provider',
      vars: {
        input: 'hello',
        language: 'en',
        _conversation: [],
      },
    } as any as EvaluateResult;

    // Should match because both have same vars after filtering
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('matches when result.vars has sessionId runtime variable from GOAT/Crescendo providers', async () => {
    // This tests the fix for multi-turn strategy providers (GOAT, Crescendo)
    // that add sessionId to vars during execution
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        prompt: 'test prompt',
        goal: 'test goal',
      },
    };

    const result = {
      provider: 'provider',
      vars: {
        prompt: 'test prompt',
        goal: 'test goal',
        sessionId: 'goat-session-abc123', // Added by GOAT provider during evaluation
      },
    } as any as EvaluateResult;

    // Should match because sessionId is filtered out
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('matches when result.vars has both _conversation and sessionId runtime variables', async () => {
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        input: 'hello',
      },
    };

    const result = {
      provider: 'provider',
      vars: {
        input: 'hello',
        _conversation: [{ role: 'user', content: 'hi' }],
        sessionId: 'session-xyz789',
      },
    } as any as EvaluateResult;

    // Should match because both runtime vars are filtered out
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('matches when testCase also has sessionId (both filtered)', async () => {
    // Edge case: if user explicitly sets sessionId in test config, it should still match
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        prompt: 'test',
        sessionId: 'user-defined-session',
      },
    };

    const result = {
      provider: 'provider',
      vars: {
        prompt: 'test',
        sessionId: 'different-runtime-session',
      },
    } as any as EvaluateResult;

    // Should match because sessionId is filtered from both sides
    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });
});

describe('filterRuntimeVars', () => {
  it('should filter out _conversation', () => {
    const vars = { input: 'hello', _conversation: [{ role: 'user', content: 'hi' }] };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
    expect(result).not.toHaveProperty('_conversation');
  });

  it('should filter out sessionId', () => {
    const vars = { input: 'hello', sessionId: 'test-session-123' };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
    expect(result).not.toHaveProperty('sessionId');
  });

  it('should filter out multiple runtime vars', () => {
    const vars = {
      input: 'hello',
      goal: 'test goal',
      _conversation: [],
      sessionId: 'test-session-123',
    };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello', goal: 'test goal' });
    expect(result).not.toHaveProperty('_conversation');
    expect(result).not.toHaveProperty('sessionId');
  });

  it('should handle undefined vars', () => {
    expect(filterRuntimeVars(undefined)).toBeUndefined();
  });

  it('should handle empty vars', () => {
    expect(filterRuntimeVars({})).toEqual({});
  });

  it('should not mutate original vars', () => {
    const vars = { input: 'hello', sessionId: 'test-123', _conversation: [] };
    const original = { ...vars };
    filterRuntimeVars(vars);
    expect(vars).toEqual(original);
  });

  it('should preserve all non-runtime vars', () => {
    const vars = {
      input: 'hello',
      output: 'world',
      context: 'some context',
      nested: { key: 'value' },
      sessionId: 'to-be-removed',
    };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({
      input: 'hello',
      output: 'world',
      context: 'some context',
      nested: { key: 'value' },
    });
  });
});
