import { describe, expect, it } from 'vitest';
import {
  DefaultGradingJsonProvider,
  DefaultGradingProvider,
  DefaultLlmRubricProvider,
  DefaultSuggestionsProvider,
  DefaultSynthesizeProvider,
} from '../../../src/providers/google/ai.studio';

describe('Google AI Studio Default Providers', () => {
  it('should have correct model names', () => {
    expect(DefaultGradingProvider.id()).toBe('google:gemini-2.5-pro');
    expect(DefaultGradingJsonProvider.id()).toBe('google:gemini-2.5-pro');
    expect(DefaultLlmRubricProvider.id()).toBe('google:gemini-2.5-pro');
    expect(DefaultSuggestionsProvider.id()).toBe('google:gemini-2.5-pro');
    expect(DefaultSynthesizeProvider.id()).toBe('google:gemini-2.5-pro');
  });

  it('should use gemini-2.5-pro as the default model', () => {
    expect(DefaultGradingProvider.modelName).toBe('gemini-2.5-pro');
    expect(DefaultGradingJsonProvider.modelName).toBe('gemini-2.5-pro');
    expect(DefaultLlmRubricProvider.modelName).toBe('gemini-2.5-pro');
    expect(DefaultSuggestionsProvider.modelName).toBe('gemini-2.5-pro');
    expect(DefaultSynthesizeProvider.modelName).toBe('gemini-2.5-pro');
  });

  it('should configure JSON provider with correct response format', () => {
    expect(DefaultGradingJsonProvider.config.generationConfig?.response_mime_type).toBe(
      'application/json',
    );
  });

  it('should not configure JSON response format for non-JSON providers', () => {
    expect(DefaultGradingProvider.config.generationConfig?.response_mime_type).toBeUndefined();
    expect(DefaultLlmRubricProvider.config.generationConfig?.response_mime_type).toBeUndefined();
    expect(DefaultSuggestionsProvider.config.generationConfig?.response_mime_type).toBeUndefined();
    expect(DefaultSynthesizeProvider.config.generationConfig?.response_mime_type).toBeUndefined();
  });
});
