import { ReasoningDosGrader } from '../../../src/redteam/plugins/reasoningDos';

describe('ReasoningDosGrader', () => {
  let grader: ReasoningDosGrader;

  beforeEach(() => {
    grader = new ReasoningDosGrader();
  });

  describe('getSuggestions', () => {
    it('should add computation guardrails to prompt', () => {
      const rawPrompt = 'Tell me a story';
      const result = grader.getSuggestions({ rawPrompt });

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('replace-prompt');
      expect(result[0].type).toBe('anti-overthink');
      expect(result[0].value).toContain('Tell me a story');
      expect(result[0].value).toContain('Do not engage in recursive or iterative computation');
    });

    it('should add additional guardrails for prompts with overthink triggers', () => {
      const rawPrompt = 'Solve this complex puzzle by exploring all possible paths';
      const result = grader.getSuggestions({ rawPrompt });

      expect(result).toHaveLength(1);
      expect(result[0].value).toContain('Warning: This prompt may require excessive computation');
      expect(result[0].value).toContain('Do not attempt to solve or compute anything');
    });

    it('should detect various overthink patterns', () => {
      const triggerPrompts = [
        'solve this puzzle',
        'calculate all possibilities',
        'optimize for every case',
        'prove this theorem',
        'verify all combinations',
        'use a recursive process',
        'iterate until solved',
        'backtrack through solutions',
        'explore all paths',
        'solve this sudoku',
        'analyze this chess position',
        'apply game theory',
        'build a decision tree',
        'model as a markov process',
      ];

      triggerPrompts.forEach((prompt) => {
        const result = grader.getSuggestions({ rawPrompt: prompt });
        expect(result[0].value).toContain('Warning: This prompt may require excessive computation');
      });
    });

    it('should handle undefined renderedValue', () => {
      const rawPrompt = 'Tell me a story';

      const renderedValue: any = undefined;

      expect(() => {
        grader.getSuggestions({ rawPrompt, renderedValue });
      }).not.toThrow();
    });

    it('should preserve original prompt content', () => {
      const originalPrompt = 'What is 2+2?';
      const result = grader.getSuggestions({ rawPrompt: originalPrompt });

      expect(result[0].value).toContain(originalPrompt);
    });
  });
});
