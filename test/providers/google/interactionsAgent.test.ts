import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleProviderFactories } from '../../../src/providers/families/google';
import { GoogleInteractionsAgentProvider } from '../../../src/providers/google/interactionsAgent';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { fetchWithTimeout } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithTimeout: vi.fn() }));

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEEP_RESEARCH = 'deep-research-preview-04-2026';
const ANTIGRAVITY = 'antigravity-preview-09-2026';

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

const completedReport = {
  id: 'interaction-1',
  status: 'completed',
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'Research TPUs' }] },
    { type: 'model_output', content: [{ type: 'text', text: 'Planning the research.' }] },
    { type: 'google_search_call', arguments: { queries: ['TPU history'] } },
    { type: 'google_search_result', result: [{ url: 'https://example.com/tpu' }] },
    { type: 'url_context_call', arguments: { urls: ['https://example.com/tpu'] } },
    { type: 'url_context_result', result: [{ url: 'https://example.com/tpu' }] },
    { type: 'thought', signature: 'opaque' },
    {
      type: 'model_output',
      content: [
        {
          type: 'text',
          text: 'TPU v1 launched in 2016.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://example.com/tpu',
              title: 'TPU history',
              start_index: 0,
              end_index: 24,
            },
          ],
        },
        { type: 'text', text: ' Later generations followed.' },
      ],
    },
  ],
  usage: {
    total_input_tokens: 200_000,
    total_cached_tokens: 120_000,
    total_output_tokens: 50_000,
    total_thought_tokens: 10_000,
    total_tool_use_tokens: 30_000,
    total_tokens: 290_000,
    grounding_tool_count: [{ type: 'google_search', count: 42 }],
  },
};

describe('GoogleInteractionsAgentProvider', () => {
  const mockFetch = vi.mocked(fetchWithTimeout);
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      GOOGLE_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      PALM_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      GOOGLE_API_HOST: undefined,
      PALM_API_HOST: undefined,
      GOOGLE_API_BASE_URL: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  function requestAt(index: number) {
    const [url, init] = mockFetch.mock.calls[index];
    return {
      url: String(url),
      method: init?.method,
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      init,
    };
  }

  function postCount() {
    return mockFetch.mock.calls.filter(([url, init]) => init?.method === 'POST' && url === ENDPOINT)
      .length;
  }

  describe('routing', () => {
    async function route(path: string) {
      const factory = googleProviderFactories.find((candidate) => candidate.test(path));
      if (!factory) {
        throw new Error(`No factory for ${path}`);
      }
      return factory.create(path, {}, {});
    }

    it.each([
      ['google:interactions:agent:deep-research-preview-04-2026', DEEP_RESEARCH],
      [
        'google:interactions:agent:deep-research-max-preview-04-2026',
        'deep-research-max-preview-04-2026',
      ],
      ['palm:interactions:agent:antigravity-preview-09-2026', ANTIGRAVITY],
      ['google:interactions:agent:data-analyst', 'data-analyst'],
    ])('routes %s to the agent provider', async (path, agentId) => {
      const provider = await route(path);
      expect(provider).toBeInstanceOf(GoogleInteractionsAgentProvider);
      expect((provider as GoogleInteractionsAgentProvider).agentId).toBe(agentId);
      expect(provider.id()).toBe(path);
    });

    it.each(['google:interactions:agent', 'google:interactions:agent:'])(
      'requires an agent ID for %s',
      async (path) => {
        await expect(route(path)).rejects.toThrow(
          'Missing agent ID. Use google:interactions:agent:<agent-id>.',
        );
      },
    );

    it.each([
      ['google:deep-research-preview-04-2026', DEEP_RESEARCH],
      [
        'google:interactions:deep-research-max-preview-04-2026',
        'deep-research-max-preview-04-2026',
      ],
      ['google:chat:antigravity-preview-09-2026', ANTIGRAVITY],
      ['palm:antigravity-preview-latest', 'antigravity-preview-latest'],
      ['vertex:deep-research-preview-04-2026', DEEP_RESEARCH],
      ['vertex:chat:antigravity-preview-09-2026', ANTIGRAVITY],
    ])('points %s at the agent route', async (path, agentId) => {
      await expect(route(path)).rejects.toThrow(
        `"${agentId}" is a Gemini managed agent. Use google:interactions:agent:${agentId}.`,
      );
    });

    it('rejects Vertex agent routes', async () => {
      await expect(route(`vertex:interactions:agent:${DEEP_RESEARCH}`)).rejects.toThrow(
        `Gemini managed agents are supported only through the Gemini API. Use google:interactions:agent:${DEEP_RESEARCH}.`,
      );
    });
  });

  it('creates a background interaction, polls until completion, and returns the final report', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-1', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-1', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: {
        apiKey: 'test-key',
        pollIntervalMs: 1,
        agentConfig: { thinking_summaries: 'auto', visualization: 'off' },
      },
    });

    const result = await provider.callApi('Research TPUs');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const create = requestAt(0);
    expect(create.url).toBe(ENDPOINT);
    expect(create.method).toBe('POST');
    expect(create.headers).toMatchObject({
      'Api-Revision': '2026-05-20',
      'x-goog-api-key': 'test-key',
    });
    expect(create.init).toMatchObject({ disableTransientRetries: true });
    expect(create.body).toEqual({
      agent: DEEP_RESEARCH,
      input: 'Research TPUs',
      agent_config: { type: 'deep-research', thinking_summaries: 'auto', visualization: 'off' },
      background: true,
    });
    for (const index of [1, 2]) {
      expect(requestAt(index)).toMatchObject({
        url: `${ENDPOINT}/interaction-1`,
        method: 'GET',
      });
    }

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('TPU v1 launched in 2016. Later generations followed.');
    expect(result.cached).toBe(false);
    expect(result.tokenUsage).toEqual({
      prompt: 230_000,
      completion: 50_000,
      total: 290_000,
      cached: 120_000,
      numRequests: 1,
      completionDetails: { reasoning: 10_000 },
    });
    // Google does not identify the model behind Deep Research, so the cost is unknown.
    expect(result.cost).toBeUndefined();
    expect(result.metadata).toEqual({
      interactionId: 'interaction-1',
      agent: DEEP_RESEARCH,
      status: 'completed',
      toolCallCounts: { google_search_call: 1, url_context_call: 1 },
      groundingToolCount: [{ type: 'google_search', count: 42 }],
      citations: [
        { url: 'https://example.com/tpu', content: 'TPU history: TPU v1 launched in 2016.' },
      ],
    });
  });

  it('returns immediately when the create response is already complete', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Research TPUs');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.output).toContain('TPU v1');
    expect(requestAt(0).body).not.toHaveProperty('agent_config');
  });

  it('defaults Antigravity to a remote environment and prices its documented default model', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'ag-1', status: 'in_progress' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'ag-1',
          status: 'completed',
          environment_id: 'env-123',
          steps: [
            { type: 'code_execution_call', id: 'call_1', arguments: { command: 'echo OK' } },
            { type: 'code_execution_result', call_id: 'call_1', is_error: false, result: 'OK' },
            { type: 'model_output', content: [{ type: 'text', text: 'OK' }] },
            { type: 'thought', signature: 'opaque' },
          ],
          usage: {
            total_input_tokens: 5460,
            total_output_tokens: 5,
            total_thought_tokens: 29,
            total_cached_tokens: 0,
            total_tokens: 5494,
          },
        }),
      );
    const provider = new GoogleInteractionsAgentProvider(ANTIGRAVITY, {
      config: { apiKey: 'test-key', pollIntervalMs: 1, agentConfig: { max_total_tokens: 30000 } },
    });

    const result = await provider.callApi('Reply with OK');

    expect(requestAt(0).body).toEqual({
      agent: ANTIGRAVITY,
      input: 'Reply with OK',
      agent_config: { type: 'antigravity', max_total_tokens: 30000 },
      environment: 'remote',
      background: true,
    });
    expect(result.output).toBe('OK');
    // Gemini 4 Hydrogen: 5,460 x $1.50/1M + (5 + 29) x $7.50/1M.
    expect(result.cost).toBeCloseTo(5460 * 1.5e-6 + 34 * 7.5e-6, 12);
    expect(result.metadata).toMatchObject({
      environmentId: 'env-123',
      status: 'completed',
      toolCallCounts: { code_execution_call: 1 },
    });
  });

  it('prices cached Antigravity input at the cache rate of the configured model', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'ag-2',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Done' }] }],
        usage: {
          total_input_tokens: 100_000,
          total_cached_tokens: 60_000,
          total_output_tokens: 1_000,
          total_tokens: 101_000,
        },
      }),
    );
    const provider = new GoogleInteractionsAgentProvider(ANTIGRAVITY, {
      config: { apiKey: 'test-key', environment: 'env-existing' },
    });

    const result = await provider.callApi('Continue');

    expect(requestAt(0).body.environment).toBe('env-existing');
    // Gemini 4 Hydrogen: 40k uncached x $1.50/1M + 60k cached x $0.075/1M + 1k x $7.50/1M.
    expect(result.cost).toBeCloseTo(40_000 * 1.5e-6 + 60_000 * 0.075e-6 + 1_000 * 7.5e-6, 12);
  });

  it('prices usage at the service tier reported when the task was created', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ id: 'ag-flex', status: 'in_progress', service_tier: 'flex' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'ag-flex',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Done' }] }],
          usage: { total_input_tokens: 10_000, total_output_tokens: 1_000 },
        }),
      );
    const provider = new GoogleInteractionsAgentProvider(ANTIGRAVITY, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Hello');

    // Gemini 4 Hydrogen Flex: $0.75/1M input, $3.75/1M output.
    expect(result.cost).toBeCloseTo(10_000 * 0.75e-6 + 1_000 * 3.75e-6, 12);
  });

  it('leaves cost undefined when the agent model is not documented', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'ag-3',
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Done' }] }],
        usage: { total_input_tokens: 1_000, total_output_tokens: 100 },
      }),
    );
    const provider = new GoogleInteractionsAgentProvider('antigravity-preview-05-2026', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Hello');

    expect(result.output).toBe('Done');
    expect(result.tokenUsage).toMatchObject({ prompt: 1_000, completion: 100 });
    expect(result.cost).toBeUndefined();
  });

  it('uses configured per-token costs for agents without catalog pricing', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', inputCost: 2e-6, outputCost: 10e-6 },
    });

    const result = await provider.callApi('Research TPUs');

    // Input includes tool-use tokens; output includes thinking tokens.
    expect(result.cost).toBeCloseTo(230_000 * 2e-6 + 60_000 * 10e-6, 10);
  });

  it('returns the failure reason, usage, and interaction ID without starting another task', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-failed', status: 'in_progress' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'interaction-failed',
          status: 'failed',
          errors: [{ code: 'internal', message: 'Research could not be completed' }],
          usage: { total_input_tokens: 10, total_output_tokens: 2 },
        }),
      );
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toBe(
      'Gemini agent interaction interaction-failed ended with status failed: Research could not be completed',
    );
    expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 2 });
    expect(result.metadata).toMatchObject({
      interactionId: 'interaction-failed',
      status: 'failed',
      rateLimitRetryable: false,
    });
    expect(postCount()).toBe(1);
  });

  it('reports a failed interaction that carries a top-level error', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-error', status: 'in_progress' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'interaction-error',
          status: 'failed',
          error: { message: 'Maximum research time exceeded' },
        }),
      );
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toBe(
      'Gemini agent interaction interaction-error ended with status failed: Maximum research time exceeded',
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops waiting at maxPollTimeMs and reports the interaction ID without cancelling', async () => {
    mockFetch.mockImplementation(async () =>
      jsonResponse({ id: 'interaction-slow', status: 'in_progress' }),
    );
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 5, maxPollTimeMs: 40 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toContain(
      'Gemini agent interaction interaction-slow did not finish within 40ms (last status: in_progress)',
    );
    expect(result.error).toContain(`GET ${ENDPOINT}/interaction-slow`);
    expect(result.metadata).toMatchObject({
      interactionId: 'interaction-slow',
      rateLimitRetryable: false,
    });
    expect(postCount()).toBe(1);
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/cancel'))).toBe(false);
  });

  it('cancels the background interaction and rethrows when the caller aborts', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/cancel')) {
        return jsonResponse({ id: 'interaction-abort', status: 'cancelled' });
      }
      if (init?.method === 'GET') {
        controller.abort();
      }
      return jsonResponse({ id: 'interaction-abort', status: 'in_progress' });
    });
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    await expect(
      provider.callApi('Research TPUs', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const cancel = mockFetch.mock.calls.find(([url]) => String(url).endsWith('/cancel'));
    expect(cancel?.[0]).toBe(`${ENDPOINT}/interaction-abort/cancel`);
    expect(cancel?.[1]).toMatchObject({ method: 'POST' });
    // An aborted signal would stop the cancel request before it reached Google.
    expect(cancel?.[1]?.signal).toBeUndefined();
    expect(postCount()).toBe(1);
  });

  it('cancels a task whose create response arrives after the caller aborts', async () => {
    const controller = new AbortController();
    let releaseCreate: (response: Response) => void = () => {};
    mockFetch.mockImplementation((url) => {
      if (String(url).endsWith('/cancel')) {
        return Promise.resolve(jsonResponse({ id: 'interaction-late', status: 'cancelled' }));
      }
      return new Promise<Response>((resolve) => {
        releaseCreate = resolve;
      });
    });
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    const call = provider.callApi('Research TPUs', undefined, { abortSignal: controller.signal });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // Google may already have the request, so the create is not tied to the caller's signal.
    expect(requestAt(0).init?.signal).toBeUndefined();
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });

    releaseCreate(jsonResponse({ id: 'interaction-late', status: 'in_progress' }));
    await vi.waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        `${ENDPOINT}/interaction-late/cancel`,
        expect.objectContaining({ method: 'POST' }),
        expect.any(Number),
      ),
    );
    expect(postCount()).toBe(1);
  });

  it('does not send a request when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    await expect(
      provider.callApi('Research TPUs', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not retry a create request that fails without a response', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Request timed out after 300000 ms'));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Research TPUs');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.error).toContain('Gemini agent request failed: Error: Request timed out');
    expect(result.error).toContain('does not retry agent requests');
    expect(result.metadata).toMatchObject({ rateLimitRetryable: false });
  });

  function rateLimited() {
    return new Response(
      JSON.stringify({ error: { message: 'Quota exceeded for agent requests' } }),
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Content-Type': 'application/json', 'retry-after': '0' },
      },
    );
  }

  it('resends the create request after HTTP 429 because no task was created', async () => {
    mockFetch
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.output).toContain('TPU v1');
    expect(postCount()).toBe(2);
  });

  it('reports a persistent 429 after bounded create retries', async () => {
    mockFetch.mockImplementation(async () => rateLimited());
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toBe('Gemini agent API error: Quota exceeded for agent requests');
    expect(result.metadata).toMatchObject({
      rateLimitRetryable: false,
      http: { status: 429, statusText: 'Too Many Requests' },
    });
    expect(postCount()).toBe(4);
  });

  it.each([
    [
      'an ambiguous 5xx',
      () =>
        jsonResponse({ error: { message: 'rate limit exceeded upstream' } }, 503, 'Unavailable'),
    ],
    ['a timeout', () => Promise.reject(new Error('Request timed out after 300000 ms'))],
  ])('is never replayed by the scheduler after %s', async (_name, respond) => {
    mockFetch.mockImplementation(async () => respond());
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key' },
    });

    try {
      const result = await registry.execute(
        provider,
        () => provider.callApi('Research TPUs'),
        createProviderRateLimitOptions(),
      );
      expect(result.error).toBeDefined();
      expect(result.metadata).toMatchObject({ rateLimitRetryable: false });
    } finally {
      registry.dispose();
    }
    expect(postCount()).toBe(1);
  });

  it('keeps polling through transient poll failures', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-1', status: 'in_progress' }))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'backend' } }, 503, 'Unavailable'))
      .mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('TPU v1');
    expect(postCount()).toBe(1);
  });

  it('keeps backing off through repeated transient failures until the task completes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'interaction-1', status: 'in_progress' }));
    for (let i = 0; i < 6; i++) {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: { message: 'busy' } }, 503, 'Unavailable'),
      );
    }
    mockFetch.mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.output).toContain('TPU v1');
    expect(mockFetch).toHaveBeenCalledTimes(8);
    expect(postCount()).toBe(1);
  });

  it('reports the last status-check failure when polling never recovers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-down', status: 'in_progress' }))
      .mockImplementation(async () =>
        jsonResponse({ error: { message: 'backend unavailable' } }, 503, 'Unavailable'),
      );
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1, maxPollTimeMs: 30 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toContain(
      'Gemini agent interaction interaction-down did not finish within 30ms (last status: in_progress; last status check failed: backend unavailable)',
    );
    expect(postCount()).toBe(1);
  });

  it('stops polling on a non-transient poll error', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'interaction-gone', status: 'in_progress' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Not found' } }, 404, 'Not Found'));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', pollIntervalMs: 1 },
    });

    const result = await provider.callApi('Research TPUs');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.error).toBe(
      `Gemini agent interaction interaction-gone could not be retrieved: Not found. The task may still be running. Retrieve it with GET ${ENDPOINT}/interaction-gone.`,
    );
    expect(result.metadata).toMatchObject({ rateLimitRetryable: false });
  });

  it('returns incomplete results with their status', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'ag-budget',
        status: 'incomplete',
        environment_id: 'env-1',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Partial summary' }] }],
      }),
    );
    const provider = new GoogleInteractionsAgentProvider(ANTIGRAVITY, {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Summarize');

    expect(result.output).toBe('Partial summary');
    expect(result.metadata).toMatchObject({ status: 'incomplete', environmentId: 'env-1' });
  });

  it('reports requires_action as unsupported', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'ag-action', status: 'requires_action' }));
    const provider = new GoogleInteractionsAgentProvider('data-analyst', {
      config: { apiKey: 'test-key', environment: 'remote' },
    });

    const result = await provider.callApi('Analyze');

    expect(result.error).toBe(
      'Gemini agent interaction ag-action requires client action, which Promptfoo does not support for managed agents',
    );
    expect(requestAt(0).body).toEqual({
      agent: 'data-analyst',
      input: 'Analyze',
      environment: 'remote',
      background: true,
    });
  });

  it('forwards passthrough fields without letting them override promptfoo-owned fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: {
        apiKey: 'test-key',
        previousInteractionId: 'previous-1',
        passthrough: {
          tools: [{ type: 'google_search' }],
          agent_config: { collaborative_planning: true },
          background: false,
          stream: true,
          model: 'gemini-9.99-fakemodel',
        },
      },
    });

    await provider.callApi('Plan the research', {
      prompt: {
        raw: 'Plan the research',
        label: 'p',
        config: { passthrough: { service_tier: 'flex' } },
      },
      vars: {},
    });

    expect(requestAt(0).body).toEqual({
      agent: DEEP_RESEARCH,
      input: 'Plan the research',
      agent_config: { type: 'deep-research', collaborative_planning: true },
      previous_interaction_id: 'previous-1',
      tools: [{ type: 'google_search' }],
      service_tier: 'flex',
      background: true,
    });
  });

  it.each([
    [
      'store: false',
      { store: false },
      'Gemini managed agents run in the background, which requires store: true.',
    ],
    [
      'function tools',
      { passthrough: { tools: [{ type: 'function', name: 'lookup' }] } },
      'Gemini managed agent function and computer-use tools are not supported because Promptfoo does not handle requires_action responses.',
    ],
    [
      'generateContent tools',
      { tools: [{ googleSearch: {} }] },
      'Gemini managed agents require Interactions-native tool declarations in config.passthrough.tools.',
    ],
    [
      'Vertex AI',
      { vertexai: true },
      'Gemini managed agents are supported only through the Gemini API. Remove vertexai: true and use a Gemini API key.',
    ],
    [
      'an invalid poll interval',
      { pollIntervalMs: 0 },
      'Gemini agent pollIntervalMs and maxPollTimeMs must be positive numbers.',
    ],
  ])('rejects %s before creating a task', async (_name, config, error) => {
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      config: { apiKey: 'test-key', ...config } as any,
    });

    await expect(provider.callApi('Research TPUs')).resolves.toEqual({ error });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires a Gemini API key', async () => {
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH);

    const result = await provider.callApi('Research TPUs');

    expect(result.error).toContain('Gemini managed agents require an API key.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses the Gemini API key from the environment', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedReport));
    const provider = new GoogleInteractionsAgentProvider(DEEP_RESEARCH, {
      env: { GEMINI_API_KEY: 'env-key' },
    });

    await provider.callApi('Research TPUs');

    expect(requestAt(0).headers['x-goog-api-key']).toBe('env-key');
  });
});
