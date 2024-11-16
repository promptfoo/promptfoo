import { getEnvBool, getEnvString } from '../../../../src/envars';
import { PromptfooHarmfulCompletionProvider } from '../../../../src/providers/promptfoo';
import { HARM_PLUGINS, UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../../../src/redteam/constants';
import {
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../../../src/redteam/constants';
import { getHarmfulTests } from '../../../../src/redteam/plugins/harmful';
import { getModerationAssertions, createTestCase } from '../../../../src/redteam/plugins/harmful';
import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';
import { REDTEAM_MODEL_CATEGORIES } from '../../../../src/redteam/plugins/harmful/constants';
import type { ApiProvider } from '../../../../src/types';

jest.mock('../../../../src/envars');

describe('harmful plugin', () => {
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    jest.mocked(getEnvBool).mockReset();
    jest.mocked(getEnvString).mockReset();
  });

  describe('getHarmfulTests', () => {
    it('should handle unaligned provider plugins', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];
      const mockOutput = 'Test harmful output';

      jest
        .spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi')
        .mockResolvedValue({ output: mockOutput });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 2,
          delayMs: 0,
        },
        unalignedPlugin as keyof typeof HARM_PLUGINS,
      );

      expect(result).toHaveLength(2);
      expect(result[0].vars?.testVar).toBe(mockOutput);
      expect(result[0].metadata?.harmCategory).toBe(
        HARM_PLUGINS[unalignedPlugin as keyof typeof HARM_PLUGINS],
      );
    });

    it('should handle aligned provider plugins', async () => {
      const alignedPlugin = Object.keys(HARM_PLUGINS).find(
        (key) => !(key in UNALIGNED_PROVIDER_HARM_PLUGINS),
      );

      const mockOutput = 'Prompt: Test prompt 1\nPrompt: Test prompt 2';
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockOutput });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        alignedPlugin as keyof typeof HARM_PLUGINS,
      );

      expect(result).toHaveLength(1);
      expect(result[0].vars?.harmCategory).toBe(
        HARM_PLUGINS[alignedPlugin as keyof typeof HARM_PLUGINS],
      );
    });

    it('should handle empty provider response', async () => {
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: '' });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:privacy',
      );

      expect(result).toHaveLength(0);
    });

    it('should respect delay parameter for unaligned providers', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];
      jest
        .spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi')
        .mockResolvedValue({ output: 'test' });

      const startTime = Date.now();
      await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 2,
          delayMs: 100,
        },
        unalignedPlugin as keyof typeof HARM_PLUGINS,
      );

      expect(Date.now() - startTime).toBeGreaterThanOrEqual(100);
    });

    it('should handle custom config examples', async () => {
      const alignedPlugin = Object.keys(HARM_PLUGINS).find(
        (key) => !(key in UNALIGNED_PROVIDER_HARM_PLUGINS),
      );
      const customExamples = ['Example 1', 'Example 2'];
      const mockOutput = 'Prompt: Test prompt';

      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockOutput });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
          config: { examples: customExamples },
        },
        alignedPlugin as keyof typeof HARM_PLUGINS,
      );

      expect(mockProvider.callApi).toHaveBeenCalledWith(expect.stringContaining('Example 1'));
      expect(result).toHaveLength(1);
    });

    it('should handle moderation assertions with OPENAI_API_KEY', async () => {
      const mockCategory: HarmfulCategory = {
        key: 'harmful:privacy',
        prompt: 'test prompt',
        examples: 'example1',
        label: 'Privacy violations',
        description: 'test description',
      };
      jest.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(mockCategory);

      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'OPENAI_API_KEY') {
          return 'test-key';
        }
        return '';
      });

      const mockOutput = 'Prompt: Test output';
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockOutput });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:privacy',
      );

      expect(result).toHaveLength(1);
      expect(result[0].assert).toContainEqual(expect.objectContaining({ type: 'moderation' }));
    });

    it('should handle moderation assertions with REPLICATE_API_KEY', async () => {
      const mockCategory: HarmfulCategory = {
        key: 'harmful:privacy',
        prompt: 'test prompt',
        examples: 'example1',
        label: 'Privacy violations',
        description: 'test description',
      };
      jest.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(mockCategory);

      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'REPLICATE_API_KEY') {
          return 'test-key';
        }
        return '';
      });

      const mockOutput = 'Prompt: Test output';
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: mockOutput });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:privacy',
      );

      expect(result).toHaveLength(1);
      expect(result[0].assert).toContainEqual(
        expect.objectContaining({
          type: 'moderation',
          provider: LLAMA_GUARD_REPLICATE_PROVIDER,
        }),
      );
    });

    it('should throw error for invalid harm category', async () => {
      await expect(
        getHarmfulTests(
          {
            provider: mockProvider,
            purpose: 'test purpose',
            injectVar: 'testVar',
            n: 1,
            delayMs: 0,
          },
          'invalid:category' as keyof typeof HARM_PLUGINS,
        ),
      ).rejects.toThrow("Cannot read properties of undefined (reading 'output')");
    });
  });

  describe('getModerationAssertions', () => {
    beforeEach(() => {
      jest.mocked(getEnvBool).mockReset();
      jest.mocked(getEnvString).mockReset();
    });

    it('should return basic assertion for privacy category', () => {
      const assertions = getModerationAssertions('harmful:privacy');
      expect(assertions).toEqual([
        { metric: 'Harmful', type: 'promptfoo:redteam:harmful:privacy' },
      ]);
    });

    it('should return basic assertion for non-privacy category', () => {
      const assertions = getModerationAssertions('harmful:intellectual-property');
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

      const assertions = getModerationAssertions('harmful:privacy');
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

      const assertions = getModerationAssertions('harmful:privacy');
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

      const assertions = getModerationAssertions('harmful:privacy');
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

    it('should handle multiline output by taking first line', () => {
      const testCase = createTestCase(
        'inputVar',
        'first line\nsecond line\nthird line',
        'harmful:privacy',
      );

      expect(testCase.vars?.inputVar).toBe('first line');
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
