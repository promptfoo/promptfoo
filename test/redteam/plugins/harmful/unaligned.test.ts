import { getEnvBool, getEnvString } from '../../../../src/envars';
import { PromptfooHarmfulCompletionProvider } from '../../../../src/providers/promptfoo';
import { UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../../../src/redteam/constants';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from '../../../../src/redteam/constants';
import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';
import { REDTEAM_MODEL_CATEGORIES } from '../../../../src/redteam/plugins/harmful/constants';
import { getHarmfulTests } from '../../../../src/redteam/plugins/harmful/unaligned';
import type { ApiProvider } from '../../../../src/types';

jest.mock('../../../../src/envars');

describe('harmful plugin', () => {
  let mockProvider: ApiProvider;
  let mockCallApi: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    if (mockCallApi) {
      mockCallApi.mockRestore();
    }
    mockCallApi = jest.spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi').mockReset();

    jest.mocked(getEnvBool).mockReset();
    jest.mocked(getEnvString).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (mockCallApi) {
      mockCallApi.mockRestore();
    }
  });

  describe('getHarmfulTests', () => {
    it('should handle unaligned provider plugins with multiple prompts', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];

      mockCallApi.mockResolvedValueOnce({
        output: ['Test harmful output', 'Another test output'],
      });

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

      expect(mockCallApi).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      const prompts = result.map((r) => r.vars?.testVar);
      expect(prompts).toContain('Test harmful output');
      expect(prompts).toContain('Another test output');
    });

    it('should retry when not enough unique prompts are returned', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];

      mockCallApi
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Another test output'] });

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

      expect(mockCallApi).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(2);
      const prompts = result.map((r) => r.vars?.testVar);
      expect(prompts).toContain('Test output');
      expect(prompts).toContain('Another test output');
    });

    it('should handle empty provider response', async () => {
      mockCallApi.mockResolvedValue({ output: [] });

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

    it('should respect delay parameter between API calls', async () => {
      const unalignedPlugin = Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS)[0];
      mockCallApi
        .mockResolvedValueOnce({ output: ['Test output'] })
        .mockResolvedValueOnce({ output: ['Another output'] });

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
      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'OPENAI_API_KEY') {
          return 'test-key';
        }
        return '';
      });

      mockCallApi.mockResolvedValueOnce({ output: ['Test output'] });

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
      expect(result[0].vars?.testVar).toBe('Test output');
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

      const mockOutput = 'Test output';
      jest
        .spyOn(PromptfooHarmfulCompletionProvider.prototype, 'callApi')
        .mockResolvedValue({ output: [mockOutput] });

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
      expect(result[0].vars?.testVar).toBe('Test output');
      expect(result[0].assert).toContainEqual(
        expect.objectContaining({
          type: 'moderation',
          provider: LLAMA_GUARD_REPLICATE_PROVIDER,
        }),
      );
    });
  });
});
