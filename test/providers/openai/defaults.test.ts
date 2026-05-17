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
      expect(DefaultGradingProvider.modelName).toBe('gpt-5.5-2026-04-23');
      expect(DefaultGradingProvider.id()).toBe('openai:gpt-5.5-2026-04-23');
      expect(DefaultGradingProvider.config).toEqual({});
    });
  });

  describe('DefaultGradingJsonProvider', () => {
    it('should use correct model version and JSON configuration', () => {
      expect(DefaultGradingJsonProvider.modelName).toBe('gpt-5.5-2026-04-23');
      expect(DefaultGradingJsonProvider.id()).toBe('openai:gpt-5.5-2026-04-23');
      expect(DefaultGradingJsonProvider.config).toEqual({
        response_format: { type: 'json_object' },
      });
    });
  });

  describe('DefaultSuggestionsProvider', () => {
    it('should use correct model version', () => {
      expect(DefaultSuggestionsProvider.modelName).toBe('gpt-5.5-2026-04-23');
      expect(DefaultSuggestionsProvider.id()).toBe('openai:gpt-5.5-2026-04-23');
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
    it('should use correct model snapshot and web search configuration', () => {
      expect(DefaultWebSearchProvider.modelName).toBe('gpt-5.5-2026-04-23');
      expect(DefaultWebSearchProvider.id()).toBe('openai:gpt-5.5-2026-04-23');
      expect(DefaultWebSearchProvider.config).toEqual({
        tools: [{ type: 'web_search_preview' }],
      });
    });
  });
});
