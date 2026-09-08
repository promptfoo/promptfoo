import { beforeEach, describe, expect, it, vi } from 'vitest';

// `nscale.test.ts` mocks `src/providers/openai` wholesale, so it can only assert
// the shape of the config object handed to the OpenAI provider — never what is
// actually put on the wire. These tests mock only the transport, exercising the
// real OpenAI provider, because the defects they guard against were invisible at
// the config layer: the config looked correct while the request body carried the
// service token and the user's headers.
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  fetchWithCache: vi.fn(),
}));

import { fetchWithCache } from '../../src/cache';
import { createNscaleProvider } from '../../src/providers/nscale';

function mockResponse() {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: {
      choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  } as any);
}

async function callWithConfig(config: Record<string, unknown>) {
  mockResponse();
  const provider = createNscaleProvider('nscale:openai/gpt-oss-120b', {
    config: { config } as any,
  });
  await provider.callApi('hello');
  const [url, request] = vi.mocked(fetchWithCache).mock.calls[0] as any;
  return { url, headers: request.headers, body: JSON.parse(request.body) };
}

describe('Nscale request construction', () => {
  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
  });

  it('does not send the service token in the request body', async () => {
    // Regression: `passthrough: { ...config }` spread the whole user config into
    // the body, so a configured `apiKey` was transmitted as a model parameter and
    // persisted in the request payload alongside the Authorization header.
    const { body, headers } = await callWithConfig({ apiKey: 'SERVICE-TOKEN-SECRET' });

    expect(body).not.toHaveProperty('apiKey');
    expect(JSON.stringify(body)).not.toContain('SERVICE-TOKEN-SECRET');
    expect(headers.Authorization).toBe('Bearer SERVICE-TOKEN-SECRET');
  });

  it('applies configured headers as HTTP headers rather than body fields', async () => {
    // Regression: `headers` landed in `passthrough`, so custom headers were
    // serialized into the JSON body and silently never sent as headers.
    const { body, headers } = await callWithConfig({
      apiKey: 'tok',
      headers: { 'X-Tenant': 'acme' },
    });

    expect(headers).toHaveProperty('X-Tenant', 'acme');
    expect(body).not.toHaveProperty('headers');
  });

  it('honors a configured apiBaseUrl instead of shipping it in the body', async () => {
    // Regression: apiBaseUrl was ignored for routing (the endpoint was hardcoded)
    // yet still sent as a model parameter.
    const { url, body } = await callWithConfig({
      apiKey: 'tok',
      apiBaseUrl: 'https://private.nscale.example/v1',
    });

    expect(url).toBe('https://private.nscale.example/v1/chat/completions');
    expect(body).not.toHaveProperty('apiBaseUrl');
  });

  it('defaults to the public Nscale endpoint', async () => {
    const { url } = await callWithConfig({ apiKey: 'tok' });

    expect(url).toBe('https://inference.api.nscale.com/v1/chat/completions');
  });

  it('keeps forwarding genuine model parameters', async () => {
    const { body } = await callWithConfig({
      apiKey: 'tok',
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0.1,
      seed: 42,
      custom_param: 'value',
    });

    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      temperature: 0.7,
      top_p: 0.9,
      frequency_penalty: 0.1,
      seed: 42,
      custom_param: 'value',
    });
  });

  it('does not leak any promptfoo-level provider option into the body', async () => {
    const { body } = await callWithConfig({
      apiKey: 'tok',
      apiKeyEnvar: 'NSCALE_SERVICE_TOKEN',
      apiKeyRequired: true,
      apiHost: 'inference.api.nscale.com',
      organization: 'org-123',
      maxRetries: 2,
      cost: 0.000001,
      inputCost: 0.0000005,
      outputCost: 0.0000015,
    });

    for (const key of [
      'apiKey',
      'apiKeyEnvar',
      'apiKeyRequired',
      'apiHost',
      'apiBaseUrl',
      'organization',
      'maxRetries',
      'cost',
      'inputCost',
      'outputCost',
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('merges an explicit passthrough block without nesting it', async () => {
    const { body } = await callWithConfig({
      apiKey: 'tok',
      passthrough: { chat_template_kwargs: { thinking: true } },
    });

    expect(body).not.toHaveProperty('passthrough');
    expect(body.chat_template_kwargs).toEqual({ thinking: true });
  });
});
