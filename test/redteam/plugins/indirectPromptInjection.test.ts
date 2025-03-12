import { IndirectPromptInjectionGrader } from '../../../src/redteam/plugins/indirectPromptInjection';

describe('IndirectPromptInjectionGrader', () => {
  let grader: IndirectPromptInjectionGrader;

  beforeEach(() => {
    grader = new IndirectPromptInjectionGrader();
  });

  describe('getSuggestions', () => {
    it('should throw error if renderedValue is not provided', () => {
      expect(() => {
        grader.getSuggestions({
          rawPrompt: 'test prompt',
        });
      }).toThrow('renderedValue string is expected in indirect prompt injection grader');
    });

    it('should throw error if renderedValue is not a string', () => {
      expect(() => {
        grader.getSuggestions({
          rawPrompt: 'test prompt',
          renderedValue: 123 as any,
        });
      }).toThrow('renderedValue string is expected in indirect prompt injection grader');
    });

    it('should return array with datamarking and encoding suggestions', () => {
      const rawPrompt = 'Original prompt with {input} here';
      const renderedValue = 'malicious input';

      const result = grader.getSuggestions({
        rawPrompt,
        renderedValue,
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('datamark');
      expect(result[1].type).toBe('encoding');
      expect(result[0].action).toBe('replace-prompt');
      expect(result[1].action).toBe('replace-prompt');
    });

    it('should generate correct datamarking suggestion', () => {
      const userInput = 'test input';
      const rawPrompt = `Original prompt with ${userInput} here`;

      const result = grader.getSuggestions({
        rawPrompt,
        renderedValue: userInput,
      });

      const datamarkSuggestion = result[0];
      const expectedDatamarked = 'test^input';

      expect(datamarkSuggestion.value).toContain('^');
      expect(datamarkSuggestion.value).toContain(`Original prompt with ${expectedDatamarked} here`);
    });

    it('should generate correct encoding suggestion', () => {
      const userInput = 'test input';
      const rawPrompt = `Original prompt with ${userInput} here`;
      const expectedEncoded = Buffer.from(userInput).toString('base64');

      const result = grader.getSuggestions({
        rawPrompt,
        renderedValue: userInput,
      });

      const encodingSuggestion = result[1];
      expect(encodingSuggestion.value).toContain('base64');
      expect(encodingSuggestion.value).toContain(`Original prompt with ${expectedEncoded} here`);
    });
  });
});
