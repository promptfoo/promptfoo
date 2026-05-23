import { describe, expect, it } from 'vitest';
import {
  getAssertionValueError,
  getFirstRunnableAssertionValueError,
  getRunnableAssertionValueError,
} from './assertionValueValidation';
import type { Assertion } from '@promptfoo/types';

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

    it('accepts numeric 0 as a contains value', () => {
      expect(getRunnableAssertionValueError(make({ type: 'contains', value: 0 }))).toBeUndefined();
      expect(getRunnableAssertionValueError(make({ type: 'icontains', value: 0 }))).toBeUndefined();
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

  it('rejects trajectory:step-count without min or max', () => {
    expect(
      getRunnableAssertionValueError(make({ type: 'trajectory:step-count', value: {} as any })),
    ).toMatch(/minimum or maximum/);
    expect(
      getRunnableAssertionValueError(
        make({ type: 'trajectory:step-count', value: { min: 1 } as any }),
      ),
    ).toBeUndefined();
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
