import { clearCache } from '../../../src/cache';
import {
  AnthropicLlmRubricProvider,
  DefaultGradingProvider,
  DefaultGradingJsonProvider,
  DefaultLlmRubricProvider,
  DefaultSuggestionsProvider,
  getAnthropicProviders,
  getDefaultGradingProvider,
  getDefaultGradingJsonProvider,
  getDefaultLlmRubricProvider,
  getDefaultSuggestionsProvider,
} from '../../../src/providers/anthropic';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('Anthropic Default Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Factory functions', () => {
    it('should create providers with the default model', () => {
      const gradingProvider = getDefaultGradingProvider();
      const gradingJsonProvider = getDefaultGradingJsonProvider();
      const suggestionsProvider = getDefaultSuggestionsProvider();
      const llmRubricProvider = getDefaultLlmRubricProvider();

      expect(gradingProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(gradingJsonProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(suggestionsProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(llmRubricProvider).toBeInstanceOf(AnthropicLlmRubricProvider);
    });
  });

  describe('Lazy providers', () => {
    it('should initialize providers only when accessed', () => {
      // Accessing the property should initialize the provider
      expect(DefaultGradingProvider.instance).toBeDefined();
      expect(DefaultGradingJsonProvider.instance).toBeDefined();
      expect(DefaultSuggestionsProvider.instance).toBeDefined();
      expect(DefaultLlmRubricProvider.instance).toBeDefined();

      // Accessing again should use the cached instance
      const firstInstance = DefaultGradingProvider.instance;
      expect(DefaultGradingProvider.instance).toBe(firstInstance);
    });
  });

  describe('getAnthropicProviders', () => {
    it('should return all provider implementations', () => {
      const providers = getAnthropicProviders();

      expect(providers.datasetGenerationProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(providers.gradingJsonProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(providers.gradingProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(providers.llmRubricProvider).toBeInstanceOf(AnthropicLlmRubricProvider);
      expect(providers.suggestionsProvider).toBeInstanceOf(AnthropicMessagesProvider);
      expect(providers.synthesizeProvider).toBeInstanceOf(AnthropicMessagesProvider);
    });
  });

  describe('AnthropicLlmRubricProvider', () => {
    let provider: AnthropicLlmRubricProvider;

    beforeEach(() => {
      provider = new AnthropicLlmRubricProvider('claude-3-5-sonnet-20241022');
    });

    it('should initialize with forced tool configuration', () => {
      expect(provider.modelName).toBe('claude-3-5-sonnet-20241022');
      expect(provider.config.tool_choice).toEqual({ type: 'tool', name: 'grade_output' });
    });

    it('should call API and parse the result correctly', async () => {
      const mockApiResponse = {
        output: JSON.stringify({
          type: 'tool_use',
          id: 'test-id',
          name: 'grade_output',
          input: {
            pass: true,
            score: 0.85,
            reason: 'The output meets the criteria.',
          },
        }),
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: {
          pass: true,
          score: 0.85,
          reason: 'The output meets the criteria.',
        },
      });
    });

    it('should handle non-string API response', async () => {
      const mockApiResponse = {
        output: { confession: 'I am not a string' },
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - malformed non-string output');
    });

    it('should handle malformed API response', async () => {
      const mockApiResponse = {
        output: 'Invalid JSON',
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - invalid JSON');
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockRejectedValue(mockError);

      await expect(provider.callApi('Test prompt')).rejects.toThrow('API Error');
    });
  });
});
