import { once } from 'node:events';
import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { createEdenAiProvider } from '../../src/providers/edenai';
import { sanitizeConfigForOutput } from '../../src/util/sanitizer';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

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

  it('fails fast on unsupported non-chat subtypes', () => {
    expect(() => createEdenAiProvider('edenai:embeddings:openai/text-embedding-3-small')).toThrow(
      /only supports chat completions/,
    );
    expect(() => createEdenAiProvider('edenai:responses:openai/gpt-4o-mini')).toThrow(
      /only supports chat completions/,
    );
    expect(() => createEdenAiProvider('edenai:messages:anthropic/claude-sonnet-4-5')).toThrow(
      /only supports chat completions/,
    );
  });
});

describe('EdenAiProvider cost', () => {
  it('uses the cost returned by Eden AI when present', () => {
    const provider = createEdenAiProvider('edenai:anthropic/claude-sonnet-4-5') as any;
    const cost = provider.calculateResponseCost(
      { cost: 0.0123, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      {},
      false,
    );
    expect(cost).toBe(0.0123);
  });

  it('preserves the reported Eden AI cost on cache hits', () => {
    const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini') as any;
    const cost = provider.calculateResponseCost(
      { cost: 0.0123, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      {},
      true,
    );
    expect(cost).toBe(0.0123);
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

  it('does not serialize credentials from configuration or headers', () => {
    const provider = asChat(
      createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: {
          apiKey: 'fixture-secret',
          headers: { Authorization: 'Bearer fixture-auth', 'X-Api-Key': 'fixture-header' },
          temperature: 0.2,
        },
      }),
    );
    const json = provider.toJSON();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toMatch(/fixture-(secret|auth|header)/);
  });

  it('preserves nested tool schemas when sanitizing provider output', () => {
    const parameters = {
      type: 'object' as const,
      properties: { city: { type: 'string' } },
      required: ['city'],
    };
    const providerConfig = {
      id: 'edenai:openai/gpt-4o-mini',
      config: { tools: [{ type: 'function' as const, function: { name: 'weather', parameters } }] },
    };
    const provider = createEdenAiProvider(providerConfig.id, providerConfig);
    const expected = { config: { tools: [{ function: { parameters } }] } };
    expect(asChat(provider).toJSON()).toMatchObject(expected);
    expect(sanitizeConfigForOutput({ providers: [providerConfig] }).providers).toMatchObject([
      expected,
    ]);
  });

  it('rejects streaming instead of silently dropping it', () => {
    expect(() =>
      createEdenAiProvider('edenai:openai/gpt-4o-mini', { config: { stream: true } }),
    ).toThrow(/only supports non-streaming/);
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
      EDENAI_API_KEY: undefined,
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

describe('Eden AI HTTP contract', () => {
  it('sends a single request across a cache replay, retains cost, and handles HTTP errors', async () => {
    const requests: Array<{
      url?: string;
      authorization?: string;
      organization?: string;
      model: string;
    }> = [];
    const server = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
      }
      const body = JSON.parse(raw);
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        organization: req.headers['openai-organization'] as string | undefined,
        model: body.model,
      });
      res.setHeader('content-type', 'application/json');
      if (body.messages[0].content === 'invalid fixture') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: { message: 'fixture rejected input' } }));
        return;
      }
      res.end(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: 'fixture response' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          cost: 0.0123,
        }),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const restoreProxy = mockProcessEnv({ no_proxy: '127.0.0.1', NO_PROXY: '127.0.0.1' });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Fixture did not bind a TCP address');
      }
      const provider = createEdenAiProvider('edenai:openai/gpt-4o-mini', {
        config: { apiKey: 'fixture-key', apiBaseUrl: `http://127.0.0.1:${address.port}/v3` },
      });
      await withCacheEnabled(true, async () => {
        const response = await provider.callApi('fixture prompt');
        expect(response).toMatchObject({
          output: 'fixture response',
          cost: 0.0123,
          tokenUsage: { prompt: 3, completion: 1, total: 4 },
        });
        const repeated = await provider.callApi('fixture prompt');
        expect(repeated.cached).toBe(true);
        expect(repeated.cost).toBe(response.cost);
      });
      expect((await provider.callApi('invalid fixture')).error).toContain('fixture rejected input');
      expect(requests).toHaveLength(2);
      expect(requests[0]).toEqual({
        url: '/v3/chat/completions',
        authorization: 'Bearer fixture-key',
        organization: undefined,
        model: 'openai/gpt-4o-mini',
      });
    } finally {
      restoreProxy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
