import { clearCache } from '../../../src/cache';
import {
  AnthropicLlmRubricProvider,
  getAnthropicProviders,
} from '../../../src/providers/anthropic/defaults';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('Anthropic Default Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
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

    it('should return the same instances on repeated calls', () => {
      const providers1 = getAnthropicProviders();
      const providers2 = getAnthropicProviders();

      expect(providers1.gradingProvider).toBe(providers2.gradingProvider);
      expect(providers1.gradingJsonProvider).toBe(providers2.gradingJsonProvider);
      expect(providers1.llmRubricProvider).toBe(providers2.llmRubricProvider);
    });

    it('should initialize providers lazily', () => {
      const providers = getAnthropicProviders();
      // Accessing one provider should not initialize others
      const gradingProvider = providers.gradingProvider;
      expect(gradingProvider).toBeInstanceOf(AnthropicMessagesProvider);

      // Access multiple times should return the same instance
      const sameGradingProvider = providers.gradingProvider;
      expect(sameGradingProvider).toBe(gradingProvider);
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
