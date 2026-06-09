import { describe, expect, it } from 'vitest';
import { createMoonshotProvider } from '../../src/providers/moonshot';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

// The provider extends OpenAiChatCompletionProvider; we only assert the
// Moonshot-specific wiring (routing, base URL, key envar, identity). The
// underlying HTTP behaviour is covered by the OpenAI provider's own tests.
function asChat(provider: ReturnType<typeof createMoonshotProvider>) {
  return provider as unknown as OpenAiChatCompletionProvider;
}

describe('createMoonshotProvider', () => {
  it('parses moonshot:<model>', () => {
    const provider = createMoonshotProvider('moonshot:kimi-k2-0711-preview');
    expect(provider.id()).toBe('moonshot:kimi-k2-0711-preview');
    expect(asChat(provider).modelName).toBe('kimi-k2-0711-preview');
  });

  it('parses moonshot:chat:<model> to the same model', () => {
    const provider = createMoonshotProvider('moonshot:chat:kimi-k2-0711-preview');
    expect(provider.id()).toBe('moonshot:kimi-k2-0711-preview');
    expect(asChat(provider).modelName).toBe('kimi-k2-0711-preview');
  });

  it('preserves colons inside the model id', () => {
    const provider = createMoonshotProvider('moonshot:kimi-k2.6');
    expect(asChat(provider).modelName).toBe('kimi-k2.6');
  });

  it('points at the Moonshot base URL and key envar', () => {
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k');
    expect(asChat(provider).config.apiBaseUrl).toBe('https://api.moonshot.ai/v1');
    expect(asChat(provider).config.apiKeyEnvar).toBe('MOONSHOT_API_KEY');
  });

  it('passes through config without dropping standard OpenAI options', () => {
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { config: { temperature: 0.2, max_tokens: 256 } },
    });
    expect(asChat(provider).config.temperature).toBe(0.2);
    expect(asChat(provider).config.max_tokens).toBe(256);
  });

  it('reports itself as a Moonshot provider', () => {
    const provider = createMoonshotProvider('moonshot:kimi-latest');
    expect(provider.toString()).toBe('[Moonshot Provider kimi-latest]');
    expect((provider as any).toJSON()).toMatchObject({
      provider: 'moonshot',
      model: 'kimi-latest',
    });
  });
});
