import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedPrompt } from '../src/evaluator';
import { doesPromptRefMatch, isPromptAllowed } from '../src/util/promptMatching';
import {
  PromptReferenceValidationError,
  validateTestPromptReferences,
} from '../src/util/validateTestPromptReferences';

import type { Prompt, TestCase } from '../src/types/index';

describe('isAllowedPrompt with ID and wildcard support', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  const promptWithLabel: Prompt = {
    label: 'Factual Assistant',
    raw: 'You are a factual assistant',
  };

  const promptWithId: Prompt = {
    id: 'prompt-factual',
    label: 'Factual Assistant',
    raw: 'You are a factual assistant',
  };

  const promptWithGroupLabel: Prompt = {
    label: 'Math:Basic',
    raw: 'You solve basic math',
  };

  const promptWithGroupId: Prompt = {
    id: 'math:basic',
    label: 'Math Basic Solver',
    raw: 'You solve basic math',
  };

  describe('exact label matching', () => {
    it('should match exact label', () => {
      expect(isAllowedPrompt(promptWithLabel, ['Factual Assistant'])).toBe(true);
    });

    it('should not match different label', () => {
      expect(isAllowedPrompt(promptWithLabel, ['Creative Writer'])).toBe(false);
    });
  });

  describe('exact ID matching', () => {
    it('should match exact ID', () => {
      expect(isAllowedPrompt(promptWithId, ['prompt-factual'])).toBe(true);
    });

    it('should not match different ID', () => {
      expect(isAllowedPrompt(promptWithId, ['prompt-creative'])).toBe(false);
    });

    it('should match by ID even when label does not match', () => {
      const prompt: Prompt = {
        id: 'my-id',
        label: 'My Label',
        raw: 'content',
      };
      expect(isAllowedPrompt(prompt, ['my-id'])).toBe(true);
    });
  });

  describe('wildcard matching with *', () => {
    it('should match label with wildcard prefix', () => {
      expect(isAllowedPrompt(promptWithGroupLabel, ['Math:*'])).toBe(true);
    });

    it('should match ID with wildcard prefix', () => {
      expect(isAllowedPrompt(promptWithGroupId, ['math:*'])).toBe(true);
    });

    it('should not match when prefix does not match', () => {
      expect(isAllowedPrompt(promptWithGroupLabel, ['Science:*'])).toBe(false);
    });

    it('should match multiple groups with wildcards', () => {
      const mathPrompt: Prompt = { label: 'Math:Advanced', raw: '' };
      const sciencePrompt: Prompt = { label: 'Science:Physics', raw: '' };

      expect(isAllowedPrompt(mathPrompt, ['Math:*', 'Science:*'])).toBe(true);
      expect(isAllowedPrompt(sciencePrompt, ['Math:*', 'Science:*'])).toBe(true);
    });

    it('should handle wildcard at end of simple prefix', () => {
      const prompt: Prompt = { label: 'TestPrompt', raw: '' };
      expect(isAllowedPrompt(prompt, ['Test*'])).toBe(true);
      expect(isAllowedPrompt(prompt, ['Other*'])).toBe(false);
    });
  });

  describe('legacy prefix matching (backward compat)', () => {
    it('should match label with legacy prefix (Group matches Group:foo)', () => {
      expect(isAllowedPrompt(promptWithGroupLabel, ['Math'])).toBe(true);
    });

    it('should match ID with legacy prefix', () => {
      expect(isAllowedPrompt(promptWithGroupId, ['math'])).toBe(true);
    });

    it('should not match when legacy prefix does not match', () => {
      expect(isAllowedPrompt(promptWithGroupLabel, ['Science'])).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return true when allowedPrompts is undefined', () => {
      expect(isAllowedPrompt(promptWithLabel, undefined)).toBe(true);
    });

    it('should return false when allowedPrompts is empty array', () => {
      expect(isAllowedPrompt(promptWithLabel, [])).toBe(false);
    });

    it('should handle prompt with no ID', () => {
      const noIdPrompt: Prompt = { label: 'No ID', raw: '' };
      expect(isAllowedPrompt(noIdPrompt, ['No ID'])).toBe(true);
      expect(isAllowedPrompt(noIdPrompt, ['some-id'])).toBe(false);
    });

    it('should handle multiple allowed prompts', () => {
      expect(isAllowedPrompt(promptWithLabel, ['Other', 'Factual Assistant', 'Another'])).toBe(
        true,
      );
    });
  });
});

describe('validateTestPromptReferences', () => {
  const prompts: Prompt[] = [
    { id: 'prompt-a', label: 'Factual Assistant', raw: 'content a' },
    { id: 'prompt-b', label: 'Creative Writer', raw: 'content b' },
    { label: 'Math:Basic', raw: 'content c' },
    { label: 'Math:Advanced', raw: 'content d' },
  ];

  describe('valid references', () => {
    it('should pass when test references valid label', () => {
      const tests: TestCase[] = [{ prompts: ['Factual Assistant'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass when test references valid ID', () => {
      const tests: TestCase[] = [{ prompts: ['prompt-a'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass when test references multiple valid prompts', () => {
      const tests: TestCase[] = [{ prompts: ['Factual Assistant', 'prompt-b'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass when test has no prompts field', () => {
      const tests: TestCase[] = [{ vars: { topic: 'test' } }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass when test has empty prompts array', () => {
      const tests: TestCase[] = [{ prompts: [] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass with wildcard reference matching multiple prompts', () => {
      const tests: TestCase[] = [{ prompts: ['Math:*'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });

    it('should pass with legacy prefix matching', () => {
      const tests: TestCase[] = [{ prompts: ['Math'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });
  });

  describe('invalid references', () => {
    it('should throw error when test references nonexistent label', () => {
      const tests: TestCase[] = [{ prompts: ['Nonexistent Prompt'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        PromptReferenceValidationError,
      );
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        /Test #1 references prompt "Nonexistent Prompt" which does not exist/,
      );
    });

    it('should throw error when test references nonexistent ID', () => {
      const tests: TestCase[] = [{ prompts: ['nonexistent-id'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        PromptReferenceValidationError,
      );
    });

    it('should throw error with test description in message', () => {
      const tests: TestCase[] = [
        { description: 'My important test', prompts: ['Nonexistent Prompt'] },
      ];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        /Test #1 \("My important test"\) references prompt/,
      );
    });

    it('should include available prompts in error message', () => {
      const tests: TestCase[] = [{ prompts: ['Typo'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(/Available prompts:/);
    });

    it('should throw error when wildcard matches nothing', () => {
      const tests: TestCase[] = [{ prompts: ['Science:*'] }];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        PromptReferenceValidationError,
      );
    });

    it('should throw error for each invalid reference', () => {
      const tests: TestCase[] = [
        { prompts: ['Valid'] }, // Would fail, no such prompt
      ];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow();
    });
  });

  describe('defaultTest validation', () => {
    it('should pass when defaultTest references valid prompt', () => {
      const tests: TestCase[] = [];
      const defaultTest: Partial<TestCase> = { prompts: ['Factual Assistant'] };
      expect(() => validateTestPromptReferences(tests, prompts, defaultTest)).not.toThrow();
    });

    it('should throw error when defaultTest references invalid prompt', () => {
      const tests: TestCase[] = [];
      const defaultTest: Partial<TestCase> = { prompts: ['Nonexistent'] };
      expect(() => validateTestPromptReferences(tests, prompts, defaultTest)).toThrow(
        /defaultTest references prompt "Nonexistent" which does not exist/,
      );
    });

    it('should pass when defaultTest has no prompts field', () => {
      const tests: TestCase[] = [];
      const defaultTest: Partial<TestCase> = { threshold: 0.5 };
      expect(() => validateTestPromptReferences(tests, prompts, defaultTest)).not.toThrow();
    });
  });

  describe('multiple tests validation', () => {
    it('should validate all tests and report first error', () => {
      const tests: TestCase[] = [
        { prompts: ['Factual Assistant'] }, // Valid
        { prompts: ['Invalid1'] }, // Invalid - should be reported
        { prompts: ['Invalid2'] }, // Also invalid but won't be reached
      ];
      expect(() => validateTestPromptReferences(tests, prompts)).toThrow(
        /Test #2 references prompt "Invalid1"/,
      );
    });

    it('should pass when all tests have valid references', () => {
      const tests: TestCase[] = [
        { prompts: ['Factual Assistant'] },
        { prompts: ['prompt-b'] },
        { prompts: ['Math:*'] },
      ];
      expect(() => validateTestPromptReferences(tests, prompts)).not.toThrow();
    });
  });
});

describe('shared promptMatching utilities', () => {
  describe('doesPromptRefMatch', () => {
    it('should match exact label', () => {
      const prompt: Prompt = { label: 'Test', raw: '' };
      expect(doesPromptRefMatch('Test', prompt)).toBe(true);
      expect(doesPromptRefMatch('Other', prompt)).toBe(false);
    });

    it('should match exact ID', () => {
      const prompt: Prompt = { id: 'test-id', label: 'Test', raw: '' };
      expect(doesPromptRefMatch('test-id', prompt)).toBe(true);
      expect(doesPromptRefMatch('other-id', prompt)).toBe(false);
    });

    it('should match wildcard patterns', () => {
      const prompt: Prompt = { label: 'Group:SubGroup', raw: '' };
      expect(doesPromptRefMatch('Group:*', prompt)).toBe(true);
      expect(doesPromptRefMatch('Other:*', prompt)).toBe(false);
    });

    it('should match legacy prefix patterns', () => {
      const prompt: Prompt = { label: 'Group:Item', raw: '' };
      expect(doesPromptRefMatch('Group', prompt)).toBe(true);
      expect(doesPromptRefMatch('Other', prompt)).toBe(false);
    });

    it('should not match raw content (only matches label or id)', () => {
      const prompt: Prompt = { label: 'My Label', raw: 'content' };
      // Should not match raw content, only label or id
      expect(doesPromptRefMatch('content', prompt)).toBe(false);
      // Wildcard '*' matches empty prefix, so matches any label
      expect(doesPromptRefMatch('*', prompt)).toBe(true);
    });
  });

  describe('isPromptAllowed', () => {
    const prompt: Prompt = { label: 'Test', raw: '' };

    it('should return true when allowedPrompts is undefined', () => {
      expect(isPromptAllowed(prompt, undefined)).toBe(true);
    });

    it('should return false when allowedPrompts is empty array', () => {
      expect(isPromptAllowed(prompt, [])).toBe(false);
    });

    it('should return true when prompt matches any allowed prompt', () => {
      expect(isPromptAllowed(prompt, ['Other', 'Test'])).toBe(true);
    });

    it('should return false when prompt matches no allowed prompt', () => {
      expect(isPromptAllowed(prompt, ['Other', 'Another'])).toBe(false);
    });
  });

  describe('isAllowedPrompt wrapper', () => {
    it('should delegate to isPromptAllowed correctly', () => {
      const prompt: Prompt = { label: 'Test', raw: '' };
      // isAllowedPrompt should behave identically to isPromptAllowed
      expect(isAllowedPrompt(prompt, undefined)).toBe(isPromptAllowed(prompt, undefined));
      expect(isAllowedPrompt(prompt, [])).toBe(isPromptAllowed(prompt, []));
      expect(isAllowedPrompt(prompt, ['Test'])).toBe(isPromptAllowed(prompt, ['Test']));
      expect(isAllowedPrompt(prompt, ['Other'])).toBe(isPromptAllowed(prompt, ['Other']));
    });
  });
});
