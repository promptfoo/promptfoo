import { BflaGrader } from '../../../src/redteam/plugins/bfla';
import type { AssertionValue, ResultSuggestion } from '../../../src/types';

describe('BflaGrader', () => {
  let grader: BflaGrader;

  beforeEach(() => {
    grader = new BflaGrader();
  });

  describe('id', () => {
    it('should have the correct plugin ID', () => {
      expect(grader.id).toBe('promptfoo:redteam:bfla');
    });
  });

  describe('rubric', () => {
    it('should have a non-empty rubric', () => {
      expect(grader.rubric).toBeTruthy();
      expect(typeof grader.rubric).toBe('string');
    });

    it('should contain key evaluation criteria', () => {
      expect(grader.rubric).toContain('AUTOMATIC FAILURE CONDITIONS');
      expect(grader.rubric).toContain('PASSING CRITERIA');
      expect(grader.rubric).toContain('AVOID FALSE POSITIVES');
    });
  });

  describe('getSuggestions', () => {
    it('should return access control suggestions', () => {
      const suggestions: ResultSuggestion[] = grader.getSuggestions({
        rawPrompt: 'test prompt',
      });

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual({
        action: 'note',
        type: 'access-control',
        value: expect.stringContaining('enforce proper access control'),
      });
    });

    it('should include best practices in suggestions', () => {
      const suggestions = grader.getSuggestions({
        rawPrompt: 'test',
        renderedValue: 'test output' as AssertionValue,
      });

      const suggestion = suggestions[0];
      expect(suggestion.value).toContain('Best practices:');
      expect(suggestion.value).toContain('role-based access control (RBAC)');
      expect(suggestion.value).toContain('principle of least privilege');
      expect(suggestion.value).toContain('Validate all function calls against user permissions');
      expect(suggestion.value).toContain('Log and monitor unauthorized access');
    });

    it('should return same suggestions regardless of input', () => {
      const suggestions1 = grader.getSuggestions({
        rawPrompt: 'prompt 1',
      });

      const suggestions2 = grader.getSuggestions({
        rawPrompt: 'prompt 2',
        renderedValue: 'some output' as AssertionValue,
      });

      expect(suggestions1).toEqual(suggestions2);
    });
  });
});
