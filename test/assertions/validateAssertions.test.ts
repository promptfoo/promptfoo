import { describe, expect, it } from 'vitest';
import { AssertValidationError, validateAssertions } from '../../src/assertions/validateAssertions';

import type { Scenario, TestCase } from '../../src/types/index';

describe('validateAssertions', () => {
  describe('type validation', () => {
    it('throws when assertion is missing type property', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ value: 'file://test.py' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/type/i);
    });

    it('passes through assertions with unknown types (validated later at runtime)', () => {
      // Note: Unknown types are validated at runtime, not at config load time
      // This is because z.custom<RedteamAssertionTypes>() accepts custom plugin types
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'not-a-real-type', value: 'foo' } as any],
        },
      ];

      // This should not throw - unknown types are checked at runtime
      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('includes context in error message', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ value: 'test' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(/tests\[0\]\.assert\[0\]/);
    });

    it('includes hint in error message', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ value: 'test' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(/Hint:/);
    });

    it('includes received value in error message', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ value: 'my-specific-value' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(/my-specific-value/);
    });

    it('validates second test case assertions', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'equals', value: 'valid' }],
        },
        {
          vars: {},
          assert: [{ value: 'missing-type' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(/tests\[1\]\.assert\[0\]/);
    });

    it('validates second assertion in a test case', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'equals', value: 'valid' }, { value: 'missing-type' } as any],
        },
      ];

      expect(() => validateAssertions(tests)).toThrow(/tests\[0\]\.assert\[1\]/);
    });
  });

  describe('defaultTest validation', () => {
    it('validates defaultTest assertions', () => {
      expect(() =>
        validateAssertions([], {
          assert: [{ value: 'test' } as any],
        }),
      ).toThrow(/defaultTest\.assert\[0\]/);
    });

    it('passes with valid defaultTest assertions', () => {
      expect(() =>
        validateAssertions([], {
          assert: [{ type: 'equals', value: 'expected' }],
        }),
      ).not.toThrow();
    });

    it('validates second assertion in defaultTest', () => {
      expect(() =>
        validateAssertions([], {
          assert: [{ type: 'equals', value: 'valid' }, { value: 'missing-type' } as any],
        }),
      ).toThrow(/defaultTest\.assert\[1\]/);
    });
  });

  describe('assert-set validation', () => {
    it('does not fail on valid assert-set', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'assert-set',
              assert: [
                {
                  type: 'equals',
                  value: 'Expected output',
                },
              ],
            },
          ],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('validates assert-set has assert property', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'assert-set' } as any],
        },
      ];

      // Zod will catch missing required 'assert' property
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
    });

    it('validates assert-set assert is an array', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'assert-set', assert: {} } as any],
        },
      ];

      // Zod will catch that 'assert' is not an array
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
    });

    it('validates nested assertions in assert-set have type', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'assert-set',
              assert: [{ value: 'missing-type' } as any],
            },
          ],
        },
      ];

      // Zod validates nested assertions via z.lazy
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
    });

    it('passes with multiple valid nested assertions', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'equals', value: 'expected' },
                { type: 'contains', value: 'substring' },
              ],
            },
          ],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });
  });

  describe('valid assertions', () => {
    it('passes with valid assertions', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            { type: 'equals', value: 'expected' },
            { type: 'contains', value: 'substring' },
            { type: 'python', value: 'return True' },
          ],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('passes with empty assertions array', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('passes with no assertions', () => {
      const tests: TestCase[] = [{ vars: {} }];
      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('passes with empty tests array', () => {
      expect(() => validateAssertions([])).not.toThrow();
    });

    it('passes with undefined defaultTest', () => {
      expect(() => validateAssertions([], undefined)).not.toThrow();
    });

    it('passes with defaultTest that has no assertions', () => {
      expect(() => validateAssertions([], { vars: {} })).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles assertion with only type (no value)', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'is-json' }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles assertion with threshold', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'similar', value: 'expected', threshold: 0.8 }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles assertion with weight', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'equals', value: 'expected', weight: 2 }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles assertion with transform', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'equals', value: 'expected', transform: 'output.toLowerCase()' }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles not- prefixed assertion types', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'not-equals', value: 'unexpected' }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles special assertion types', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'select-best' }, { type: 'human' }],
        },
      ];

      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('handles null value in assertion', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'equals', value: null } as any],
        },
      ];

      // Should pass - null might be a valid value for some assertions
      expect(() => validateAssertions(tests)).not.toThrow();
    });
  });

  describe('input validation (security)', () => {
    it('throws when tests is not an array', () => {
      expect(() => validateAssertions('not an array' as any)).toThrow(AssertValidationError);
      expect(() => validateAssertions('not an array' as any)).toThrow(/tests must be an array/);
    });

    it('throws when tests is an object with length property', () => {
      // Simulates potential prototype pollution or malicious input
      const maliciousInput = { length: 1000000, 0: { vars: {} } };
      expect(() => validateAssertions(maliciousInput as any)).toThrow(AssertValidationError);
      expect(() => validateAssertions(maliciousInput as any)).toThrow(/tests must be an array/);
    });

    it('throws when test.assert is not an array', () => {
      const tests = [{ vars: {}, assert: 'not an array' }] as any;
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/tests\[0\]\.assert must be an array/);
    });

    it('throws when test.assert is an object with length property', () => {
      const tests = [{ vars: {}, assert: { length: 100, 0: { type: 'equals' } } }] as any;
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/tests\[0\]\.assert must be an array/);
    });

    it('throws when defaultTest.assert is not an array', () => {
      expect(() => validateAssertions([], { assert: 'not an array' } as any)).toThrow(
        AssertValidationError,
      );
      expect(() => validateAssertions([], { assert: 'not an array' } as any)).toThrow(
        /defaultTest\.assert must be an array/,
      );
    });

    it('throws when defaultTest.assert is an object with length property', () => {
      const defaultTest = { assert: { length: 100, 0: { type: 'equals' } } } as any;
      expect(() => validateAssertions([], defaultTest)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], defaultTest)).toThrow(
        /defaultTest\.assert must be an array/,
      );
    });
  });

  describe('combinator validation', () => {
    it('passes with valid and combinator', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'and',
              assert: [
                { type: 'equals', value: 'expected' },
                { type: 'contains', value: 'exp' },
              ],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('passes with valid or combinator', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'or',
              assert: [
                { type: 'equals', value: 'a' },
                { type: 'equals', value: 'b' },
              ],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).not.toThrow();
    });

    it('throws when combinator has empty assert array', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [{ type: 'and', assert: [] } as any],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
    });

    it('blocks select-best inside combinator', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'and',
              assert: [{ type: 'select-best' }, { type: 'equals', value: 'x' }],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/select-best cannot be used inside/);
    });

    it('blocks max-score inside combinator', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'or',
              assert: [{ type: 'max-score' }, { type: 'equals', value: 'x' }],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/max-score cannot be used inside/);
    });

    it('blocks combinator inside assert-set', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'assert-set',
              assert: [
                {
                  type: 'and',
                  assert: [{ type: 'equals', value: 'x' }],
                } as any,
              ],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(
        /Combinator assertions.*cannot be nested inside assert-sets/,
      );
    });

    it('blocks select-best inside assert-set within combinator', () => {
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [
            {
              type: 'and',
              assert: [
                {
                  type: 'assert-set',
                  assert: [{ type: 'select-best' }],
                },
              ],
            },
          ],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(
        /select-best cannot be used inside a combinator/,
      );
    });
  });

  describe('depth and count limits', () => {
    it('throws when nesting exceeds maximum depth', () => {
      // Build a deeply nested combinator chain
      let innermost: any = { type: 'equals', value: 'x' };
      for (let i = 0; i < 12; i++) {
        innermost = { type: 'and', assert: [innermost] };
      }
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [innermost],
        },
      ];
      expect(() => validateAssertions(tests)).toThrow(AssertValidationError);
      expect(() => validateAssertions(tests)).toThrow(/nesting depth exceeds maximum/);
    });

    it('passes at exactly the maximum depth', () => {
      // Build a chain at exactly depth 10
      let innermost: any = { type: 'equals', value: 'x' };
      for (let i = 0; i < 10; i++) {
        innermost = { type: 'and', assert: [innermost] };
      }
      const tests: TestCase[] = [
        {
          vars: {},
          assert: [innermost],
        },
      ];
      expect(() => validateAssertions(tests)).not.toThrow();
    });
  });

  describe('scenario assertion validation', () => {
    it('validates scenario config assertions', () => {
      const scenarios: Scenario[] = [
        {
          config: [
            {
              assert: [{ value: 'missing-type' } as any],
            },
          ],
          tests: [],
        },
      ];
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /scenarios\[0\]\.config\[0\]\.assert\[0\]/,
      );
    });

    it('validates scenario test assertions', () => {
      const scenarios: Scenario[] = [
        {
          config: [],
          tests: [
            {
              vars: {},
              assert: [{ value: 'missing-type' } as any],
            },
          ],
        },
      ];
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /scenarios\[0\]\.tests\[0\]\.assert\[0\]/,
      );
    });

    it('blocks select-best inside combinator in scenario', () => {
      const scenarios: Scenario[] = [
        {
          config: [
            {
              assert: [
                {
                  type: 'or',
                  assert: [{ type: 'select-best' }],
                },
              ],
            },
          ],
          tests: [],
        },
      ];
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /select-best cannot be used inside/,
      );
    });

    it('passes with valid scenario assertions', () => {
      const scenarios: Scenario[] = [
        {
          config: [
            {
              assert: [{ type: 'equals', value: 'expected' }],
            },
          ],
          tests: [
            {
              vars: {},
              assert: [{ type: 'contains', value: 'substring' }],
            },
          ],
        },
      ];
      expect(() => validateAssertions([], undefined, scenarios)).not.toThrow();
    });

    it('validates scenario config assert is an array', () => {
      const scenarios: Scenario[] = [
        {
          config: [
            {
              assert: 'not an array' as any,
            },
          ],
          tests: [],
        },
      ];
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /scenarios\[0\]\.config\[0\]\.assert must be an array/,
      );
    });

    it('throws when scenarios is not an array', () => {
      expect(() => validateAssertions([], undefined, 'not an array' as any)).toThrow(
        AssertValidationError,
      );
      expect(() => validateAssertions([], undefined, 'not an array' as any)).toThrow(
        /scenarios must be an array/,
      );
    });

    it('throws when scenario.config is not an array', () => {
      const scenarios = [{ config: 'not an array', tests: [] }] as any;
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /scenarios\[0\]\.config must be an array/,
      );
    });

    it('throws when scenario.tests is not an array', () => {
      const scenarios = [{ config: [], tests: 'not an array' }] as any;
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(AssertValidationError);
      expect(() => validateAssertions([], undefined, scenarios)).toThrow(
        /scenarios\[0\]\.tests must be an array/,
      );
    });

    it('throws when scenario entry is not an object', () => {
      expect(() => validateAssertions([], undefined, ['not an object'] as any)).toThrow(
        AssertValidationError,
      );
      expect(() => validateAssertions([], undefined, ['not an object'] as any)).toThrow(
        /scenarios\[0\] must be an object/,
      );
    });
  });
});
