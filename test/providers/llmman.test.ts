import { describe, expect, it } from 'vitest';
import { createLlmmanProvider, LlmmanProvider } from '../../src/providers/llmman';

const LLMMAN_API_BASE = 'http://localhost:17434/v1';

describe('llmman', () => {
  it('defaults to the llmman port', () => {
    const provider = new LlmmanProvider('qwen3.8');
    expect(provider.config.apiBaseUrl).toBe(LLMMAN_API_BASE);
  });

  it('respects an explicit apiBaseUrl', () => {
    const provider = new LlmmanProvider('qwen3.8', {
      config: { apiBaseUrl: 'http://192.168.1.10:17434/v1' },
    });
    expect(provider.config.apiBaseUrl).toBe('http://192.168.1.10:17434/v1');
  });

  it('supplies a placeholder key, since llmman is unauthenticated by default', () => {
    const provider = new LlmmanProvider('qwen3.8');
    expect(provider.config.apiKey).toBe('llmman');
  });

  it('does not override a user-supplied key', () => {
    const provider = new LlmmanProvider('qwen3.8', { config: { apiKey: 'secret' } });
    expect(provider.config.apiKey).toBe('secret');
  });

  it('builds an id from the model name', () => {
    expect(new LlmmanProvider('qwen3.8').id()).toBe('llmman:qwen3.8');
  });

  it('keeps colons in model names when parsing the provider path', () => {
    const provider = createLlmmanProvider('llmman:qwen3.8:q4');
    expect(provider.id()).toBe('llmman:qwen3.8:q4');
  });

  it('redacts the api key in toJSON', () => {
    const json = new LlmmanProvider('qwen3.8', { config: { apiKey: 'secret' } }).toJSON();
    expect(json.config.apiKey).toBeUndefined();
    expect(json.provider).toBe('llmman');
  });
});
