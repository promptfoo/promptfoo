import { AssertValidationError, validateAssertions } from '../../src/assertions/validateAssertions';

import type { TestCase } from '../../src/types/index';
import { describe, expect, it } from 'vitest';

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
});
