import { describe, expect, it } from 'vitest';
import {
  DefaultEmbeddingProvider,
  DefaultGradingJsonProvider,
  DefaultGradingProvider,
  DefaultModerationProvider,
  DefaultSuggestionsProvider,
  DefaultWebSearchProvider,
} from '../../../src/providers/openai/defaults';

describe('OpenAI default providers', () => {
  describe('DefaultEmbeddingProvider', () => {
    it('should use correct model version', () => {
      expect(DefaultEmbeddingProvider.modelName).toBe('text-embedding-3-large');
      expect(DefaultEmbeddingProvider.id()).toBe('openai:text-embedding-3-large');
    });
  });

  describe('DefaultGradingProvider', () => {
    it('should use correct model version and configuration', () => {
      expect(DefaultGradingProvider.modelName).toBe('gpt-6-sol');
      expect(DefaultGradingProvider.id()).toBe('openai:gpt-6-sol');
      expect(DefaultGradingProvider.config).toEqual({});
    });
  });

  describe('DefaultGradingJsonProvider', () => {
    it('should use correct model version and JSON configuration', () => {
      expect(DefaultGradingJsonProvider.modelName).toBe('gpt-6-sol');
      expect(DefaultGradingJsonProvider.id()).toBe('openai:gpt-6-sol');
      expect(DefaultGradingJsonProvider.config).toEqual({
        response_format: { type: 'json_object' },
      });
    });
  });

  describe('DefaultSuggestionsProvider', () => {
    it('should use correct model version', () => {
      expect(DefaultSuggestionsProvider.modelName).toBe('gpt-6-sol');
      expect(DefaultSuggestionsProvider.id()).toBe('openai:gpt-6-sol');
      expect(DefaultSuggestionsProvider.config).toEqual({});
    });
  });

  describe('DefaultModerationProvider', () => {
    it('should use correct model version', () => {
      expect(DefaultModerationProvider.modelName).toBe('omni-moderation-latest');
      expect(DefaultModerationProvider.id()).toBe('openai:omni-moderation-latest');
    });
  });

  describe('DefaultWebSearchProvider', () => {
    it('should use correct model and web search configuration', () => {
      expect(DefaultWebSearchProvider.modelName).toBe('gpt-6-sol');
      expect(DefaultWebSearchProvider.id()).toBe('openai:gpt-6-sol');
      expect(DefaultWebSearchProvider.config).toEqual({
        tools: [{ type: 'web_search_preview' }],
      });
    });
  });

  it('builds grading and search requests with the current model', async () => {
    const { body: grading } =
      await DefaultGradingJsonProvider.getOpenAiBody('Return a JSON grade.');
    const { body: search } = await DefaultWebSearchProvider.getOpenAiBody('Find recent news.');

    expect(grading.model).toBe('gpt-6-sol');
    expect(grading.response_format).toEqual({ type: 'json_object' });
    expect(grading).not.toHaveProperty('temperature');
    expect(grading).not.toHaveProperty('max_tokens');
    expect(search.model).toBe('gpt-6-sol');
    expect(search.tools).toEqual([{ type: 'web_search_preview' }]);
    expect(search).not.toHaveProperty('temperature');
  });
});
