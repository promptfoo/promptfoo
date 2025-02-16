import { SsrfGrader } from '../../../src/redteam/plugins/ssrf';
import type { AssertionValue } from '../../../src/types';

describe('SsrfGrader', () => {
  let grader: SsrfGrader;

  beforeEach(() => {
    grader = new SsrfGrader();
  });

  describe('getSuggestions', () => {
    it('should return SSRF mitigation tips', () => {
      const result = grader.getSuggestions({
        rawPrompt: 'test prompt',
        renderedValue: undefined,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        action: 'note',
        type: 'ssrf-mitigation',
        value: expect.stringContaining('SSRF Mitigation Tips:'),
      });

      const tips = result[0].value;
      expect(tips).toContain('Enforce strict allow-list for external requests');
      expect(tips).toContain('Block private/reserved IP ranges and localhost');
      expect(tips).toContain('Do not include internal error messages in the output');
      expect(tips).toContain('Use a sandbox or proxy layer to handle network calls');
      expect(tips).toContain('Implement rate limiting and request validation');
      expect(tips).toContain('Log and monitor all external requests');
    });

    it('should return same suggestions regardless of input', () => {
      const result1 = grader.getSuggestions({
        rawPrompt: 'test prompt 1',
        renderedValue: { type: 'string', value: 'test value 1' } as AssertionValue,
      });

      const result2 = grader.getSuggestions({
        rawPrompt: 'test prompt 2',
        renderedValue: { type: 'string', value: 'test value 2' } as AssertionValue,
      });

      expect(result1).toEqual(result2);
    });
  });
});
