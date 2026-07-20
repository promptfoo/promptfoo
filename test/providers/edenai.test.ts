import { describe, expect, it } from 'vitest';
import { createEdenAiProvider } from '../../src/providers/edenai';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

// The provider extends OpenAiChatCompletionProvider; the Eden AI-specific wiring
// (base URL, key resolution, id/routing) is what we assert here. The underlying
// HTTP behaviour is covered by the OpenAI provider's own tests.
function asChat(provider: ReturnType<typeof createEdenAiProvider>) {
  return provider as unknown as OpenAiChatCompletionProvider & {
    getApiUrl: () => string;
    getOrganization: () => unknown;
    toJSON: () => any;
  };
}

describe('createEdenAiProvider routing', () => {
  it('parses edenai:<vendor/model>', () => {
    const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini');
    expect(provider.id()).toBe('edenai:openai/gpt-4o-mini');
    expect(asChat(provider).modelName).toBe('openai/gpt-4o-mini');
  });

  it('parses edenai:chat:<vendor/model> to the same model', () => {
    const provider = createEdenAiProvider('edenai:chat:anthropic/claude-sonnet-4-5');
    expect(provider.id()).toBe('edenai:anthropic/claude-sonnet-4-5');
    expect(asChat(provider).modelName).toBe('anthropic/claude-sonnet-4-5');
  });

  it('falls back to the default model for a bare prefix', () => {
    expect(asChat(createEdenAiProvider('edenai:')).modelName).toBe('openai/gpt-4o-mini');
    expect(asChat(createEdenAiProvider('edenai:chat')).modelName).toBe('openai/gpt-4o-mini');
    expect(asChat(createEdenAiProvider('edenai:chat:')).modelName).toBe('openai/gpt-4o-mini');
  });
});

describe('EdenAiProvider configuration', () => {
  it('points at the Eden AI base URL and key envar by default', () => {
    const provider = asChat(createEdenAiProvider('edenai:openai/gpt-4o-mini'));
    expect(provider.config.apiBaseUrl).toBe('https://api.edenai.run/v3');
    expect(provider.config.apiKeyEnvar).toBe('EDENAI_API_KEY');
    expect(provider.getApiUrl()).toBe('https://api.edenai.run/v3');
  });

  it('lets the user override the base URL (e.g. the EU endpoint)', () => {
    const provider = asChat(
      createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: { apiBaseUrl: 'https://api.eu.edenai.run/v3' },
      }),
    );
    expect(provider.config.apiBaseUrl).toBe('https://api.eu.edenai.run/v3');
    expect(provider.getApiUrl()).toBe('https://api.eu.edenai.run/v3');
  });

  it('passes through standard OpenAI options without dropping them', () => {
    const provider = asChat(
      createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: { temperature: 0.2, max_tokens: 256 },
      }),
    );
    expect(provider.config.temperature).toBe(0.2);
    expect(provider.config.max_tokens).toBe(256);
  });

  it('reports itself as an Eden AI provider', () => {
    const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini');
    expect(provider.toString()).toBe('[Eden AI Provider openai/gpt-4o-mini]');
    expect(asChat(provider).toJSON()).toMatchObject({
      provider: 'edenai',
      model: 'openai/gpt-4o-mini',
    });
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = asChat(
      createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: { apiKey: 'sk-secret', temperature: 0.2 },
      }),
    );
    const json = provider.toJSON();
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toContain('sk-secret');
  });
});

describe('EdenAiProvider key resolution', () => {
  it('resolves apiKey from config', () => {
    const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini', {
      config: { apiKey: 'sk-from-config' },
    });
    expect((provider as any).getApiKey()).toBe('sk-from-config');
  });

  it('resolves apiKey from the EDENAI_API_KEY env var', () => {
    const restore = mockProcessEnv({ EDENAI_API_KEY: 'sk-from-env' });
    try {
      const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini');
      expect((provider as any).getApiKey()).toBe('sk-from-env');
    } finally {
      restore();
    }
  });

  it('does NOT fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
    const restore = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
    });
    try {
      const provider = asChat(createEdenAiProvider('edenai:openai/gpt-4o-mini'));
      expect((provider as any).getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('honours a custom apiKeyEnvar', () => {
    const restore = mockProcessEnv({ CUSTOM_EDENAI_KEY: 'sk-custom' });
    try {
      const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: { apiKeyEnvar: 'CUSTOM_EDENAI_KEY' },
      });
      expect((provider as any).getApiKey()).toBe('sk-custom');
    } finally {
      restore();
    }
  });
});
