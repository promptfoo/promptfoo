import { HUMAN_ASSERTION_TYPE } from '@promptfoo/providers/constants';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEvalOutputPromptHash,
  buildEvalUrlWithSearchParams,
  getHumanRating,
  getNamedMetricTotal,
  getNamedMetricTotals,
  hasHumanRating,
  hashVarSchema,
  parseEvalOutputPromptHash,
  setEvalDetailsHash,
  useEvalDetailsHash,
} from './utils';
import type { EvaluateTableOutput, PromptMetrics } from '@promptfoo/types';

// Helper to create a base output object with all required properties
const createBaseOutput = (): EvaluateTableOutput => ({
  id: 'test-id',
  text: 'test output',
  prompt: 'test prompt',
  pass: true,
  score: 1,
  cost: 0,
  failureReason: 0,
  latencyMs: 0,
  namedScores: {},
  testCase: {},
});

describe('eval output prompt hashes', () => {
  it('builds a readable one-based hash', () => {
    expect(buildEvalOutputPromptHash(0, 1)).toBe('#details-row-1-prompt-2');
  });

  it('parses hashes back to zero-based indexes', () => {
    expect(parseEvalOutputPromptHash('#details-row-3-prompt-2')).toEqual({
      rowIndex: 2,
      promptIndex: 1,
    });
  });

  it('rejects malformed or zero-valued hashes', () => {
    expect(parseEvalOutputPromptHash('#details-row-0-prompt-1')).toBeNull();
    expect(parseEvalOutputPromptHash('#details-row-1-prompt-0')).toBeNull();
    expect(parseEvalOutputPromptHash('#other-fragment')).toBeNull();
  });
});

describe('buildEvalUrlWithSearchParams', () => {
  it('preserves the current hash while updating search params', () => {
    expect(
      buildEvalUrlWithSearchParams(
        {
          pathname: '/eval/eval-1',
          search: '?view=report',
          hash: '#details-row-51-prompt-1',
        },
        (params) => {
          params.set('search', 'prompt');
        },
      ),
    ).toEqual({
      pathname: '/eval/eval-1',
      search: '?view=report&search=prompt',
      hash: '#details-row-51-prompt-1',
    });
  });

  it('reads the live window hash when source.hash is omitted', () => {
    const previousUrl = window.location.href;
    window.history.replaceState({}, '', '/eval/eval-1?view=report#details-row-9-prompt-1');
    try {
      expect(
        buildEvalUrlWithSearchParams(
          { pathname: '/eval/eval-1', search: '?view=report' },
          (params) => {
            params.set('search', 'prompt');
          },
        ),
      ).toEqual({
        pathname: '/eval/eval-1',
        search: '?view=report&search=prompt',
        hash: '#details-row-9-prompt-1',
      });
    } finally {
      window.history.replaceState({}, '', previousUrl);
    }
  });

  it('honors an explicit empty hash override', () => {
    const previousUrl = window.location.href;
    window.history.replaceState({}, '', '/eval/eval-1#details-row-9-prompt-1');
    try {
      expect(
        buildEvalUrlWithSearchParams({ pathname: '/eval/eval-1', search: '', hash: '' }, () => {}),
      ).toEqual({ pathname: '/eval/eval-1', search: '', hash: '' });
    } finally {
      window.history.replaceState({}, '', previousUrl);
    }
  });
});

describe('eval-details hash store', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('exposes the live window hash via useEvalDetailsHash', () => {
    window.history.replaceState({}, '', '/eval/x#details-row-7-prompt-2');
    const { result } = renderHook(() => useEvalDetailsHash());
    expect(result.current).toBe('#details-row-7-prompt-2');
  });

  it('notifies subscribers when setEvalDetailsHash mutates the URL', () => {
    const { result } = renderHook(() => useEvalDetailsHash());
    expect(result.current).toBe('');

    act(() => {
      setEvalDetailsHash('#details-row-3-prompt-1');
    });

    expect(result.current).toBe('#details-row-3-prompt-1');
    expect(window.location.hash).toBe('#details-row-3-prompt-1');
  });

  it('preserves existing history state when mutating the details hash', () => {
    const state = { from: 'router' };
    window.history.replaceState(state, '', '/eval/x');

    act(() => {
      setEvalDetailsHash('#details-row-4-prompt-2');
    });

    expect(window.history.state).toEqual(state);
    expect(window.location.hash).toBe('#details-row-4-prompt-2');
  });

  it('adds a stable row hint while mutating the details hash', () => {
    window.history.replaceState({}, '', '/eval/x');

    act(() => {
      setEvalDetailsHash('#details-row-51-prompt-2', 50);
    });

    expect(window.location.search).toBe('?rowId=51');
    expect(window.location.hash).toBe('#details-row-51-prompt-2');
  });

  it('clears the stale row hint when removing the details hash', () => {
    window.history.replaceState({}, '', '/eval/x?rowId=51#details-row-51-prompt-2');

    act(() => {
      setEvalDetailsHash('');
    });

    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('coordinates updates across multiple subscribers', () => {
    const { result: a } = renderHook(() => useEvalDetailsHash());
    const { result: b } = renderHook(() => useEvalDetailsHash());

    act(() => {
      setEvalDetailsHash('#details-row-2-prompt-3');
    });

    expect(a.current).toBe('#details-row-2-prompt-3');
    expect(b.current).toBe('#details-row-2-prompt-3');

    act(() => {
      setEvalDetailsHash('');
    });

    expect(a.current).toBe('');
    expect(b.current).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('responds to native hashchange events', () => {
    const { result } = renderHook(() => useEvalDetailsHash());
    act(() => {
      window.history.replaceState({}, '', '/#details-row-5-prompt-2');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('#details-row-5-prompt-2');
  });

  it('prepends a missing leading hash before mutating', () => {
    act(() => {
      setEvalDetailsHash('details-row-1-prompt-1');
    });
    expect(window.location.hash).toBe('#details-row-1-prompt-1');
  });
});

describe('hasHumanRating', () => {
  it('should return true when output has human rating in componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Manual rating',
            assertion: { type: HUMAN_ASSERTION_TYPE },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(true);
  });

  it('should return false when output has no human rating in componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when output is null', () => {
    expect(hasHumanRating(null)).toBe(false);
  });

  it('should return false when output is undefined', () => {
    expect(hasHumanRating(undefined)).toBe(false);
  });

  it('should return false when gradingResult is missing', () => {
    const output = createBaseOutput();
    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when componentResults is missing', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should return false when componentResults is empty', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should handle componentResults with null or undefined assertion properties', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'No assertion',
            assertion: null as any,
          },
          {
            pass: false,
            score: 0,
            reason: 'Undefined assertion',
          } as any,
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(false);
  });

  it('should find human rating among multiple componentResults', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
          {
            pass: true,
            score: 1,
            reason: 'Manual rating',
            assertion: { type: HUMAN_ASSERTION_TYPE },
          },
          {
            pass: true,
            score: 1,
            reason: 'Another check',
            assertion: { type: 'python' },
          },
        ],
      },
    };

    expect(hasHumanRating(output)).toBe(true);
  });
});

describe('getHumanRating', () => {
  it('should return human rating componentResult when present', () => {
    const humanResult = {
      pass: true,
      score: 0.9,
      reason: 'Manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [humanResult],
      },
    };

    expect(getHumanRating(output)).toEqual(humanResult);
  });

  it('should return undefined when no human rating exists', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated check',
            assertion: { type: 'javascript' },
          },
        ],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when output is null', () => {
    expect(getHumanRating(null)).toBeUndefined();
  });

  it('should return undefined when output is undefined', () => {
    expect(getHumanRating(undefined)).toBeUndefined();
  });

  it('should return undefined when gradingResult is missing', () => {
    const output = createBaseOutput();
    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when componentResults is missing', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return undefined when componentResults is empty', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should handle componentResults without assertion property', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'No assertion',
          } as any,
        ],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });

  it('should return first human rating when multiple exist', () => {
    const firstHumanResult = {
      pass: true,
      score: 0.8,
      reason: 'First manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const secondHumanResult = {
      pass: false,
      score: 0.3,
      reason: 'Second manual rating',
      assertion: { type: HUMAN_ASSERTION_TYPE },
    };

    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Automated',
            assertion: { type: 'javascript' },
          },
          firstHumanResult,
          secondHumanResult,
        ],
      },
    };

    expect(getHumanRating(output)).toEqual(firstHumanResult);
  });

  it('should handle componentResults with null elements', () => {
    const output: EvaluateTableOutput = {
      ...createBaseOutput(),
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'Overall rating',
        componentResults: [null as any, undefined as any],
      },
    };

    expect(getHumanRating(output)).toBeUndefined();
  });
});

describe('named metric helpers', () => {
  const baseMetrics: Pick<PromptMetrics, 'namedScoresCount' | 'namedScoreWeights'> = {
    namedScoresCount: { accuracy: 2, safety: 1 },
    namedScoreWeights: { accuracy: 4 },
  };

  it('prefers namedScoreWeights when available', () => {
    expect(getNamedMetricTotal(baseMetrics, 'accuracy')).toBe(4);
  });

  it('falls back to namedScoresCount when weights are absent', () => {
    expect(getNamedMetricTotal(baseMetrics, 'safety')).toBe(1);
  });

  it('returns 0 for missing metrics', () => {
    expect(getNamedMetricTotal(baseMetrics, 'missing')).toBe(0);
  });

  it('merges sparse namedScoreWeights over namedScoresCount', () => {
    expect(getNamedMetricTotals(baseMetrics)).toEqual({
      accuracy: 4,
      safety: 1,
    });
    expect(
      getNamedMetricTotals({
        namedScoresCount: { relevance: 3 },
      } as Pick<PromptMetrics, 'namedScoresCount' | 'namedScoreWeights'>),
    ).toEqual({ relevance: 3 });
  });

  it('returns undefined when no totals are available', () => {
    expect(
      getNamedMetricTotals({} as Pick<PromptMetrics, 'namedScoresCount' | 'namedScoreWeights'>),
    ).toBeUndefined();
  });
});

describe('hashVarSchema', () => {
  it('should return consistent hash for same variables in same order', () => {
    const vars = ['question', 'answer', 'context'];
    expect(hashVarSchema(vars)).toBe(hashVarSchema(vars));
  });

  it('should return same hash regardless of input order', () => {
    const vars1 = ['question', 'answer', 'context'];
    const vars2 = ['context', 'question', 'answer'];
    const vars3 = ['answer', 'context', 'question'];

    expect(hashVarSchema(vars1)).toBe(hashVarSchema(vars2));
    expect(hashVarSchema(vars2)).toBe(hashVarSchema(vars3));
  });

  it('should return different hash for different variables', () => {
    const vars1 = ['question', 'answer'];
    const vars2 = ['input', 'output'];

    expect(hashVarSchema(vars1)).not.toBe(hashVarSchema(vars2));
  });

  it('should handle empty array', () => {
    expect(hashVarSchema([])).toBe('[]');
  });

  it('should handle single variable', () => {
    expect(hashVarSchema(['query'])).toBe('["query"]');
  });

  it('should handle variables with special characters', () => {
    const vars1 = ['var|with|pipes', 'var\x00with\x00nulls'];
    const vars2 = ['var\x00with\x00nulls', 'var|with|pipes'];

    // Should produce same hash regardless of order
    expect(hashVarSchema(vars1)).toBe(hashVarSchema(vars2));
  });

  it('should handle variables with unicode characters', () => {
    const vars = ['变量', 'переменная', '変数'];
    expect(hashVarSchema(vars)).toBe(hashVarSchema([...vars].reverse()));
  });

  it('should not mutate input array', () => {
    const vars = ['c', 'a', 'b'];
    const original = [...vars];
    hashVarSchema(vars);
    expect(vars).toEqual(original);
  });

  it('should distinguish between similar variable names', () => {
    // These could collide with naive delimiter-based approaches
    const vars1 = ['a', 'b'];
    const vars2 = ['a,b'];

    expect(hashVarSchema(vars1)).not.toBe(hashVarSchema(vars2));
  });
});
