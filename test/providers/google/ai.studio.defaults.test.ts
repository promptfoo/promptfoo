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
});
