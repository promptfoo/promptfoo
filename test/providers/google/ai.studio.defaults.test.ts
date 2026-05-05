import { describe, expect, it } from 'vitest';
import {
  AIStudioChatProvider,
  getGoogleAiStudioProviders,
} from '../../../src/providers/google/ai.studio';

describe('Google AI Studio Default Providers', () => {
  it('should create providers with correct model names', () => {
    const providers = getGoogleAiStudioProviders();
    expect(providers.gradingProvider.id()).toBe('google:gemini-2.5-pro');
    expect(providers.gradingJsonProvider.id()).toBe('google:gemini-2.5-pro');
    expect(providers.llmRubricProvider.id()).toBe('google:gemini-2.5-pro');
    expect(providers.suggestionsProvider.id()).toBe('google:gemini-2.5-pro');
    expect(providers.synthesizeProvider.id()).toBe('google:gemini-2.5-pro');
  });

  it('should create AIStudioChatProvider instances', () => {
    const providers = getGoogleAiStudioProviders();
    expect(providers.gradingProvider).toBeInstanceOf(AIStudioChatProvider);
    expect(providers.gradingJsonProvider).toBeInstanceOf(AIStudioChatProvider);
    expect(providers.llmRubricProvider).toBeInstanceOf(AIStudioChatProvider);
  });

  it('should configure JSON provider with correct response format', () => {
    const providers = getGoogleAiStudioProviders();
    expect(providers.gradingJsonProvider.config.generationConfig?.response_mime_type).toBe(
      'application/json',
    );
  });

  it('should not configure JSON response format for non-JSON providers', () => {
    const providers = getGoogleAiStudioProviders();
    expect(providers.gradingProvider.config.generationConfig?.response_mime_type).toBeUndefined();
    expect(providers.llmRubricProvider.config.generationConfig?.response_mime_type).toBeUndefined();
  });

  it('should share a single chat provider instance across grading/suggestions/synthesize', () => {
    const providers = getGoogleAiStudioProviders();
    expect(providers.suggestionsProvider).toBe(providers.gradingProvider);
    expect(providers.synthesizeProvider).toBe(providers.gradingProvider);
  });

  it('should return fresh provider instances on each call', () => {
    const a = getGoogleAiStudioProviders();
    const b = getGoogleAiStudioProviders();
    expect(b.gradingProvider).not.toBe(a.gradingProvider);
    expect(b.gradingJsonProvider).not.toBe(a.gradingJsonProvider);
    expect(b.llmRubricProvider).not.toBe(a.llmRubricProvider);
  });

  it('should propagate env overrides into provider api keys', () => {
    const providers = getGoogleAiStudioProviders({ GOOGLE_API_KEY: 'override-key' });
    expect(providers.gradingProvider.getApiKey()).toBe('override-key');
    expect(providers.gradingJsonProvider.getApiKey()).toBe('override-key');
    expect(providers.llmRubricProvider.getApiKey()).toBe('override-key');
  });
});
