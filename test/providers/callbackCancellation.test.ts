import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureGenericProvider } from '../../src/providers/azure/generic';
import { GoogleAuthManager } from '../../src/providers/google/auth';
import { GoogleProvider } from '../../src/providers/google/provider';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createDeferred } from '../util/utils';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
  getCache: () => ({ get: vi.fn(), set: vi.fn() }),
}));
vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  getGoogleClient: async () => ({ client: { request: mocks.request } }),
  loadCredentials: async () => undefined,
  resolveProjectId: async () => 'fixture-project',
}));
vi.mock('../../src/logger');

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  mocks.request.mockReset();
  vi.spyOn(AzureGenericProvider.prototype, 'getAuthHeaders').mockResolvedValue({
    'api-key': 'fixture-key',
  });
  vi.spyOn(GoogleAuthManager, 'getApiKey').mockReturnValue({ apiKey: undefined, source: 'none' });
  vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
    client: { request: mocks.request },
    projectId: 'fixture-project',
  } as never);
  vi.spyOn(GoogleAuthManager, 'resolveProjectId').mockResolvedValue('fixture-project');
});
afterEach(() => vi.restoreAllMocks());

const providers = [
  ['OpenAI', OpenAiChatCompletionProvider, 'gpt-4o'],
  ['Azure', AzureChatCompletionProvider, 'gpt-4o'],
  ['Google', GoogleProvider, 'gemini-2.5-flash'],
  ['Vertex', VertexChatProvider, 'gemini-2.5-flash'],
] as const;

describe.each(providers)('%s callback cancellation', (_name, Provider, model) => {
  it('retains completed output and billing when a callback is cancelled', async () => {
    const started = createDeferred<void>();
    const callback = createDeferred<string>();
    const controller = new AbortController();
    const provider = new Provider(model, {
      config: {
        apiKey: _name === 'OpenAI' || _name === 'Azure' ? 'fixture-key' : undefined,
        apiHost: 'fixture.invalid',
        vertexai: true,
        projectId: 'fixture-project',
        modelName: 'gpt-4o',
        cost: 0.001,
        functionToolCallbacks: {
          tool: () => {
            started.resolve();
            return callback.promise;
          },
        },
      },
    });
    const data = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'tool', arguments: '{}' } },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 },
      candidates: [
        {
          content: { role: 'model', parts: [{ functionCall: { name: 'tool', args: {} } }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4, totalTokenCount: 11 },
    };
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    mocks.request.mockResolvedValue({ data });
    const pending = provider
      .callApi('hello', undefined, { abortSignal: controller.signal })
      .catch((error: unknown) => ({ error: String(error) }));
    try {
      await Promise.race([
        started.promise,
        pending.then(() => {
          throw new Error('Callback was not invoked');
        }),
      ]);
      controller.abort(new Error('cancelled billed callback'));
      const result = await pending;
      expect(result).toMatchObject({ tokenUsage: { total: 11 } });
      expect('cost' in result && result.cost).toBeGreaterThan(0);
      expect(result.error).toContain('cancelled billed callback');
      expect('output' in result && result.output).toBeTruthy();
    } finally {
      controller.abort();
      callback.resolve('late result');
      await provider.cleanup?.();
    }
  });
});
