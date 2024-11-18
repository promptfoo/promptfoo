import { getEnvBool, getEnvString } from '../../../../src/envars';
import { PromptfooHarmfulCompletionProvider } from '../../../../src/providers/promptfoo';
import { HARM_PLUGINS, UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../../../src/redteam/constants';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../../../../src/redteam/constants';
import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';
import { REDTEAM_MODEL_CATEGORIES } from '../../../../src/redteam/plugins/harmful/constants';
import { getHarmfulTests } from '../../../../src/redteam/plugins/harmful/unaligned';
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
        unalignedPlugin as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
      );

      expect(result).toHaveLength(2);
      expect(result[0].vars?.testVar).toBe(mockOutput);
      expect(result[0].metadata?.harmCategory).toBe(
        HARM_PLUGINS[unalignedPlugin as keyof typeof HARM_PLUGINS],
      );
    });

    it('should handle empty provider response', async () => {
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({ output: '' });
      jest
        .spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi')
        .mockResolvedValue({ output: '' });

      const result = await getHarmfulTests(
        {
          provider: mockProvider,
          purpose: 'test purpose',
          injectVar: 'testVar',
          n: 1,
          delayMs: 0,
        },
        'harmful:sex-crime',
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
        unalignedPlugin as keyof typeof UNALIGNED_PROVIDER_HARM_PLUGINS,
      );

      expect(Date.now() - startTime).toBeGreaterThanOrEqual(100);
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
        'harmful:sex-crime',
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
        'harmful:sex-crime',
      );

      expect(result).toHaveLength(1);
      expect(result[0].assert).toContainEqual(
        expect.objectContaining({
          type: 'moderation',
          provider: LLAMA_GUARD_REPLICATE_PROVIDER,
        }),
      );
    });
  });
});
