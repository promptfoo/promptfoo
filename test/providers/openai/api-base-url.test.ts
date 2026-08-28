import { describe, expect, it, vi } from 'vitest';
import { normalizeOpenAiApiBaseUrl } from '../../../src/providers/openai/apiBaseUrl';
import { OpenAiGenericProvider } from '../../../src/providers/openai/index';

vi.mock('../../../src/envars', () => ({
  getEnvString: () => undefined,
}));

describe('normalizeOpenAiApiBaseUrl', () => {
  it('adds the OpenAI-compatible v1 path to an origin-only base URL', () => {
    expect(normalizeOpenAiApiBaseUrl('https://api.pzero.studio')).toBe(
      'https://api.pzero.studio/v1',
    );
  });

  it('preserves an explicitly configured API path', () => {
    expect(normalizeOpenAiApiBaseUrl('https://custom.api.com/openai')).toBe(
      'https://custom.api.com/openai',
    );
  });

  it('preserves the provider base URL for request-specific normalization', () => {
    const provider = new OpenAiGenericProvider('test-model', {
      config: { apiBaseUrl: 'https://api.pzero.studio' },
    });

    expect(provider.getApiUrl()).toBe('https://api.pzero.studio');
  });
});
