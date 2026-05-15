import { describe, expect, it } from 'vitest';
import {
  getGoogleVertexEmbeddingProvider,
  getGoogleVertexProviders,
  VertexChatProvider,
  VertexEmbeddingProvider,
} from '../../../src/providers/google/vertex';

describe('Google Vertex default providers', () => {
  it('should create providers with correct model names', () => {
    const providers = getGoogleVertexProviders();
    expect(providers.embeddingProvider.modelName).toBe('gemini-embedding-001');
    expect(providers.embeddingProvider.id()).toBe('vertex:gemini-embedding-001');
    expect(providers.gradingProvider.modelName).toBe('gemini-2.5-pro');
    expect(providers.gradingProvider.id()).toBe('vertex:gemini-2.5-pro');
  });

  it('should create correct provider instances', () => {
    const providers = getGoogleVertexProviders();
    expect(providers.embeddingProvider).toBeInstanceOf(VertexEmbeddingProvider);
    expect(providers.gradingProvider).toBeInstanceOf(VertexChatProvider);
  });

  it('should share a single chat provider instance across grading roles', () => {
    const providers = getGoogleVertexProviders();
    expect(providers.gradingJsonProvider).toBe(providers.gradingProvider);
    expect(providers.suggestionsProvider).toBe(providers.gradingProvider);
    expect(providers.synthesizeProvider).toBe(providers.gradingProvider);
  });

  it('should return fresh provider instances on each call', () => {
    const a = getGoogleVertexProviders();
    const b = getGoogleVertexProviders();
    expect(b.gradingProvider).not.toBe(a.gradingProvider);
    expect(b.embeddingProvider).not.toBe(a.embeddingProvider);
  });
});

describe('getGoogleVertexEmbeddingProvider', () => {
  it('should return a VertexEmbeddingProvider with the default model', () => {
    const embedding = getGoogleVertexEmbeddingProvider();
    expect(embedding).toBeInstanceOf(VertexEmbeddingProvider);
    expect(embedding.modelName).toBe('gemini-embedding-001');
  });

  it('should return fresh instances on each call', () => {
    expect(getGoogleVertexEmbeddingProvider()).not.toBe(getGoogleVertexEmbeddingProvider());
  });
});
