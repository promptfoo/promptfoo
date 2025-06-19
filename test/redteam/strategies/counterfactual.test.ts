import {
  addCounterfactualTestCases,
  getOriginalPromptText,
  containsAttributeReference,
  replaceGenderTerms,
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

    it('should detect gender-related terms', () => {
      expect(containsAttributeReference('She is walking', 'gender')).toBe(true);
      expect(containsAttributeReference('He went to the store', 'gender')).toBe(true);
    });

    it('should detect race-related terms', () => {
      expect(containsAttributeReference('Asian culture', 'race')).toBe(true);
      expect(containsAttributeReference('African heritage', 'race')).toBe(true);
    });

    it('should detect age-related terms', () => {
      expect(containsAttributeReference('Young person', 'age')).toBe(true);
      expect(containsAttributeReference('Elderly citizen', 'age')).toBe(true);
    });

    it('should detect religion-related terms', () => {
      expect(containsAttributeReference('Christian beliefs', 'religion')).toBe(true);
      expect(containsAttributeReference('Muslim faith', 'religion')).toBe(true);
    });

    it('should match attribute terms case-insensitively', () => {
      expect(containsAttributeReference('SHE is here', 'gender')).toBe(true);
      expect(containsAttributeReference('hEr is here', 'gender')).toBe(true);
      expect(containsAttributeReference('WOMAN went to work', 'gender')).toBe(true);
      expect(containsAttributeReference('MAN went to work', 'gender')).toBe(true);
      expect(containsAttributeReference('WHITE and black', 'race')).toBe(true);
      expect(containsAttributeReference('ASIAN cuisine', 'race')).toBe(true);
    });
  });

  describe('replaceGenderTerms', () => {
    it('should replace female terms with male terms', () => {
      expect(replaceGenderTerms('she went to her house', 'male')).toBe('he went to his house');
    });

    it('should replace male terms with female terms', () => {
      expect(replaceGenderTerms('he went to his house', 'female')).toBe('she went to her house');
    });

    it('should preserve capitalization', () => {
      expect(replaceGenderTerms('She went to Her house', 'male')).toBe('He went to His house');
    });

    it('should handle multiple replacements in one text', () => {
      expect(replaceGenderTerms('she gave her book to herself', 'male')).toBe(
        'he gave his book to himself',
      );
    });

    it('should return original text for invalid gender', () => {
      expect(replaceGenderTerms('she went home', 'invalid')).toBe('she went home');
    });

    it('should handle plural and possessive replacements', () => {
      expect(replaceGenderTerms('girls and women', 'male')).toBe('boys and men');
      expect(replaceGenderTerms('boys and men', 'female')).toBe('girls and women');
    });

    it('should not replace unrelated words', () => {
      expect(replaceGenderTerms('the helmet is red', 'male')).toBe('the helmet is red');
    });

    it('should handle himself/herself correctly', () => {
      expect(replaceGenderTerms('herself', 'male')).toBe('himself');
      expect(replaceGenderTerms('himself', 'female')).toBe('herself');
    });
  });

  describe('replaceAttributeInText', () => {
    it('should replace exact attribute matches', () => {
      expect(replaceAttributeInText('gender', 'gender', 'male')).toBe('male');
    });

    it('should handle gender-specific replacements', () => {
      expect(replaceAttributeInText('she is nice', 'gender', 'male')).toBe('he is nice');
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
        description: 'she went home',
        name: 'Alice',
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toEqual(['description']);
    });

    it('should only return variables used in template', () => {
      const vars = {
        gender: 'female',
        description: 'she went home',
      };
      const template = '{{description}}';
      expect(findVariablesContainingAttribute(vars, 'gender', template)).toEqual(['description']);
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
        description: 'woman',
      };
      expect(findVariablesContainingAttribute(vars, 'gender')).toContain('Gender');
    });

    it('should not match if template not referencing variable', () => {
      const vars = {
        gender: 'female',
        description: 'woman',
      };
      const template = '{{other}}';
      expect(findVariablesContainingAttribute(vars, 'gender', template)).toEqual([]);
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
      expect(result[0].vars?.gender).toBe('male');
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
            description: 'woman went to store',
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
      expect(result[0].vars?.description).toBe('man went to store');
      expect(result[1].vars?.description).toBe('woman went to store');
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
            description: 'she went home',
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
      expect(result[0].vars?.gender).toBe('male');
      expect(result[0].vars?.description).toBe('he went home');
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
      expect(result[0].vars?.gender).toBe('male');
      expect(result[1].vars?.gender).toBe('female');
    });
  });
});
