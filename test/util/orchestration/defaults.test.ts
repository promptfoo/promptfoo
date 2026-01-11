import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_CONCURRENCY } from '../../../src/constants';
import { getDefaultConcurrency } from '../../../src/util/orchestration/defaults';

describe('getDefaultConcurrency', () => {
  it('returns DEFAULT_MAX_CONCURRENCY for all providers', () => {
    expect(getDefaultConcurrency('openai:gpt-4o')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('openai:gpt-3.5-turbo')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('anthropic:claude-3-opus-20240229')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('anthropic:claude-3-5-sonnet-20241022')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('azure:my-deployment')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('bedrock:anthropic.claude-3-sonnet')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('vertex:gemini-pro')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('groq:llama2-70b-4096')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('ollama:llama3')).toBe(DEFAULT_MAX_CONCURRENCY);
    expect(getDefaultConcurrency('unknown:model')).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it('returns 4 as the default concurrency value', () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(4);
    expect(getDefaultConcurrency('any:provider')).toBe(4);
  });
});
