import { validateAssertions, AssertValidationError } from '../../src/assertions/validateAssertions';
import type { TestCase } from '../../src/types';

describe('validateAssertions', () => {
  const test: TestCase = {
    description: 'The test case',
  };

  describe('asssert-set', () => {
    function testCaseWithAssertSet(assertSet: object) {
      return {
        ...test,
        assert: [{ type: 'assert-set', ...assertSet } as any],
      };
    }

    it('does not fail on valid assert-set', () => {
      const test = testCaseWithAssertSet({
        assert: [
          {
            type: 'equals',
            value: 'Expected output',
          },
        ],
      });

      expect(() => validateAssertions([test])).not.toThrow();
    });

    it('has assert', () => {
      const test = testCaseWithAssertSet({});

      expect(() => validateAssertions([test])).toThrow(
        new AssertValidationError('assert-set must have an `assert` property', test),
      );
    });

    it('has assert as an array', () => {
      const test = testCaseWithAssertSet({ assert: {} });

      expect(() => validateAssertions([test])).toThrow(
        new AssertValidationError('assert-set `assert` must be an array of assertions', test),
      );
    });

    it('does not have child assert-sets', () => {
      const test = testCaseWithAssertSet({ assert: [{ type: 'assert-set' }] });

      expect(() => validateAssertions([test])).toThrow(
        new AssertValidationError('assert-set must not have child assert-sets', test),
      );
    });
  });
});
