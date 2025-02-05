import { describe, it, expect } from '@jest/globals';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
  DefaultGradingJsonProvider,
} from '../../../src/providers/openai/defaults';

describe('OpenAI default providers', () => {
  it('should use correct model versions', () => {
    expect(DefaultEmbeddingProvider.modelName).toBe('text-embedding-3-large');
    expect(DefaultGradingProvider.modelName).toBe('gpt-4o-2024-11-20');
    expect(DefaultGradingJsonProvider.modelName).toBe('gpt-4o-2024-11-20');
    expect(DefaultGradingJsonProvider.config).toEqual({
      response_format: { type: 'json_object' },
    });
  });
});
