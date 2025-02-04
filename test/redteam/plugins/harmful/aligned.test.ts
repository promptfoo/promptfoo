import { HARM_PLUGINS, UNALIGNED_PROVIDER_HARM_PLUGINS } from '../../../../src/redteam/constants';
import { AlignedHarmfulPlugin } from '../../../../src/redteam/plugins/harmful/aligned';
import type { HarmfulCategory } from '../../../../src/redteam/plugins/harmful/constants';
import { REDTEAM_MODEL_CATEGORIES } from '../../../../src/redteam/plugins/harmful/constants';
import type { ApiProvider } from '../../../../src/types';

describe('AlignedHarmfulPlugin', () => {
  let mockProvider: ApiProvider;
  let plugin: AlignedHarmfulPlugin;
  let harmCategory: keyof typeof HARM_PLUGINS;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    // Find a harm category that isn't in unaligned providers
    harmCategory = Object.keys(HARM_PLUGINS).find(
      (key) => !(key in UNALIGNED_PROVIDER_HARM_PLUGINS),
    ) as keyof typeof HARM_PLUGINS;

    const harmfulCategory: HarmfulCategory = {
      key: harmCategory as HarmfulCategory['key'],
      prompt: 'test prompt template {{ examples }}',
      examples: 'test examples',
      label: 'Test Label' as HarmfulCategory['label'],
      description: 'Test Description',
    };

    // Mock a valid category in REDTEAM_MODEL_CATEGORIES
    jest.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(harmfulCategory);

    plugin = new AlignedHarmfulPlugin(mockProvider, 'test purpose', 'testVar', harmCategory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create instance with valid parameters', () => {
      expect(plugin).toBeInstanceOf(AlignedHarmfulPlugin);
      expect(mockProvider.id()).toBe('test-provider');
    });

    it('should accept optional config parameter', () => {
      const configPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        harmCategory,
        { examples: ['test example'] },
      );
      expect(configPlugin).toBeInstanceOf(AlignedHarmfulPlugin);
    });
  });

  describe('template handling', () => {
    it('should retrieve correct template for harm category', async () => {
      const template = await plugin['getTemplate']();
      expect(template).toBe('test prompt template {{ examples }}');
    });

    it('should throw when category config is not found', async () => {
      jest.spyOn(REDTEAM_MODEL_CATEGORIES, 'find').mockReturnValue(undefined);
      await expect(plugin['getTemplate']()).rejects.toThrow(
        `Harmful category ${harmCategory} not found`,
      );
    });
  });

  describe('assertion generation', () => {
    it('should generate harmful assertions for given prompt', () => {
      const assertions = plugin['getAssertions']('test prompt');
      expect(assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: 'Harmful',
          }),
        ]),
      );
    });

    it('should include harm category in assertions', () => {
      const assertions = plugin['getAssertions']('test prompt');
      assertions.forEach((assertion) => {
        expect(assertion).toHaveProperty('metric');
        expect(assertion.metric).toBe('Harmful');
      });
    });
  });

  describe('test case generation', () => {
    const mockPrompts = [{ prompt: 'Test prompt 1' }, { prompt: 'Test prompt 2' }];

    it('should create properly structured test cases', () => {
      const testCases = plugin['promptsToTestCases'](mockPrompts);

      expect(testCases).toHaveLength(2);
      testCases.forEach((testCase) => {
        expect(testCase).toMatchObject({
          vars: {
            testVar: expect.any(String),
            harmCategory: HARM_PLUGINS[harmCategory],
          },
          metadata: {
            harmCategory: HARM_PLUGINS[harmCategory],
          },
          assert: expect.arrayContaining([
            expect.objectContaining({
              metric: 'Harmful',
            }),
          ]),
        });
      });
    });

    it('should handle empty prompts array', () => {
      const testCases = plugin['promptsToTestCases']([]);
      expect(testCases).toHaveLength(0);
    });
  });

  describe('end-to-end test generation', () => {
    beforeEach(() => {
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: 'Prompt: Generated test 1\nPrompt: Generated test 2',
      });
    });

    it('should generate requested number of test cases', async () => {
      const testCases = await plugin.generateTests(2);
      expect(testCases).toHaveLength(2);
      expect(mockProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it('should handle custom examples in config', async () => {
      const customExamples = ['Custom example 1', 'Custom example 2'];
      const configuredPlugin = new AlignedHarmfulPlugin(
        mockProvider,
        'test purpose',
        'testVar',
        harmCategory,
        { examples: customExamples },
      );

      await configuredPlugin.generateTests(1);

      expect(mockProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('test prompt template Custom example 1,Custom example 2'),
      );
    });

    it('should handle API errors gracefully', async () => {
      jest.spyOn(mockProvider, 'callApi').mockResolvedValue({
        output: '',
        error: 'API Error',
      });

      const testCases = await plugin.generateTests(1);
      expect(testCases).toHaveLength(0);
    });
  });
});
