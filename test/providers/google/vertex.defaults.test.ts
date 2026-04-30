import { describe, expect, it } from 'vitest';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
} from '../../../src/providers/google/vertex';

describe('Google Vertex default providers', () => {
  describe('DefaultEmbeddingProvider', () => {
    it('should use the current Gemini embedding model', () => {
      expect(DefaultEmbeddingProvider.modelName).toBe('gemini-embedding-001');
      expect(DefaultEmbeddingProvider.id()).toBe('vertex:gemini-embedding-001');
    });
  });

  describe('DefaultGradingProvider', () => {
    it('should use the current Gemini grading model', () => {
      expect(DefaultGradingProvider.modelName).toBe('gemini-2.5-pro');
      expect(DefaultGradingProvider.id()).toBe('vertex:gemini-2.5-pro');
    });
  });
});
