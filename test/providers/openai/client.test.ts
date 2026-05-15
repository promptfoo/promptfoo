import { describe, expect, it, vi } from 'vitest';
import { createOpenAiClient } from '../../../src/providers/openai/client';

describe('createOpenAiClient', () => {
  it('disables SDK retries by default', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });

    expect(client.maxRetries).toBe(0);
  });

  it('preserves explicit SDK retry overrides', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 3,
    });

    expect(client.maxRetries).toBe(3);
  });

  it('preserves caller Authorization headers when missing API keys are allowed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createOpenAiClient({
      allowMissingApiKey: true,
      baseURL: 'https://gateway.example.com/v1',
      fetch: fetchMock as typeof globalThis.fetch,
      headers: {
        Authorization: 'Bearer gateway-token',
      },
    });

    await client.models.list();

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer gateway-token');
  });
});
