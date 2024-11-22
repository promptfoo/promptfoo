import { getEnvBool, getEnvString } from '../../../../src/envars';
import { HARM_PLUGINS } from '../../../../src/redteam/constants';
import {
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../../../src/redteam/constants';
import {
  getHarmfulAssertions,
  createTestCase,
} from '../../../../src/redteam/plugins/harmful/common';

jest.mock('../../../../src/envars');

describe('harmful plugin', () => {
  beforeEach(() => {
    jest.mocked(getEnvBool).mockReset();
    jest.mocked(getEnvString).mockReset();
  });

  describe('getHarmfulAssertions', () => {
    beforeEach(() => {
      jest.mocked(getEnvBool).mockReset();
      jest.mocked(getEnvString).mockReset();
    });

    it('should return basic assertion for privacy category', () => {
      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toEqual([
        { metric: 'Harmful', type: 'promptfoo:redteam:harmful:privacy' },
      ]);
    });

    it('should return basic assertion for non-privacy category', () => {
      const assertions = getHarmfulAssertions('harmful:intellectual-property');
      expect(assertions).toEqual([{ metric: 'Harmful', type: 'promptfoo:redteam:harmful' }]);
    });

    it('should return only basic assertions when moderation is disabled', () => {
      jest.mocked(getEnvBool).mockImplementation((key) => {
        if (key === 'PROMPTFOO_DISABLE_REDTEAM_MODERATION') {
          return true;
        }
        return false;
      });
      jest.mocked(getEnvString).mockReturnValue('test-key');

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toHaveLength(1);
      expect(assertions).not.toContainEqual(expect.objectContaining({ type: 'moderation' }));
    });

    it('should prioritize Replicate over OpenAI when both keys are present', () => {
      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'REPLICATE_API_KEY') {
          return 'replicate-key';
        }
        if (key === 'OPENAI_API_KEY') {
          return 'openai-key';
        }
        return '';
      });

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toContainEqual({
        metric: 'Harmful',
        type: 'moderation',
        value: LLAMA_GUARD_ENABLED_CATEGORIES,
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      });
      expect(assertions).toHaveLength(2);
    });

    it('should handle REPLICATE_API_TOKEN', () => {
      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'REPLICATE_API_TOKEN') {
          return 'replicate-token';
        }
        return '';
      });

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toContainEqual({
        metric: 'Harmful',
        type: 'moderation',
        value: LLAMA_GUARD_ENABLED_CATEGORIES,
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      });
    });
  });

  describe('createTestCase', () => {
    it('should create test case with single line output', () => {
      const testCase = createTestCase('inputVar', 'single line output', 'harmful:privacy');

      expect(testCase).toEqual({
        vars: {
          inputVar: 'single line output',
          harmCategory: HARM_PLUGINS['harmful:privacy'],
        },
        metadata: {
          harmCategory: HARM_PLUGINS['harmful:privacy'],
        },
        assert: expect.any(Array),
      });
    });

    it('should handle multiline output', () => {
      const testCase = createTestCase(
        'inputVar',
        'first line\nsecond line\nthird line',
        'harmful:privacy',
      );

      expect(testCase.vars?.inputVar).toBe('first line\nsecond line\nthird line');
    });

    it('should handle whitespace in output', () => {
      const testCase = createTestCase('inputVar', '  padded output  ', 'harmful:privacy');
      expect(testCase.vars?.inputVar).toBe('padded output');
    });

    it('should use harm category as fallback when not in HARM_PLUGINS', () => {
      const unknownCategory = 'harmful:unknown' as keyof typeof HARM_PLUGINS;
      const testCase = createTestCase('inputVar', 'test output', unknownCategory);

      expect(testCase.vars?.harmCategory).toBe(unknownCategory);
      expect(testCase.metadata?.harmCategory).toBe(unknownCategory);
    });
  });
});
