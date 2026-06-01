import { BaseAssertionTypesSchema } from '@promptfoo/types';
import { describe, expect, it } from 'vitest';
import {
  getAssertionValueError,
  getFirstRunnableAssertionValueError,
  getRunnableAssertionValueError,
} from './assertionValueValidation';
import type { Assertion } from '@promptfoo/types';

const UNSUPPORTED_TYPE_MESSAGE = 'Select a supported assertion type before running.';

const make = (overrides: Partial<Assertion>): Assertion =>
  ({ type: 'contains', value: '', ...overrides }) as Assertion;

describe('getRunnableAssertionValueError', () => {
  describe('required text/number assertions', () => {
    it('rejects an empty contains value', () => {
      expect(getRunnableAssertionValueError(make({ type: 'contains', value: '' }))).toMatch(
        /Enter an expected value/,
      );
      expect(getRunnableAssertionValueError(make({ type: 'icontains', value: '   ' }))).toMatch(
        /Enter an expected value/,
      );
    });

    it('rejects numeric 0 because runtime treats it as an absent contains value', () => {
      expect(getRunnableAssertionValueError(make({ type: 'contains', value: 0 }))).toMatch(
        /Enter an expected value/,
      );
      expect(getRunnableAssertionValueError(make({ type: 'icontains', value: 0 }))).toMatch(
        /Enter an expected value/,
      );
    });

    it('accepts non-blank strings and finite numbers', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'contains', value: 'hi' })),
      ).toBeUndefined();
      expect(getRunnableAssertionValueError(make({ type: 'equals', value: 42 }))).toBeUndefined();
    });
  });

  describe('array value assertions', () => {
    it('rejects empty arrays for contains-any', () => {
      expect(getRunnableAssertionValueError(make({ type: 'contains-any', value: [] }))).toMatch(
        /comma-separated/,
      );
    });

    it('rejects arrays of blank strings', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'contains-all', value: ['', '  '] })),
      ).toMatch(/comma-separated/);
    });

    it('accepts non-blank string arrays', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'contains-any', value: ['a', 'b'] })),
      ).toBeUndefined();
    });

    it('accepts runtime comma-separated strings for contains-any/all variants', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'contains-any', value: 'a, b' })),
      ).toBeUndefined();
      expect(
        getRunnableAssertionValueError(make({ type: 'not-icontains-all', value: 'a, b' })),
      ).toBeUndefined();
    });
  });

  describe('regex assertions', () => {
    it('requires a pattern', () => {
      expect(getRunnableAssertionValueError(make({ type: 'regex', value: '' }))).toBeDefined();
    });

    it('accepts a valid regex', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'regex', value: '^hi$' })),
      ).toBeUndefined();
    });
  });

  describe('word-count', () => {
    it('rejects negative limits', () => {
      const err = getRunnableAssertionValueError(
        make({ type: 'word-count', value: { min: -1, max: 5 } as any }),
      );
      expect(err).toBeDefined();
    });

    it('rejects min > max', () => {
      const err = getRunnableAssertionValueError(
        make({ type: 'word-count', value: { min: 10, max: 5 } as any }),
      );
      expect(err).toBeDefined();
    });

    it('accepts min === max and ascending ranges', () => {
      expect(
        getRunnableAssertionValueError(
          make({ type: 'word-count', value: { min: 5, max: 5 } as any }),
        ),
      ).toBeUndefined();
      expect(
        getRunnableAssertionValueError(
          make({ type: 'word-count', value: { min: 1, max: 10 } as any }),
        ),
      ).toBeUndefined();
    });
  });

  describe('thresholds', () => {
    it('rejects out-of-range thresholds for score-style assertions', () => {
      expect(
        getRunnableAssertionValueError(
          make({ type: 'similar', value: 'expected', threshold: -0.1 as any }),
        ),
      ).toBeDefined();
      expect(
        getRunnableAssertionValueError(
          make({ type: 'similar', value: 'expected', threshold: 1.5 as any }),
        ),
      ).toBeDefined();
    });

    it('accepts a threshold within [0, 1]', () => {
      expect(
        getRunnableAssertionValueError(
          make({ type: 'similar', value: 'expected', threshold: 0.5 as any }),
        ),
      ).toBeUndefined();
    });
  });

  describe('LLM-graded assertions', () => {
    it('requires criteria for select-best', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'select-best', value: '' })),
      ).toBeDefined();
      expect(
        getRunnableAssertionValueError(make({ type: 'select-best', value: 'pick clearest' })),
      ).toBeUndefined();
    });

    it('requires criteria for g-eval', () => {
      expect(getRunnableAssertionValueError(make({ type: 'g-eval', value: '' }))).toBeDefined();
      expect(
        getRunnableAssertionValueError(make({ type: 'g-eval', value: 'is helpful' })),
      ).toBeUndefined();
    });
  });

  describe('optional / no-value assertions', () => {
    it('does not require a value for is-json', () => {
      expect(getRunnableAssertionValueError(make({ type: 'is-json', value: '' }))).toBeUndefined();
      expect(
        getRunnableAssertionValueError(make({ type: 'is-json', value: undefined as any })),
      ).toBeUndefined();
    });

    it('does not require a value for max-score', () => {
      expect(
        getRunnableAssertionValueError(make({ type: 'max-score', value: undefined as any })),
      ).toBeUndefined();
    });
  });
});

describe('getAssertionValueError', () => {
  it('aliases getRunnableAssertionValueError', () => {
    const a = make({ type: 'contains', value: '' });
    expect(getAssertionValueError(a)).toBe(getRunnableAssertionValueError(a));
  });
});

describe('structured value assertions', () => {
  it('rejects optional SQL config that is not an object', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'is-sql', value: 'not-json' as any })),
    ).toMatch(/JSON object/);
    expect(
      getRunnableAssertionValueError(make({ type: 'is-sql', value: { dialect: 'pg' } as any })),
    ).toBeUndefined();
  });

  it('rejects trajectory:tool-args-match without a tool name or args', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-args-match', value: 'plain' as any }),
      ),
    ).toMatch(/tool name or pattern/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-args-match', value: { name: 'find' } as any }),
      ),
    ).toMatch(/expected args/);
    expect(
      getRunnableAssertionValueError(
        make({
          type: 'trajectory:tool-args-match',
          value: { name: 'find', args: { q: 'x' } } as any,
        }),
      ),
    ).toBeUndefined();
  });

  it('rejects unsupported trajectory:tool-args-match modes', () => {
    expect(
      getRunnableAssertionValueError(
        make({
          type: 'trajectory:tool-args-match',
          value: { name: 'find', args: { q: 'x' }, mode: 'contains' } as any,
        }),
      ),
    ).toMatch(/partial.*exact/);
  });

  it('rejects trajectory:step-count without min or max', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:step-count', value: {} as any })),
    ).toMatch(/minimum or maximum/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:step-count', value: { min: 1 } as any }),
      ),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:step-count', value: { min: -1 } as any }),
      ),
    ).toMatch(/whole numbers/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:step-count', value: { min: 2, max: 1 } as any }),
      ),
    ).toMatch(/Maximum trajectory step count/);
  });

  it('rejects an empty trajectory:tool-sequence', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:tool-sequence', value: [] as any })),
    ).toMatch(/non-empty/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-sequence', value: ['toolA'] as any }),
      ),
    ).toBeUndefined();
  });

  it('rejects trajectory:tool-sequence object steps without a name or pattern', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-sequence', value: [{ args: { q: 'x' } }] as any }),
      ),
    ).toMatch(/name or pattern/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-sequence', value: { steps: [{ pattern: 'search.*' }] } }),
      ),
    ).toBeUndefined();
  });

  it('validates tokens-used budgets', () => {
    expect(getRunnableAssertionValueError(make({ type: 'tokens-used', value: {} as any }))).toMatch(
      /minimum or maximum token budget/,
    );
    expect(
      getRunnableAssertionValueError(
        make({ type: 'tokens-used', value: { min: 10, max: 5 } as any }),
      ),
    ).toMatch(/Minimum token usage/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'tokens-used', value: { max: 100, source: 'response' } as any }),
      ),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'tokens-used', value: { max: 100, pattern: '  ' } as any }),
      ),
    ).toMatch(/non-empty text/);
  });

  it('validates trajectory:tool-set matcher lists and modes', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:tool-set', value: [] as any })),
    ).toMatch(/non-empty JSON tool set/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-set', value: { tools: ['find'], mode: 'ordered' } as any }),
      ),
    ).toMatch(/subset.*exact/);
    expect(
      getRunnableAssertionValueError(
        make({
          type: 'trajectory:tool-set',
          value: { tools: ['find', { pattern: 'fetch.*' }], mode: 'exact' } as any,
        }),
      ),
    ).toBeUndefined();
  });

  it('validates trace span assertion value shapes', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trace-span-count', value: { max: 2 } as any })),
    ).toMatch(/span name pattern/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-count', value: { pattern: 'fetch*', min: 1 } as any }),
      ),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-duration', value: { pattern: 'fetch*' } as any }),
      ),
    ).toMatch(/maximum trace span duration/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-duration', value: { pattern: 'fetch*', max: 250 } as any }),
      ),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-count', value: { pattern: 'fetch*', min: -1 } as any }),
      ),
    ).toMatch(/whole numbers/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-count', value: { pattern: 'fetch*' } as any }),
      ),
    ).toMatch(/minimum or maximum/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-duration', value: { max: -1 } as any }),
      ),
    ).toMatch(/maximum trace span duration/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-duration', value: { max: 250, pattern: '  ' } as any }),
      ),
    ).toMatch(/non-empty text/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trace-span-duration', value: { max: 250, requirePresence: 'yes' } as any }),
      ),
    ).toMatch(/true or false/);
    expect(
      getRunnableAssertionValueError(
        make({
          type: 'trace-span-duration',
          value: { max: 250, percentile: 95, method: 'approximate' },
        } as any),
      ),
    ).toMatch(/nearest.*linear/);
  });
});

describe('required string assertions', () => {
  it('points the user at the right field for select-best, webhook, finish-reason, and friends', () => {
    expect(getRunnableAssertionValueError(make({ type: 'select-best', value: '' }))).toMatch(
      /criteria for selecting/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'webhook', value: '' }))).toMatch(
      /webhook URL/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'finish-reason', value: '' }))).toMatch(
      /finish reason/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'factuality', value: '' }))).toMatch(
      /factual reference/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'context-recall', value: '' }))).toMatch(
      /ground truth/,
    );
    expect(
      getRunnableAssertionValueError(make({ type: 'model-graded-closedqa', value: '' })),
    ).toMatch(/criterion the response/);
    expect(getRunnableAssertionValueError(make({ type: 'pi', value: '' }))).toMatch(
      /criteria for Pi Labs/,
    );
  });

  it('requires values for script and specialized model-graded assertions', () => {
    expect(getRunnableAssertionValueError(make({ type: 'javascript', value: '' }))).toMatch(
      /expected value/,
    );
    expect(
      getRunnableAssertionValueError(make({ type: 'model-graded-factuality', value: '' })),
    ).toMatch(/expected value/);
    expect(getRunnableAssertionValueError(make({ type: 'search-rubric', value: '' }))).toMatch(
      /expected value/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'tool-call-f1', value: '' }))).toMatch(
      /reference answer/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'gleu', value: '' }))).toMatch(
      /reference answer/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'meteor', value: '' }))).toMatch(
      /reference answer/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'levenshtein', value: '' }))).toMatch(
      /expected value/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'not-levenshtein', value: '' }))).toMatch(
      /expected value/,
    );
  });
});

describe('skill-used object values', () => {
  it('requires finite non-negative integer count limits', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'skill-used', value: { name: 'search', min: '2' } as any }),
      ),
    ).toMatch(/whole numbers/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'skill-used', value: { name: 'search', min: 3, max: 2 } as any }),
      ),
    ).toMatch(/Maximum skill count/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'skill-used', value: { name: 'search', min: 1, max: 2 } as any }),
      ),
    ).toBeUndefined();
  });

  it('limits inverse object assertions to the runtime-supported maximum of zero', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'not-skill-used', value: { pattern: 'web.*', min: 0 } as any }),
      ),
    ).toMatch(/Forbidden skill checks/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'not-skill-used', value: { pattern: 'web.*', max: 0 } as any }),
      ),
    ).toBeUndefined();
  });
});

describe('trajectory object values', () => {
  it('requires finite non-negative integer trajectory tool count limits', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-used', value: { name: 'search', min: 1.5 } as any }),
      ),
    ).toMatch(/whole numbers/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-used', value: { name: 'search', min: 2, max: 1 } as any }),
      ),
    ).toMatch(/Maximum trajectory tool count/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-used', value: { name: 'search', min: 1, max: 2 } as any }),
      ),
    ).toBeUndefined();
  });

  it('requires positive trajectory goal timeouts', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:goal-success', value: { goal: 'find answer', timeoutMs: 0 } }),
      ),
    ).toMatch(/positive trajectory goal timeout/);
    expect(
      getRunnableAssertionValueError(
        make({
          type: 'trajectory:goal-success',
          value: { goal: 'find answer', timeoutMs: 1_000 },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('moderation', () => {
  it('rejects non-string-array values', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'moderation', value: [1, 2, 3] as any })),
    ).toMatch(/comma-separated list/);
  });

  it('accepts an undefined value (all categories)', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'moderation', value: undefined as any })),
    ).toBeUndefined();
  });

  it('accepts a blank value as the runtime default categories', () => {
    expect(getRunnableAssertionValueError(make({ type: 'moderation', value: '' }))).toBeUndefined();
    expect(
      getRunnableAssertionValueError(make({ type: 'not-moderation', value: '   ' })),
    ).toBeUndefined();
  });

  it('rejects an empty array, which is truthy and crashes the runtime invariant', () => {
    expect(getRunnableAssertionValueError(make({ type: 'moderation', value: [] as any }))).toMatch(
      /comma-separated list/,
    );
    expect(
      getRunnableAssertionValueError(make({ type: 'not-moderation', value: [] as any })),
    ).toMatch(/comma-separated list/);
  });

  it('accepts a non-empty string array of categories', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'moderation', value: ['harassment'] as any })),
    ).toBeUndefined();
  });
});

describe('named matcher assertions', () => {
  it('requires an expected traced tool name for trajectory:tool-used', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:tool-used', value: '' })),
    ).toMatch(/traced tool name/);
    expect(
      getRunnableAssertionValueError(make({ type: 'not-trajectory:tool-used', value: '' })),
    ).toMatch(/traced tool name/);
  });

  it('accepts a tool name, a string array, or a name/pattern object', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:tool-used', value: 'search' })),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-used', value: ['search'] as any }),
      ),
    ).toBeUndefined();
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:tool-used', value: { name: 'search' } as any }),
      ),
    ).toBeUndefined();
  });

  it('uses the skill wording for skill-used', () => {
    expect(getRunnableAssertionValueError(make({ type: 'skill-used', value: '' }))).toMatch(
      /skill name/,
    );
  });
});

describe('perplexity-score threshold', () => {
  it('rejects thresholds outside [0,1]', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'perplexity-score', threshold: 1.5 as any } as any),
      ),
    ).toMatch(/normalized score threshold/);
  });

  it('accepts thresholds inside [0,1]', () => {
    expect(
      getRunnableAssertionValueError(
        make({ type: 'perplexity-score', threshold: 0.42 as any } as any),
      ),
    ).toBeUndefined();
  });
});

describe('cost / latency thresholds', () => {
  it('requires a non-negative cost threshold', () => {
    expect(getRunnableAssertionValueError(make({ type: 'cost' } as any))).toMatch(/maximum cost/);
    expect(
      getRunnableAssertionValueError(make({ type: 'cost', threshold: -1 as any } as any)),
    ).toMatch(/maximum cost/);
    expect(
      getRunnableAssertionValueError(make({ type: 'cost', threshold: 0.01 as any } as any)),
    ).toBeUndefined();
  });

  it('requires a non-negative latency threshold', () => {
    expect(getRunnableAssertionValueError(make({ type: 'latency' } as any))).toMatch(
      /maximum latency/,
    );
    expect(
      getRunnableAssertionValueError(make({ type: 'latency', threshold: 500 as any } as any)),
    ).toBeUndefined();
  });
});

describe('getFirstRunnableAssertionValueError', () => {
  it('returns undefined for an empty list', () => {
    expect(getFirstRunnableAssertionValueError([])).toBeUndefined();
    expect(getFirstRunnableAssertionValueError(undefined)).toBeUndefined();
  });

  it('flags entries that are not real assertion objects', () => {
    expect(getFirstRunnableAssertionValueError([null, undefined])).toMatch(/valid assertion type/);
    expect(getFirstRunnableAssertionValueError([{}])).toMatch(/valid assertion type/);
  });

  it('rejects unsupported assertion type names before running', () => {
    expect(getFirstRunnableAssertionValueError([{ type: 'containz', value: 'hello' }])).toMatch(
      /supported assertion type/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'containz' as any }))).toMatch(
      /supported assertion type/,
    );
    expect(getRunnableAssertionValueError(make({ type: 'human' as any }))).toMatch(
      /supported assertion type/,
    );
  });

  it('returns the first error it sees', () => {
    const list = [
      { type: 'contains', value: 'hi' },
      { type: 'icontains', value: '' },
    ];
    expect(getFirstRunnableAssertionValueError(list)).toMatch(/Enter an expected value/);
  });

  it('recurses into assert-set entries', () => {
    const list = [
      {
        type: 'assert-set',
        assert: [{ type: 'contains', value: '' }],
      },
    ];
    expect(getFirstRunnableAssertionValueError(list)).toMatch(/Enter an expected value/);
  });

  it('rejects an assert-set whose assert is not an array', () => {
    expect(getFirstRunnableAssertionValueError([{ type: 'assert-set' }])).toMatch(
      /valid assertion type/,
    );
  });

  it('returns undefined when every assertion is valid', () => {
    const list = [
      { type: 'contains', value: 'a' },
      {
        type: 'assert-set',
        assert: [{ type: 'icontains', value: 'b' }],
      },
    ];
    expect(getFirstRunnableAssertionValueError(list)).toBeUndefined();
  });
});

describe('supported assertion type coverage', () => {
  // Guards against drift: `BASE_ASSERTION_TYPES` is a hand-maintained copy of the
  // canonical schema, and `satisfies AssertionType[]` only checks the listed entries
  // are valid — not that the list is complete. A base type added to the schema but
  // not mirrored here would be wrongly reported as unsupported, falsely blocking a
  // valid assertion. This test fails if that ever happens.
  it.each(BaseAssertionTypesSchema.options)('treats base type %s as supported', (type) => {
    expect(getRunnableAssertionValueError(make({ type: type as any, value: 'x' }))).not.toBe(
      UNSUPPORTED_TYPE_MESSAGE,
    );
    expect(
      getRunnableAssertionValueError(make({ type: `not-${type}` as any, value: 'x' })),
    ).not.toBe(UNSUPPORTED_TYPE_MESSAGE);
  });
});
