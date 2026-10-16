import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableCache } from '../../../src/cache';
import { OpenAiAssistantProvider } from '../../../src/providers/openai/assistant';

// This file deliberately does NOT `vi.mock('openai')`. The Assistants provider is the one
// OpenAI path that builds a real SDK client, and the SDK injects `OpenAI-Organization`
// from its `organization` client option in a header layer *beneath* `defaultHeaders`.
// A mocked constructor cannot observe that layering, so suppression has to be asserted
// against the headers that actually reach the wire.
describe('OpenAiAssistantProvider organization header on the wire', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function captureRequestHeaders(
    provider: OpenAiAssistantProvider,
  ): Promise<Record<string, string>> {
    const captured: Record<string, string>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { headers?: HeadersInit }) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => {
          headers[key] = value;
        });
        captured.push(headers);
        return new Response(
          JSON.stringify({ id: 'run_1', thread_id: 'thread_1', status: 'completed' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    disableCache();
    await provider.callApi('Test prompt').catch(() => undefined);

    expect(captured.length).toBeGreaterThan(0);
    return captured[0];
  }

  it('does not send an ambient OPENAI_ORGANIZATION to a custom endpoint', async () => {
    const provider = new OpenAiAssistantProvider('asst_1', {
      config: { apiKey: 'test-key', apiBaseUrl: 'https://gateway.example.com/v1' },
      env: { OPENAI_ORGANIZATION: 'env-org' },
    });

    expect(provider.getOpenAiRequestHeaders()).not.toHaveProperty('OpenAI-Organization');

    const headers = await captureRequestHeaders(provider);
    expect(headers['openai-organization']).toBeUndefined();
  });

  it('sends an explicitly configured organization to a custom endpoint', async () => {
    const provider = new OpenAiAssistantProvider('asst_1', {
      config: {
        apiKey: 'test-key',
        apiBaseUrl: 'https://gateway.example.com/v1',
        organization: 'explicit-org',
      },
    });

    const headers = await captureRequestHeaders(provider);
    expect(headers['openai-organization']).toBe('explicit-org');
  });

  it('sends the organization to api.openai.com', async () => {
    const provider = new OpenAiAssistantProvider('asst_1', {
      config: { apiKey: 'test-key' },
      env: { OPENAI_ORGANIZATION: 'env-org' },
    });

    const headers = await captureRequestHeaders(provider);
    expect(headers['openai-organization']).toBe('env-org');
  });

  it('lets a case-variant header override beat the SDK organization option', async () => {
    const provider = new OpenAiAssistantProvider('asst_1', {
      config: {
        apiKey: 'test-key',
        organization: 'config-org',
        headers: { 'openai-organization': 'custom-org' },
      },
    });

    const headers = await captureRequestHeaders(provider);
    expect(headers['openai-organization']).toBe('custom-org');
  });
});
