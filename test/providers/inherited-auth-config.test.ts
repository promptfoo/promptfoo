import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { createCerebrasProvider } from '../../src/providers/cerebras';
import { CometApiImageProvider } from '../../src/providers/cometapi';
import { HeliconeGatewayProvider } from '../../src/providers/helicone';
import { NscaleImageProvider } from '../../src/providers/nscale/image';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  restoreEnv = mockProcessEnv({
    CEREBRAS_API_KEY: 'cerebras-fixture',
    NSCALE_SERVICE_TOKEN: 'process-nscale',
    NSCALE_API_KEY: 'legacy-nscale',
    COMETAPI_KEY: 'process-comet',
    HELICONE_API_KEY: 'process-helicone',
    OPENAI_API_KEY: 'unrelated-openai',
    OPENAI_ORGANIZATION: 'unrelated-org',
    OPENAI_API_BASE_URL: 'https://unrelated.invalid/v1',
  });
});
afterEach(() => restoreEnv());

function reply(data: unknown, cached = false, status = 200) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    cached,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    headers: {},
  });
}

const chatReply = {
  choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
};
const imageReply = { data: [{ url: 'https://example.invalid/fixture.png' }] };

function firstRequest() {
  const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
  if (!request) {
    throw new Error('Expected a provider request');
  }
  return { url, headers: request.headers, body: JSON.parse(request.body as string) };
}

describe('Cerebras organization isolation', () => {
  it('excludes scoped and process OpenAI organization defaults from requests', async () => {
    reply(chatReply);
    const provider = createCerebrasProvider('cerebras:custom:model', {
      id: 'cerebras-fixture',
      env: { OPENAI_ORGANIZATION: 'scoped-unrelated-org' },
    });
    const result = await provider.callApi('Hello');
    expect(provider.id()).toBe('cerebras-fixture');
    expect(result).toMatchObject({
      output: 'Hello',
      tokenUsage: { prompt: 5, completion: 2, total: 7 },
    });
    expect(firstRequest().headers).not.toHaveProperty('OpenAI-Organization');
    expect(firstRequest().body.model).toBe('custom:model');
  });

  it('keeps explicit request header overrides', () => {
    const provider = createCerebrasProvider(
      'cerebras:custom:model',
    ) as OpenAiChatCompletionProvider;
    expect(provider.getOpenAiRequestHeaders({ 'OpenAI-Organization': 'explicit-org' })).toEqual({
      'OpenAI-Organization': 'explicit-org',
    });
  });

  it('preserves upstream errors', async () => {
    reply({ error: { message: 'Fixture unavailable' } });
    expect((await createCerebrasProvider('cerebras:custom').callApi('Hello')).error).toContain(
      'Fixture unavailable',
    );
  });
});

describe('Nscale image resolved configuration', () => {
  it.each([undefined, 'explicit-key'])(
    'preserves scoped credentials and explicit key %s',
    async (apiKey) => {
      reply(imageReply);
      const provider = new NscaleImageProvider('private/image:model', {
        id: 'nscale-fixture',
        env: { NSCALE_SERVICE_TOKEN: 'scoped-nscale' },
        config: {
          apiKey,
          apiBaseUrl: 'http://127.0.0.1:9000/v1',
          size: '512x512',
          response_format: 'url',
          headers: { 'X-Fixture': 'yes' },
        },
      });
      const result = await provider.callApi('A blue square');
      expect(provider.id()).toBe('nscale-fixture');
      expect(result.output).toContain('https://example.invalid/fixture.png');
      expect(result.cached).toBe(false);
      expect(firstRequest()).toMatchObject({
        url: 'http://127.0.0.1:9000/v1/images/generations',
        headers: { Authorization: `Bearer ${apiKey ?? 'scoped-nscale'}`, 'X-Fixture': 'yes' },
        body: { model: 'private/image:model', size: '512x512', n: 1, response_format: 'url' },
      });
    },
  );

  it('keeps its service endpoint and default image format despite OpenAI environment settings', async () => {
    reply({ data: [{ b64_json: 'Zml4dHVyZQ==' }] }, true);
    const result = await new NscaleImageProvider('private/image:model').callApi('A blue square');
    expect(firstRequest()).toMatchObject({
      url: 'https://inference.api.nscale.com/v1/images/generations',
      headers: { Authorization: 'Bearer process-nscale' },
      body: { response_format: 'b64_json' },
    });
    expect(result).toMatchObject({ cached: true, cost: 0, isBase64: true, format: 'json' });
  });

  it('preserves HTTP errors', async () => {
    reply({ error: 'Fixture unavailable' }, false, 400);
    expect(
      (await new NscaleImageProvider('private/image:model').callApi('A square')).error,
    ).toContain('400 Bad Request');
  });
});

describe('Gateway scoped credentials', () => {
  it.each([undefined, 'explicit-key'])(
    'uses Comet scoped credentials and explicit key %s',
    async (apiKey) => {
      reply(imageReply);
      const provider = new CometApiImageProvider('private/image:model', {
        id: 'comet-fixture',
        env: { COMETAPI_KEY: 'scoped-comet' },
        config: { apiKey },
      });
      const result = await provider.callApi('A blue square');
      expect(provider.id()).toBe('comet-fixture');
      expect(result.output).toContain('https://example.invalid/fixture.png');
      expect(firstRequest()).toMatchObject({
        url: 'https://api.cometapi.com/v1/images/generations',
        headers: { Authorization: `Bearer ${apiKey ?? 'scoped-comet'}` },
      });
    },
  );

  it('preserves Comet process credentials and API errors', async () => {
    reply({ error: { message: 'Fixture unavailable' } });
    const result = await new CometApiImageProvider('private/image:model').callApi('A square');
    expect(firstRequest().headers).toMatchObject({ Authorization: 'Bearer process-comet' });
    expect(result.error).toContain('Fixture unavailable');
  });

  it.each([undefined, 'explicit-key'])(
    'uses Helicone scoped credentials and explicit key %s',
    async (apiKey) => {
      reply(chatReply);
      const provider = new HeliconeGatewayProvider('private/model:tag', {
        id: 'helicone-fixture',
        env: { HELICONE_API_KEY: 'scoped-helicone' },
        config: { apiKey, baseUrl: 'http://127.0.0.1:9000', router: 'fixture' },
      });
      const result = await provider.callApi('Hello');
      expect(provider.id()).toBe('helicone-fixture');
      expect(result).toMatchObject({
        output: 'Hello',
        tokenUsage: { prompt: 5, completion: 2, total: 7 },
      });
      expect(firstRequest()).toMatchObject({
        url: 'http://127.0.0.1:9000/router/fixture/chat/completions',
        headers: { Authorization: `Bearer ${apiKey ?? 'scoped-helicone'}` },
        body: { model: 'private/model:tag' },
      });
    },
  );

  it('preserves Helicone process credentials and errors', async () => {
    reply({ error: { message: 'Fixture unavailable' } });
    const result = await new HeliconeGatewayProvider('private/model').callApi('Hello');
    expect(firstRequest().headers).toMatchObject({ Authorization: 'Bearer process-helicone' });
    expect(result.error).toContain('Fixture unavailable');
  });

  it('keeps the Helicone placeholder when no Helicone credential is set', () => {
    const restore = mockProcessEnv({ HELICONE_API_KEY: undefined });
    try {
      expect(new HeliconeGatewayProvider('private/model').getApiKey()).toBe('placeholder-api-key');
    } finally {
      restore();
    }
  });
});
