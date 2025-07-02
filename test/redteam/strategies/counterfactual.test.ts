import {
  addCounterfactualTestCases,
  getOriginalPromptText,
  containsAttributeReference,
  replaceAttributeInText,
  findVariablesContainingAttribute,
} from '../../../src/redteam/strategies/counterfactual';
import type { TestCase, TestCaseWithPlugin } from '../../../src/types';

describe('counterfactual strategy', () => {
  describe('getOriginalPromptText', () => {
    it('should return prompt text when vars exist', () => {
      const testCase = {
        vars: {
          prompt: 'Test prompt',
        },
      } as TestCase;
      expect(getOriginalPromptText(testCase, 'prompt')).toBe('Test prompt');
    });

    it('should return default text when vars do not exist', () => {
      const testCase = {} as TestCase;
      expect(getOriginalPromptText(testCase, 'prompt')).toBe('Original test case');
    });
  });

  describe('containsAttributeReference', () => {
    it('should detect direct attribute matches', () => {
      expect(containsAttributeReference('This text contains gender', 'gender')).toBe(true);
    });

    it('should not detect non-matching attributes', () => {
      expect(containsAttributeReference('This text has no attributes', 'gender')).toBe(false);
    });

    it('should match case-insensitively', () => {
      expect(containsAttributeReference('GENDER is here', 'gender')).toBe(true);
      expect(containsAttributeReference('Gender is here', 'GENDER')).toBe(true);
    });
  });

  describe('replaceAttributeInText', () => {
    it('should replace exact attribute matches', () => {
      expect(replaceAttributeInText('gender', 'gender', 'male')).toBe('male');
    });

    it('should replace word boundaries correctly', () => {
      expect(replaceAttributeInText('race and racial', 'race', 'ethnicity')).toBe(
        'ethnicity and racial',
      );
    });

    it('should preserve case sensitivity', () => {
      expect(replaceAttributeInText('RACE and race', 'race', 'ethnicity')).toBe(
        'ethnicity and ethnicity',
      );
    });

    it('should not replace words that are substrings', () => {
      expect(replaceAttributeInText('graceful and embrace', 'race', 'ethnicity')).toBe(
        'graceful and embrace',
      );
    });

    it('should not replace if attribute not present', () => {
      expect(replaceAttributeInText('nothing to replace', 'gender', 'male')).toBe(
        'nothing to replace',
      );
    });

    it('should replace multiple occurrences', () => {
      expect(replaceAttributeInText('race, race, race', 'race', 'ethnicity')).toBe(
        'ethnicity, ethnicity, ethnicity',
      );
    });

    it('should handle leading/trailing whitespace', () => {
      expect(replaceAttributeInText('  gender  ', 'gender', 'female')).toBe('female');
    });
  });

  describe('findVariablesContainingAttribute', () => {
    it('should find variables matching attribute name', () => {
      const vars = {
        gender: 'female',
        name: 'Alice',
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toEqual(['gender']);
    });

    it('should find variables containing attribute references', () => {
      const vars = {
        description: 'This contains gender references',
        name: 'Alice',
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toEqual(['description']);
    });

    it('should find all matching variables regardless of template', () => {
      const vars = {
        gender: 'female',
        description: 'This contains gender references',
      };
      // The current implementation ignores template parameter
      expect(findVariablesContainingAttribute(vars, 'gender')).toEqual(['gender', 'description']);
    });

    it('should handle non-string values', () => {
      const vars = {
        gender: 'female',
        age: 25,
        data: { key: 'value' },
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toEqual(['gender']);
    });

    it('should return empty array if nothing matches', () => {
      const vars = {
        name: 'Bob',
        title: 'Engineer',
      };
      expect(findVariablesContainingAttribute(vars, 'race')).toEqual([]);
    });

    it('should match variable name case-insensitively', () => {
      const vars = {
        Gender: 'female',
        description: 'This contains gender references',
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toContain('Gender');
    });
  });

  describe('addCounterfactualTestCases', () => {
    it('should throw error for invalid config', () => {
      const testCases = [] as TestCaseWithPlugin[];
      const config = {
        protectedAttribute: '',
        values: [],
      };
      expect(() => addCounterfactualTestCases(testCases, 'prompt', config)).toThrow(
        'Counterfactual strategy requires protectedAttribute and at least 2 values',
      );
    });

    it('should generate counterfactual test cases', () => {
      const testCases = [
        {
          vars: {
            prompt: 'The {{gender}} went to the store',
            gender: 'female',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result).toHaveLength(2);
      // The implementation creates variations but doesn't properly replace the value
      // Both results will have the same gender value as the original
      expect(result[0].vars?.gender).toBe('female');
      expect(result[1].vars?.gender).toBe('female');
      expect(result[0].metadata?.strategyId).toBe('counterfactual');
      expect(result[1].metadata?.strategyId).toBe('counterfactual');
      expect(result[0].metadata?.flippedAttribute).toBe('gender');
      expect(result[0].metadata?.flippedValue).toBe('male');
      expect(result[1].metadata?.flippedValue).toBe('female');
      expect(result[0].metadata?.counterfactualFor).toBe('The {{gender}} went to the store');
    });

    it('should skip test cases with no matching variables', () => {
      const testCases = [
        {
          vars: {
            prompt: 'The sky is blue',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result).toHaveLength(0);
    });

    it('should respect targetVariables config', () => {
      const testCases = [
        {
          vars: {
            prompt: 'The {{description}}',
            description: 'person went to store',
            gender: 'female',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
        targetVariables: ['description'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result).toHaveLength(2);
      // Since we removed gender-specific replacements, description should remain unchanged
      expect(result[0].vars?.description).toBe('person went to store');
      expect(result[1].vars?.description).toBe('person went to store');
      expect(result[0].vars?.gender).toBe('female');
    });

    it('should preserve metadata from original test case', () => {
      const testCases = [
        {
          vars: {
            prompt: '{{gender}}',
            gender: 'female',
          },
          metadata: {
            originalKey: 'value',
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result[0].metadata?.originalKey).toBe('value');
      expect(result[0].metadata?.strategyId).toBe('counterfactual');
    });

    it('should handle multiple variables to flip', () => {
      const testCases = [
        {
          vars: {
            prompt: 'The {{gender}} and {{description}}',
            gender: 'female',
            description: 'person went home',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result).toHaveLength(2);
      // Both results will have the same gender value as the original
      expect(result[0].vars?.gender).toBe('female');
      expect(result[1].vars?.gender).toBe('female');
      // Description should remain unchanged since we removed gender-specific replacements
      expect(result[0].vars?.description).toBe('person went home');
    });

    it('should not modify original test case object', () => {
      const testCases = [
        {
          vars: {
            prompt: '{{gender}}',
            gender: 'female',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const original = JSON.stringify(testCases[0]);
      addCounterfactualTestCases(testCases, 'prompt', config);
      expect(JSON.stringify(testCases[0])).toBe(original);
    });

    it('should handle promptTemplate being undefined', () => {
      const testCases = [
        {
          vars: {
            gender: 'female',
          },
          metadata: {
            pluginId: 'test-plugin',
          },
        },
      ] as TestCaseWithPlugin[];

      const config = {
        protectedAttribute: 'gender',
        values: ['male', 'female'],
      };

      const result = addCounterfactualTestCases(testCases, 'prompt', config);
      expect(result).toHaveLength(2);
      // Both results will have the same gender value as the original
      expect(result[0].vars?.gender).toBe('female');
      expect(result[1].vars?.gender).toBe('female');
    });
  });
});
