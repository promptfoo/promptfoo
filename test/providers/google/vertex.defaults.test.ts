import { describe, expect, it } from 'vitest';
import {
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
});
