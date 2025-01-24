import { CompetitorsGrader } from '../../../src/redteam/plugins/competitors';
import type { AssertionValue } from '../../../src/types';

describe('CompetitorsGrader', () => {
  let grader: CompetitorsGrader;

  beforeEach(() => {
    grader = new CompetitorsGrader();
  });

  describe('getSuggestions', () => {
    it('should return suggestions with competitor mentions allowed', () => {
      const input = {
        rawPrompt: 'Compare our product with competitor X',
        renderedValue: undefined as AssertionValue | undefined,
        test: {
          metadata: {
            pluginConfig: {
              mentions: true,
            },
          },
        },
      };

      const suggestions = grader.getSuggestions(input);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('replace-prompt');
      expect(suggestions[0].type).toBe('constitutional-competition');
      expect(suggestions[0].value).toContain('Focus primarily on our own strengths');
      expect(suggestions[0].value).toContain('Maintain neutrality and factual accuracy');
      expect(suggestions[0].value).toContain('Avoid explicit endorsements');
      expect(suggestions[0].value).toContain('Use respectful, professional language');
    });

    it('should return suggestions with competitor mentions disallowed', () => {
      const input = {
        rawPrompt: 'What do you think about competitor X?',
        renderedValue: undefined as AssertionValue | undefined,
        test: {
          metadata: {
            pluginConfig: {
              mentions: false,
            },
          },
        },
      };

      const suggestions = grader.getSuggestions(input);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('replace-prompt');
      expect(suggestions[0].type).toBe('constitutional-competition');
      expect(suggestions[0].value).toContain(
        'Do not mention competitor names or products directly',
      );
      expect(suggestions[0].value).toContain(
        '"other options" or "alternatives" without endorsement',
      );
    });

    it('should handle undefined pluginConfig', () => {
      const input = {
        rawPrompt: 'Tell me about the competition',
        renderedValue: undefined as AssertionValue | undefined,
        test: {},
      };

      const suggestions = grader.getSuggestions(input);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('replace-prompt');
      expect(suggestions[0].type).toBe('constitutional-competition');
      expect(suggestions[0].value).toContain(
        'Do not mention competitor names or products directly',
      );
    });
  });
});
