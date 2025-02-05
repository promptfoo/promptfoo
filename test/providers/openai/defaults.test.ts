import { describe, it, expect } from '@jest/globals';
import {
  DefaultEmbeddingProvider,
  DefaultGradingProvider,
  DefaultGradingJsonProvider,
} from '../../../src/providers/openai/defaults';

describe('OpenAI default providers', () => {
  it('should use correct model versions', () => {
    // Check embedding model version
    expect(DefaultEmbeddingProvider.modelName).toBe('text-embedding-3-large');

    // Check grading provider model version
    expect(DefaultGradingProvider.modelName).toBe('gpt-4o-2024-11-20');

    // Check grading JSON provider model version and config
    expect(DefaultGradingJsonProvider.modelName).toBe('gpt-4o-2024-11-20');
    expect(DefaultGradingJsonProvider.config).toEqual({
      response_format: { type: 'json_object' },
    });
  });
});
