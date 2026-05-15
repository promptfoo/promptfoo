import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiClient,
  isSdkUploadCapabilityProbe,
} from '../../../src/providers/openai/client';

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

describe('isSdkUploadCapabilityProbe', () => {
  it('matches the SDK data: probe in its current form', () => {
    expect(isSdkUploadCapabilityProbe('data:,')).toBe(true);
  });

  it('matches data: URLs with payloads so future SDK probe variants still bypass cache', () => {
    expect(isSdkUploadCapabilityProbe('data:text/plain;base64,SGVsbG8=')).toBe(true);
    expect(isSdkUploadCapabilityProbe('data:application/json,%7B%7D')).toBe(true);
  });

  it('does not match regular HTTP URLs', () => {
    expect(isSdkUploadCapabilityProbe('https://api.openai.com/v1/chat/completions')).toBe(false);
    expect(isSdkUploadCapabilityProbe('http://localhost:8080/v1/responses')).toBe(false);
  });
});
