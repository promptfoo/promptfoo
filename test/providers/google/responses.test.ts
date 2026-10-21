import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import { VertexResponsesProvider } from '../../../src/providers/google/responses';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Vertex Responses', () => {
  let restoreEnv: () => void;
  const getRequestHeaders = vi.fn();
  const response = {
    id: 'resp_vertex',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Hello from Google Cloud' }],
      },
    ],
    usage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      GOOGLE_CLOUD_PROJECT: undefined,
      GOOGLE_PROJECT_ID: undefined,
      VERTEX_PROJECT_ID: undefined,
      VERTEX_REGION: undefined,
      GOOGLE_CLOUD_LOCATION: undefined,
      OPENAI_API_KEY: 'unrelated-openai-key',
      OPENAI_API_HOST: 'unrelated.example',
      OPENAI_API_BASE_URL: 'https://unrelated.example/v1',
      OPENAI_ORGANIZATION: 'unrelated-org',
    });
    getRequestHeaders.mockResolvedValue(
      new Headers({ Authorization: 'Bearer google-token', 'x-goog-user-project': 'quota-project' }),
    );
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
      client: { getRequestHeaders },
      projectId: 'credential-project',
    });
    vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(response));
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('uses the publisher Responses endpoint and preserves reasoning, tools, and usage', async () => {
    const tools = [
      { type: 'function' as const, name: 'lookup', parameters: { type: 'object', properties: {} } },
    ];
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: {
        projectId: 'customer-project',
        max_output_tokens: 100,
        reasoning: { effort: 'low' },
        store: false,
        tools,
      },
    });

    const result = await provider.callApi('Hello');

    expect(result).toMatchObject({
      output: 'Hello from Google Cloud',
      tokenUsage: { prompt: 12, completion: 6, total: 18 },
    });
    expect(result.cost).toBeUndefined();
    const [url, , , , bustCache] = vi.mocked(fetchWithCache).mock.calls[0];
    const request = vi.mocked(fetchWithCache).mock.calls[0][1]!;
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/customer-project/locations/global/publishers/openai/v1/responses',
    );
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: 'gpt-6-luna',
      input: 'Hello',
      max_output_tokens: 100,
      reasoning: { effort: 'low' },
      store: false,
      tools,
    });
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.getAuthHeaders).toEqual(expect.any(Function));
    expect(bustCache).toBe(true);
    expect(provider.id()).toBe('vertex:responses:gpt-6-luna');
  });

  it('refreshes Google auth for each HTTP attempt and preserves quota-project headers', async () => {
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: { projectId: 'customer-project', keyFilename: '/credentials/service-account.json' },
    });
    await provider.callApi('Hello');
    const authenticate = vi.mocked(fetchWithCache).mock.calls[0][1]!.getAuthHeaders!;

    expect(Object.fromEntries(new Headers(await authenticate()))).toEqual({
      authorization: 'Bearer google-token',
      'x-goog-user-project': 'quota-project',
    });
    getRequestHeaders.mockResolvedValue(new Headers({ Authorization: 'Bearer refreshed-token' }));
    expect(new Headers(await authenticate()).get('authorization')).toBe('Bearer refreshed-token');
    expect(GoogleAuthManager.getOAuthClient).toHaveBeenCalledTimes(1);
    expect(GoogleAuthManager.getOAuthClient).toHaveBeenCalledWith(
      expect.objectContaining({ keyFilename: '/credentials/service-account.json' }),
    );
    expect(getRequestHeaders).toHaveBeenCalledWith(provider.getApiUrl());
    expect(getRequestHeaders).toHaveBeenCalledTimes(2);
  });

  it('can retry credential initialization after an authentication failure', async () => {
    vi.mocked(GoogleAuthManager.getOAuthClient).mockRejectedValueOnce(new Error('ADC unavailable'));
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: { projectId: 'customer-project' },
    });
    await provider.callApi('Hello');
    const authenticate = vi.mocked(fetchWithCache).mock.calls[0][1]!.getAuthHeaders!;

    await expect(authenticate()).rejects.toThrow('ADC unavailable');
    expect(new Headers(await authenticate()).get('authorization')).toBe('Bearer google-token');
    expect(GoogleAuthManager.getOAuthClient).toHaveBeenCalledTimes(2);
  });

  it('does not acquire credentials for an aborted request', async () => {
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: { projectId: 'customer-project' },
    });
    await provider.callApi('Hello');
    const authenticate = vi.mocked(fetchWithCache).mock.calls[0][1]!.getAuthHeaders!;
    await expect(authenticate(AbortSignal.abort())).rejects.toThrow();
    expect(GoogleAuthManager.getOAuthClient).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 503])(
    'returns HTTP %s errors without successful output',
    async (status) => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({ error: { message: 'Google Cloud request failed' } }, { status }),
      );
      const provider = new VertexResponsesProvider('gpt-6-luna', {
        config: { projectId: 'customer-project' },
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toContain('Google Cloud request failed');
      expect(result.output).toBeUndefined();
    },
  );

  it('reports transport timeouts as provider errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Request timed out'));
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: { projectId: 'customer-project' },
    });
    expect((await provider.callApi('Hello')).error).toContain('Request timed out');
  });

  it('uses provider-scoped project aliases before process-wide aliases', () => {
    const restoreProject = mockProcessEnv({ VERTEX_PROJECT_ID: 'ambient-project' });
    try {
      const provider = new VertexResponsesProvider('gpt-6-luna', {
        env: { GOOGLE_CLOUD_PROJECT: 'provider-project' },
      });
      expect(provider.getApiUrl()).toContain('/projects/provider-project/');
      const explicit = new VertexResponsesProvider('gpt-6-luna', {
        env: { GOOGLE_CLOUD_PROJECT: 'provider-project' },
        config: { projectId: 'explicit-project' },
      });
      expect(explicit.getApiUrl()).toContain('/projects/explicit-project/');
    } finally {
      restoreProject();
    }
  });

  it('requires a project or an explicit endpoint', () => {
    expect(() => new VertexResponsesProvider('gpt-6-luna')).toThrow('config.projectId');
  });

  it('rejects a regional setting instead of silently sending to the global endpoint', () => {
    expect(
      () =>
        new VertexResponsesProvider('gpt-6-luna', {
          config: { projectId: 'customer-project', region: 'europe-west1' },
        }),
    ).toThrow('global endpoint');
  });

  it('cancels while resolving Google credentials', async () => {
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      config: { projectId: 'customer-project' },
    });
    await provider.callApi('Hello');
    getRequestHeaders.mockReturnValue(new Promise(() => {}));
    const authenticate = vi.mocked(fetchWithCache).mock.calls[0][1]!.getAuthHeaders!;
    const controller = new AbortController();
    const pending = authenticate(controller.signal);
    const rejected = expect(pending).rejects.toThrow('Cancelled');
    controller.abort(new Error('Cancelled'));
    await rejected;
  });

  it('honors an explicit endpoint, label, headers, and custom token prices', async () => {
    const provider = new VertexResponsesProvider('gpt-6-luna', {
      id: 'Google preview',
      config: {
        apiBaseUrl: 'https://gateway.example/google/v1',
        headers: { 'X-Customer-Route': 'google' },
        cost: 0.01,
      },
    });
    expect(provider.id()).toBe('Google preview');
    expect((await provider.callApi('Hello')).cost).toBeCloseTo(0.18);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://gateway.example/google/v1/responses',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', 'X-Customer-Route': 'google' },
      }),
      expect.any(Number),
      'json',
      true,
      undefined,
    );
  });
});
