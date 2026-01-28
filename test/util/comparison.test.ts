import * as path from 'path';

import { describe, expect, it } from 'vitest';
import {
  deduplicateTestCases,
  filterRuntimeVars,
  getTestCaseDeduplicationKey,
  isRuntimeVar,
  resultIsForTestCase,
  varsMatch,
} from '../../src/util/comparison';

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

  it('matches when test has provider but result provider is null', async () => {
    // This covers agentic providers (like agentic:memory-poisoning) where
    // the result's provider is null/undefined (e.g., from cloud results)
    const testCaseWithProvider: TestCase = {
      provider: 'agentic:memory-poisoning',
      vars: { key: 'value' },
    };

    const resultWithNullProvider = {
      provider: null,
      vars: { key: 'value' },
    } as any as EvaluateResult;

    // Should match because we can't compare when result provider is missing
    expect(resultIsForTestCase(resultWithNullProvider, testCaseWithProvider)).toBe(true);
  });

  it('matches when test has provider but result provider is undefined', async () => {
    const testCaseWithProvider: TestCase = {
      provider: 'agentic:memory-poisoning',
      vars: { key: 'value' },
    };

    const resultWithUndefinedProvider = {
      provider: undefined,
      vars: { key: 'value' },
    } as any as EvaluateResult;

    expect(resultIsForTestCase(resultWithUndefinedProvider, testCaseWithProvider)).toBe(true);
  });

  it('matches when test has no provider and result has provider', async () => {
    const testCaseNoProvider: TestCase = {
      vars: { key: 'value' },
    };

    const resultWithProvider = {
      provider: { id: 'some-provider' },
      vars: { key: 'value' },
    } as any as EvaluateResult;

    expect(resultIsForTestCase(resultWithProvider, testCaseNoProvider)).toBe(true);
  });

  it('does not match when agentic provider differs from result target provider (both present)', async () => {
    // This documents intentional strict behavior: when BOTH providers are present,
    // they must match. Agentic providers (like agentic:memory-poisoning) that differ
    // from the target provider in the result should NOT match.
    // Lenient matching only applies when one side is missing provider info.
    const testCaseWithAgenticProvider: TestCase = {
      provider: 'agentic:memory-poisoning',
      vars: { key: 'value' },
    };

    const resultWithTargetProvider = {
      provider: { id: 'openai:gpt-4' },
      vars: { key: 'value' },
    } as any as EvaluateResult;

    // Both providers present and different → no match (strict comparison)
    expect(resultIsForTestCase(resultWithTargetProvider, testCaseWithAgenticProvider)).toBe(false);
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

describe('isRuntimeVar', () => {
  it('should return true for underscore-prefixed variables', () => {
    expect(isRuntimeVar('_conversation')).toBe(true);
    expect(isRuntimeVar('_metadata')).toBe(true);
    expect(isRuntimeVar('_internal')).toBe(true);
    expect(isRuntimeVar('_')).toBe(true);
  });

  it('should return true for explicit runtime vars like sessionId', () => {
    expect(isRuntimeVar('sessionId')).toBe(true);
  });

  it('should return false for regular variables', () => {
    expect(isRuntimeVar('prompt')).toBe(false);
    expect(isRuntimeVar('input')).toBe(false);
    expect(isRuntimeVar('context')).toBe(false);
    expect(isRuntimeVar('goal')).toBe(false);
  });

  it('should return false for variables that contain underscore but do not start with it', () => {
    expect(isRuntimeVar('my_variable')).toBe(false);
    expect(isRuntimeVar('some_conversation')).toBe(false);
    expect(isRuntimeVar('session_id')).toBe(false);
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

  it('should filter out any underscore-prefixed variables', () => {
    const vars = {
      input: 'hello',
      _conversation: [],
      _metadata: { key: 'value' },
      _internal: 'data',
      _customRuntimeVar: 'test',
    };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
    expect(result).not.toHaveProperty('_conversation');
    expect(result).not.toHaveProperty('_metadata');
    expect(result).not.toHaveProperty('_internal');
    expect(result).not.toHaveProperty('_customRuntimeVar');
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

  it('should preserve variables with underscore in middle of name', () => {
    const vars = {
      my_variable: 'value1',
      some_conversation: 'value2',
      session_id: 'value3',
      _runtime: 'filtered',
    };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({
      my_variable: 'value1',
      some_conversation: 'value2',
      session_id: 'value3',
    });
  });
});

describe('getTestCaseDeduplicationKey', () => {
  it('should generate key from vars and strategyId', () => {
    const testCase: TestCase = {
      vars: { prompt: 'hello' },
      metadata: { strategyId: 'jailbreak' },
    };
    const key = getTestCaseDeduplicationKey(testCase);
    expect(JSON.parse(key)).toEqual({
      vars: { prompt: 'hello' },
      strategyId: 'jailbreak',
    });
  });

  it('should use "none" for tests without strategyId', () => {
    const testCase: TestCase = {
      vars: { prompt: 'hello' },
    };
    const key = getTestCaseDeduplicationKey(testCase);
    expect(JSON.parse(key)).toEqual({
      vars: { prompt: 'hello' },
      strategyId: 'none',
    });
  });

  it('should filter out runtime vars from key', () => {
    const testCase: TestCase = {
      vars: { prompt: 'hello', _conversation: [], sessionId: 'abc' },
      metadata: { strategyId: 'basic' },
    };
    const key = getTestCaseDeduplicationKey(testCase);
    expect(JSON.parse(key)).toEqual({
      vars: { prompt: 'hello' },
      strategyId: 'basic',
    });
  });

  it('should handle undefined vars', () => {
    const testCase: TestCase = {
      metadata: { strategyId: 'test' },
    };
    const key = getTestCaseDeduplicationKey(testCase);
    expect(JSON.parse(key)).toEqual({
      vars: undefined,
      strategyId: 'test',
    });
  });
});

describe('deduplicateTestCases', () => {
  it('should remove duplicate tests with same vars and strategyId', () => {
    const tests: TestCase[] = [
      { vars: { prompt: 'hello' }, metadata: { strategyId: 'basic' } },
      { vars: { prompt: 'hello' }, metadata: { strategyId: 'basic' } },
      { vars: { prompt: 'world' }, metadata: { strategyId: 'basic' } },
    ];
    const result = deduplicateTestCases(tests);
    expect(result).toHaveLength(2);
    expect(result[0].vars).toEqual({ prompt: 'hello' });
    expect(result[1].vars).toEqual({ prompt: 'world' });
  });

  it('should keep tests with same vars but different strategyId', () => {
    const tests: TestCase[] = [
      { vars: { prompt: 'hello' }, metadata: { strategyId: 'basic' } },
      { vars: { prompt: 'hello' }, metadata: { strategyId: 'jailbreak' } },
    ];
    const result = deduplicateTestCases(tests);
    expect(result).toHaveLength(2);
  });

  it('should filter runtime vars when checking for duplicates', () => {
    const tests: TestCase[] = [
      { vars: { prompt: 'hello', sessionId: 'abc' }, metadata: { strategyId: 'basic' } },
      { vars: { prompt: 'hello', sessionId: 'xyz' }, metadata: { strategyId: 'basic' } },
    ];
    const result = deduplicateTestCases(tests);
    // These should be considered duplicates after filtering sessionId
    expect(result).toHaveLength(1);
  });

  it('should handle empty array', () => {
    expect(deduplicateTestCases([])).toEqual([]);
  });

  it('should preserve order (keep first occurrence)', () => {
    const tests: TestCase[] = [
      { vars: { prompt: 'first' }, metadata: { strategyId: 'basic', order: 1 } },
      { vars: { prompt: 'first' }, metadata: { strategyId: 'basic', order: 2 } },
    ];
    const result = deduplicateTestCases(tests);
    expect(result).toHaveLength(1);
    expect(result[0].metadata?.order).toBe(1);
  });
});
