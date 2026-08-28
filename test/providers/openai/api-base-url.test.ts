import { describe, expect, it, vi } from 'vitest';
import { normalizeOpenAiApiBaseUrl } from '../../../src/providers/openai/apiBaseUrl';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiGenericProvider } from '../../../src/providers/openai/index';
import { PerplexityProvider } from '../../../src/providers/perplexity';
import { TrueFoundryProvider } from '../../../src/providers/truefoundry';

vi.mock('../../../src/envars', async (importOriginal) => ({
  ...(await importOriginal()),
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

  it('normalizes OpenAI chat requests by default and allows derived providers to opt out', () => {
    const provider = new OpenAiChatCompletionProvider('test-model', {
      config: { apiBaseUrl: 'https://api.pzero.studio' },
    });

    expect((provider as any).shouldNormalizeApiBaseUrl()).toBe(true);
    expect((new PerplexityProvider('sonar') as any).shouldNormalizeApiBaseUrl()).toBe(false);
    expect((new TrueFoundryProvider('openai/gpt-4') as any).shouldNormalizeApiBaseUrl()).toBe(
      false,
    );
  });
});
