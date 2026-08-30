import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import {
  GoogleInteractionsChatProvider,
  geminiContentsToInteractionsInput,
  toInteractionsTools,
} from '../../../src/providers/google/interactionsChat';
import { shouldUseInteractions } from '../../../src/providers/google/interactionsShared';

vi.mock('../../../src/cache', () => ({ fetchWithCache: vi.fn() }));

const AI_STUDIO_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/** Shape a successful Interactions response the way the live API returns one. */
function interaction(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: 'v1_interaction',
      status: 'completed',
      model: 'gemini-3.6-flash',
      steps: [
        { type: 'thought', signature: 'sig' },
        { type: 'model_output', content: [{ type: 'text', text: 'Hello' }] },
      ],
      usage: {
        total_tokens: 30,
        total_input_tokens: 10,
        total_output_tokens: 5,
        total_thought_tokens: 15,
        total_cached_tokens: 0,
        total_tool_use_tokens: 0,
      },
      ...overrides,
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };
}

function bodyOf(call: any) {
  return JSON.parse(call[1].body);
}

describe('GoogleInteractionsChatProvider', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);

  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so per-test persistent setters cannot
    // leak across randomized test order.
    vi.resetAllMocks();
    // Endpoint/auth resolution reads the ambient environment; pin it so a
    // developer's gcloud or Gemini setup cannot redirect these assertions.
    vi.stubEnv('GOOGLE_API_HOST', '');
    vi.stubEnv('GOOGLE_API_BASE_URL', '');
    vi.stubEnv('VERTEX_REGION', '');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    vi.stubEnv('VERTEX_API_HOST', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Stub Vertex OAuth so endpoint/body assertions do not need real credentials. */
  const mockVertexAuth = () => {
    const oauthHeaders = new Headers();
    oauthHeaders.set('Authorization', 'Bearer vertex-token');
    vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
      client: {
        getAccessToken: async () => ({ token: 'vertex-token' }),
        getRequestHeaders: async () => oauthHeaders,
      },
      projectId: 'auth-project',
    } as any);
  };

  const make = (config: Record<string, any> = {}) =>
    new GoogleInteractionsChatProvider('gemini-3.6-flash', {
      config: { apiKey: 'test-key', vertexai: false, ...config } as any,
    });

  describe('identity', () => {
    it('reports an interactions-scoped id and description', () => {
      const provider = make();
      expect(provider.id()).toBe('google:interactions:gemini-3.6-flash');
      expect(provider.toString()).toBe(
        '[Google Google AI Studio Interactions Provider gemini-3.6-flash]',
      );
    });

    it('reports a vertex-scoped id in Vertex mode', () => {
      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        config: { vertexai: true, projectId: 'proj' } as any,
      });
      expect(provider.id()).toBe('vertex:interactions:gemini-3.6-flash');
    });

    it('honors a configured provider id override', () => {
      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        id: 'custom-id',
        config: { apiKey: 'k', vertexai: false } as any,
      });
      expect(provider.id()).toBe('custom-id');
    });
  });

  describe('request mapping', () => {
    it('posts a prompt to the Interactions endpoint with the pinned API revision', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      const result = await make().callApi('Hello');

      expect(result.output).toBe('Hello');
      const [url, init] = mockFetchWithCache.mock.calls[0];
      expect(url).toBe(AI_STUDIO_ENDPOINT);
      expect((init as any).headers).toMatchObject({
        'Api-Revision': '2026-05-20',
        'x-goog-api-key': 'test-key',
      });
      expect(bodyOf(mockFetchWithCache.mock.calls[0])).toMatchObject({
        model: 'gemini-3.6-flash',
        input: [{ type: 'user_input', content: [{ type: 'text', text: 'Hello' }] }],
        stream: false,
        background: false,
      });
    });

    it('keys the cache on a credential hash rather than the raw API key', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make().callApi('Hello');

      const init = mockFetchWithCache.mock.calls[0][1] as any;
      // Responses are cacheable like every other Google provider, but the key is
      // discriminated by a hash so the credential is never a durable fingerprint.
      expect(init._authHash).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(init._authHash)).not.toContain('test-key');
      expect(mockFetchWithCache.mock.calls[0][4]).toBe(false);
    });

    it('busts the cache when the caller asks for fresh results', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make().callApi('Hello', { bustCache: true } as any);
      expect(mockFetchWithCache.mock.calls[0][4]).toBe(true);
    });

    it('applies a configured timeoutMs to the initial request, not just polling', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({ timeoutMs: 1234 }).callApi('Hello');
      expect(mockFetchWithCache.mock.calls[0][2]).toBe(1234);
    });

    it('maps a chat prompt into a user/model interaction timeline', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make().callApi(
        JSON.stringify([
          { role: 'system', content: 'Be terse.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'Bye' },
        ]),
      );

      expect(bodyOf(mockFetchWithCache.mock.calls[0])).toMatchObject({
        system_instruction: 'Be terse.',
        input: [
          { type: 'user_input', content: [{ type: 'text', text: 'Hi' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'Hello!' }] },
          { type: 'user_input', content: [{ type: 'text', text: 'Bye' }] },
        ],
      });
    });

    it('translates generation options into the snake_case generation_config', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        temperature: 0.5,
        topP: 0.9,
        topK: 20,
        maxOutputTokens: 256,
        stopSequences: ['STOP'],
        generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } },
      }).callApi('Hello');

      expect(bodyOf(mockFetchWithCache.mock.calls[0]).generation_config).toEqual({
        temperature: 0.5,
        top_p: 0.9,
        top_k: 20,
        max_output_tokens: 256,
        stop_sequences: ['STOP'],
        thinking_level: 'high',
      });
    });

    it('converts Gemini tools into typed Interactions tool entries', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Weather',
                parameters: { type: 'OBJECT', properties: { city: { type: 'STRING' } } },
              },
            ],
          },
          { googleSearch: {} },
          { codeExecution: {} },
        ],
      }).callApi('Hello');

      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual([
        {
          type: 'function',
          name: 'get_weather',
          description: 'Weather',
          // Interactions rejects Gemini's uppercase schema types.
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
        { type: 'google_search' },
        { type: 'code_execution' },
      ]);
    });

    it('withholds function declarations when the tool policy disables tools', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }, { googleSearch: {} }],
        tool_choice: 'none',
      }).callApi('Hello');

      // Interactions has no tool_choice field, so a disabled policy can only be
      // honored by not sending the functions at all. Server-side tools remain.
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual([{ type: 'google_search' }]);
    });

    it('withholds passthrough tools too when the policy disables tools', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
        tool_choice: 'none',
        passthrough: { tools: [{ functionDeclarations: [{ name: 'sneaky' }] }] },
      }).callApi('Hello');

      // passthrough is merged last, so an unfiltered `tools` there would
      // reinstate the declarations the policy just removed.
      const body = bodyOf(mockFetchWithCache.mock.calls[0]);
      expect(body.tools ?? []).toEqual([]);
    });

    it('merges passthrough tools when the policy allows them', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
        passthrough: { tools: [{ googleSearch: {} }] },
      }).callApi('Hello');

      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual([
        { type: 'function', name: 'get_weather' },
        { type: 'google_search' },
      ]);
    });

    it('advertises only the allowed function names', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        tools: [
          { functionDeclarations: [{ name: 'get_weather' }, { name: 'send_email' }] },
          { googleSearch: {} },
        ],
        toolConfig: { functionCallingConfig: { allowedFunctionNames: ['get_weather'] } },
      }).callApi('Hello');

      // An allow-list can only be honored by not offering the others; server
      // tools are unaffected.
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual([
        { type: 'function', name: 'get_weather' },
        { type: 'google_search' },
      ]);
    });

    it('does not run callbacks for a tool the policy disabled', async () => {
      const spy = vi.fn().mockReturnValue('52F');
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'requires_action',
          steps: [{ type: 'function_call', id: 'call_1', name: 'get_weather', arguments: {} }],
        }) as any,
      );

      await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        functionToolCallbacks: { get_weather: spy },
      }).callApi('Hello');

      expect(spy).not.toHaveBeenCalled();
      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    });

    it('sends the configured service tier', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({ service_tier: 'priority' }).callApi('Hello');
      // Cost is computed against the tier, so the request has to actually use it.
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).service_tier).toBe('priority');
    });

    it('maps a nested generationConfig response schema onto response_format', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        generationConfig: {
          response_schema: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
        },
      }).callApi('Hello');

      // Otherwise opting into Interactions would silently drop structured output.
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format).toEqual({
        type: 'object',
        properties: { color: { type: 'string' } },
      });
    });

    it('sends responseSchema as a parsed response_format object', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      await make({
        responseSchema: JSON.stringify({
          type: 'OBJECT',
          properties: { color: { type: 'STRING' } },
          required: ['color'],
        }),
      }).callApi('Hello');

      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format).toEqual({
        type: 'object',
        properties: { color: { type: 'string' } },
        required: ['color'],
      });
    });

    it('reports an unparseable responseSchema without calling the API', async () => {
      const result = await make({ responseSchema: '{not json' }).callApi('Hello');
      expect(result.error).toContain('responseSchema is not valid JSON');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('server-side retention', () => {
    it('defaults to store:false so eval payloads are not retained', async () => {
      // The live API omits `id` entirely when the interaction is not stored.
      mockFetchWithCache.mockResolvedValue(interaction({ id: undefined }) as any);
      const result = await make().callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).store).toBe(false);
      expect(result.metadata?.interactionStored).toBe(false);
      // Nothing was retained, so there is no interaction id to hand back.
      expect(result.metadata?.interactionId).toBeUndefined();
    });

    it('enables storage implicitly when continuing a previous interaction', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const result = await make({ previousInteractionId: 'v1_prev' }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0])).toMatchObject({
        store: true,
        previous_interaction_id: 'v1_prev',
      });
      expect(result.metadata?.interactionId).toBe('v1_interaction');
    });

    it('rejects previousInteractionId with store:false before making a request', async () => {
      const result = await make({ store: false, previousInteractionId: 'v1_prev' }).callApi('Hi');
      expect(result.error).toContain('previousInteractionId requires store: true');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('does not let passthrough.store bypass the retention default', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const result = await make({ passthrough: { store: true } }).callApi('Hello');
      const body = bodyOf(mockFetchWithCache.mock.calls[0]);
      // Whatever is sent must match what metadata reports; passthrough is merged
      // last, so an unguarded `store` there would silently enable retention.
      expect(body.store).toBe(true);
      expect(result.metadata?.interactionStored).toBe(true);
    });

    it('validates a previous_interaction_id supplied through passthrough', async () => {
      const result = await make({
        store: false,
        passthrough: { previous_interaction_id: 'v1_prev' },
      }).callApi('Hello');
      expect(result.error).toContain('previousInteractionId requires store: true');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('sends a passthrough previous_interaction_id as a real stored reference', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({ passthrough: { previous_interaction_id: 'v1_prev' } }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0])).toMatchObject({
        store: true,
        previous_interaction_id: 'v1_prev',
      });
    });

    it('drops safetySettings, which the Gemini Interactions API rejects', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }],
      }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).safety_settings).toBeUndefined();
    });
  });

  describe('response handling', () => {
    it('returns only the newest turn when an interaction carries prior history', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          steps: [
            { type: 'user_input', content: [{ type: 'text', text: 'old question' }] },
            { type: 'model_output', content: [{ type: 'text', text: 'STALE' }] },
            { type: 'user_input', content: [{ type: 'text', text: 'new question' }] },
            { type: 'model_output', content: [{ type: 'text', text: 'FRESH' }] },
          ],
        }) as any,
      );

      const result = await make({ previousInteractionId: 'v1_prev' }).callApi('new question');
      expect(result.output).toBe('FRESH');
    });

    it('surfaces an unhandled function call in the Gemini array shape', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'requires_action',
          steps: [
            {
              type: 'function_call',
              id: 'call_1',
              name: 'get_weather',
              arguments: { location: 'Boston' },
            },
          ],
        }) as any,
      );

      const result = await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
      }).callApi('Weather?');

      // Matches Vertex/AI Studio so `is-valid-function-call` keeps working.
      expect(JSON.parse(result.output as string)).toEqual([
        { functionCall: { name: 'get_weather', args: { location: 'Boston' }, id: 'call_1' } },
      ]);
    });

    it('surfaces search queries and server-side tool steps as metadata', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          steps: [
            {
              type: 'google_search_call',
              id: 'call_1',
              arguments: { queries: ['who won', 'world cup winner'] },
            },
            { type: 'google_search_result', id: 'call_1' },
            { type: 'model_output', content: [{ type: 'text', text: 'Spain' }] },
          ],
        }) as any,
      );

      const result = await make({ tools: [{ googleSearch: {} }] }).callApi('Who won?');

      // generateContent reports these as webSearchQueries; keep the same key so
      // grounding assertions work across both transports.
      expect(result.metadata?.webSearchQueries).toEqual(['who won', 'world cup winner']);
      expect(result.metadata?.serverToolSteps).toEqual([
        'google_search_call',
        'google_search_result',
      ]);
    });

    it('reports token usage, reasoning tokens, and cost', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const result = await make().callApi('Hello');
      expect(result.tokenUsage).toMatchObject({
        prompt: 10,
        completion: 5,
        total: 30,
        numRequests: 1,
        completionDetails: { reasoning: 15 },
      });
      expect(result.cost).toBeGreaterThan(0);
    });
  });

  describe('tool loop', () => {
    const toolConfig = {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_weather',
              parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' } } },
            },
          ],
        },
      ],
    };
    const pendingCall = () =>
      interaction({
        id: 'v1_first',
        status: 'requires_action',
        steps: [
          {
            type: 'function_call',
            id: 'call_1',
            name: 'get_weather',
            arguments: { location: 'Boston' },
          },
        ],
      });
    const finalAnswer = () =>
      interaction({
        id: 'v1_second',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: '52F and rain' }] }],
      });

    it('resolves a function call statelessly by resending history', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: () => '52F and rain' },
      }).callApi('Weather in Boston?');

      expect(result.output).toBe('52F and rain');
      const second = bodyOf(mockFetchWithCache.mock.calls[1]);
      // store:false means no server-side thread, so the whole timeline is resent
      // and the model's own function_call step is never replayed back.
      expect(second.previous_interaction_id).toBeUndefined();
      expect(second.input).toEqual([
        { type: 'user_input', content: [{ type: 'text', text: 'Weather in Boston?' }] },
        {
          type: 'function_result',
          call_id: 'call_1',
          name: 'get_weather',
          result: [{ type: 'text', text: '52F and rain' }],
        },
      ]);
      expect(result.metadata?.toolCalls).toEqual([
        { name: 'get_weather', args: { location: 'Boston' }, result: '52F and rain' },
      ]);
    });

    it('resolves a function call against server-side state when store is enabled', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      await make({
        ...toolConfig,
        store: true,
        functionToolCallbacks: { get_weather: () => 'ok' },
      }).callApi('Weather in Boston?');

      const second = bodyOf(mockFetchWithCache.mock.calls[1]);
      expect(second.previous_interaction_id).toBe('v1_first');
      // Only the new result is sent; the server holds the rest of the thread.
      expect(second.input).toEqual([
        {
          type: 'function_result',
          call_id: 'call_1',
          name: 'get_weather',
          result: [{ type: 'text', text: 'ok' }],
        },
      ]);
    });

    it('accumulates token usage and request counts across tool rounds', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: () => 'ok' },
      }).callApi('Weather?');

      expect(result.tokenUsage).toMatchObject({
        prompt: 20,
        completion: 10,
        total: 60,
        numRequests: 2,
        completionDetails: { reasoning: 30 },
      });
    });

    it('feeds a failing callback back to the model instead of aborting the eval', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: {
          get_weather: () => {
            throw new Error('upstream down');
          },
        },
      }).callApi('Weather?');

      expect(bodyOf(mockFetchWithCache.mock.calls[1]).input).toContainEqual(
        expect.objectContaining({
          type: 'function_result',
          result: [{ type: 'text', text: 'Error: upstream down' }],
        }),
      );
      expect(result.metadata?.toolCalls).toEqual([
        expect.objectContaining({ name: 'get_weather', error: 'upstream down' }),
      ]);
    });

    it('never re-runs a tool when a polled interaction replays its full timeline', async () => {
      const spy = vi.fn().mockReturnValue('52F');
      // Second response is a stored interaction fetched in full: it repeats the
      // original user_input and the already-answered function_call.
      mockFetchWithCache.mockResolvedValueOnce(pendingCall() as any).mockResolvedValueOnce(
        interaction({
          id: 'v1_second',
          steps: [
            { type: 'user_input', content: [{ type: 'text', text: 'Weather in Boston?' }] },
            {
              type: 'function_call',
              id: 'call_1',
              name: 'get_weather',
              arguments: { location: 'Boston' },
            },
            { type: 'function_result', id: 'call_1', name: 'get_weather' },
            { type: 'model_output', content: [{ type: 'text', text: '52F and rain' }] },
          ],
        }) as any,
      );

      const result = await make({
        ...toolConfig,
        store: true,
        functionToolCallbacks: { get_weather: spy },
      }).callApi('Weather in Boston?');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
      // The replayed call must not leak into the output either.
      expect(result.output).toBe('52F and rain');
    });

    it('returns every pending call when only some have callbacks', async () => {
      const spy = vi.fn().mockReturnValue('52F');
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'requires_action',
          steps: [
            { type: 'function_call', id: 'call_1', name: 'get_weather', arguments: {} },
            { type: 'function_call', id: 'call_2', name: 'send_email', arguments: {} },
          ],
        }) as any,
      );

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: spy },
      }).callApi('Do both');

      // Running only the matched call would replace this response and silently
      // drop the unmatched one.
      expect(spy).not.toHaveBeenCalled();
      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(JSON.parse(result.output as string).map((p: any) => p.functionCall.name)).toEqual([
        'get_weather',
        'send_email',
      ]);
    });

    it('serializes a callback that returns nothing', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: () => undefined },
      }).callApi('Weather?');

      // JSON.stringify(undefined) is undefined, which would drop `text` and
      // make the follow-up request malformed.
      const [{ result }] = bodyOf(mockFetchWithCache.mock.calls[1]).input.filter(
        (item: any) => item.type === 'function_result',
      );
      expect(typeof result[0].text).toBe('string');
    });

    it('still bills the uncached rounds of a partially cached tool loop', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce({ ...pendingCall(), cached: true } as any)
        .mockResolvedValueOnce(finalAnswer() as any);

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: () => 'ok' },
      }).callApi('Weather?');

      // The second round reached Google, so its cost must not be suppressed.
      expect(result.cached).toBe(false);
      expect(result.cost).toBeGreaterThan(0);
    });

    it('does not loop when no callback is registered for the requested tool', async () => {
      mockFetchWithCache.mockResolvedValue(pendingCall() as any);

      await make({
        ...toolConfig,
        functionToolCallbacks: { some_other_tool: () => 'x' },
      }).callApi('Weather?');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    });

    it('stops after the tool-round ceiling instead of looping forever', async () => {
      // A distinct call id each round, so this exercises the ceiling rather than
      // the already-executed guard.
      let round = 0;
      mockFetchWithCache.mockImplementation(async () => {
        round++;
        return interaction({
          id: `v1_${round}`,
          status: 'requires_action',
          steps: [
            {
              type: 'function_call',
              id: `call_${round}`,
              name: 'get_weather',
              arguments: { location: 'Boston' },
            },
          ],
        }) as any;
      });

      const result = await make({
        ...toolConfig,
        functionToolCallbacks: { get_weather: () => 'ok' },
      }).callApi('Weather?');

      // 8 rounds of tool execution plus the round that detects the ceiling.
      expect(mockFetchWithCache).toHaveBeenCalledTimes(9);
      expect(result.error).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('surfaces a Google-shaped error body', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: { error: { message: 'Model not found' } },
        cached: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      const result = await make().callApi('Hello');
      expect(result.error).toBe('Gemini Interactions API error: Model not found');
    });

    it('surfaces a gateway error that has no Google-shaped body', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: '<html>bad gateway</html>',
        cached: false,
        status: 502,
        statusText: 'Bad Gateway',
      } as any);

      const result = await make().callApi('Hello');
      expect(result.error).toBe('Gemini Interactions API error: HTTP 502 Bad Gateway');
    });

    it('surfaces a transport exception', async () => {
      mockFetchWithCache.mockRejectedValue(new Error('socket hang up'));
      const result = await make().callApi('Hello');
      expect(result.error).toContain('socket hang up');
    });

    it('surfaces a failed model_output step', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          steps: [{ type: 'model_output', error: { message: 'generation failed' } }],
        }) as any,
      );
      const result = await make().callApi('Hello');
      expect(result.error).toBe('Gemini Interactions API error: generation failed');
    });

    it('surfaces a terminal non-completed status', async () => {
      mockFetchWithCache.mockResolvedValue(interaction({ status: 'failed' }) as any);
      const result = await make().callApi('Hello');
      expect(result.error).toContain('did not complete (status: failed)');
    });

    it('polls an in-progress interaction until it completes', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(interaction({ id: 'v1_pending', status: 'in_progress' }) as any)
        .mockResolvedValueOnce(interaction({ id: 'v1_pending' }) as any);

      const result = await make().callApi('Hello');

      expect(result.output).toBe('Hello');
      expect(mockFetchWithCache.mock.calls[1][0]).toBe(`${AI_STUDIO_ENDPOINT}/v1_pending`);
      expect((mockFetchWithCache.mock.calls[1][1] as any).method).toBe('GET');
    });

    it('never serves a poll from cache', async () => {
      mockFetchWithCache
        .mockResolvedValueOnce(interaction({ id: 'v1_pending', status: 'in_progress' }) as any)
        .mockResolvedValueOnce(interaction({ id: 'v1_pending' }) as any);

      await make().callApi('Hello');

      // Caching a poll would freeze the interaction on its first in_progress
      // snapshot and guarantee a timeout.
      expect(mockFetchWithCache.mock.calls[1][4]).toBe(true);
    });

    it('times out an interaction that never leaves in_progress', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({ id: 'v1_pending', status: 'in_progress' }) as any,
      );
      // Drive elapsed time explicitly rather than depending on host clock
      // resolution to advance past the deadline mid-loop.
      let now = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        now += 400;
        return now;
      });

      const result = await make({ timeoutMs: 1000 }).callApi('Hello');
      expect(result.error).toContain('timed out after 1000ms');
    });

    it('requires an API key on the AI Studio route', async () => {
      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        config: { vertexai: false } as any,
        env: { GOOGLE_API_KEY: undefined, GEMINI_API_KEY: undefined },
      });
      vi.spyOn(GoogleAuthManager, 'getApiKey').mockReturnValue({ apiKey: undefined } as any);
      vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');

      const result = await provider.callApi('Hello');
      expect(result.error).toContain('requires an API key');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('Vertex route', () => {
    it('posts to the regional Vertex Interactions endpoint with OAuth headers', async () => {
      const headers = new Headers();
      headers.set('Authorization', 'Bearer vertex-token');
      vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockResolvedValue({
        client: {
          getAccessToken: async () => ({ token: 'vertex-token' }),
          getRequestHeaders: async () => headers,
        },
        projectId: 'auth-project',
      } as any);
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        config: { vertexai: true, projectId: 'my-project', region: 'us-central1' } as any,
      });
      const result = await provider.callApi('Hello');

      expect(result.output).toBe('Hello');
      expect(mockFetchWithCache.mock.calls[0][0]).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-project/locations/us-central1/interactions',
      );
      expect((mockFetchWithCache.mock.calls[0][1] as any).headers).toMatchObject({
        Authorization: 'Bearer vertex-token',
        'Api-Revision': '2026-05-20',
      });
    });

    it('defaults to store:true on Vertex, which rejects store:false', async () => {
      mockVertexAuth();
      mockFetchWithCache.mockResolvedValue(interaction() as any);

      const provider = new GoogleInteractionsChatProvider('gemini-3-flash-preview', {
        config: { vertexai: true, projectId: 'p' } as any,
      });
      const result = await provider.callApi('Hello');

      expect(bodyOf(mockFetchWithCache.mock.calls[0]).store).toBe(true);
      expect(result.metadata?.interactionStored).toBe(true);
    });

    it.each(['global', 'us', 'eu'])(
      'serves the %s location from the global aiplatform host',
      async (region) => {
        mockVertexAuth();
        mockFetchWithCache.mockResolvedValue(interaction() as any);

        const provider = new GoogleInteractionsChatProvider('gemini-3-flash-preview', {
          config: { vertexai: true, projectId: 'p', region } as any,
        });
        await provider.callApi('Hello');

        // There is no us-/eu-aiplatform regional host for Interactions; both 404.
        expect(mockFetchWithCache.mock.calls[0][0]).toBe(
          `https://aiplatform.googleapis.com/v1beta1/projects/p/locations/${region}/interactions`,
        );
      },
    );

    it('exposes the endpoint from a configured project without a prior call', () => {
      const provider = new GoogleInteractionsChatProvider('gemini-3-flash-preview', {
        config: { vertexai: true, projectId: 'configured', region: 'global' } as any,
      });
      expect(provider.getApiEndpoint()).toBe(
        'https://aiplatform.googleapis.com/v1beta1/projects/configured/locations/global/interactions',
      );
    });

    it('rejects previousInteractionId on Vertex, which silently drops the history', async () => {
      mockVertexAuth();
      const provider = new GoogleInteractionsChatProvider('gemini-3-flash-preview', {
        config: { vertexai: true, projectId: 'p', previousInteractionId: 'v1_prev' } as any,
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toContain('does not support previousInteractionId');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('continues the Vertex tool loop with inline history, not a stored reference', async () => {
      mockVertexAuth();
      mockFetchWithCache
        .mockResolvedValueOnce(
          interaction({
            id: 'v1_first',
            status: 'requires_action',
            steps: [{ type: 'function_call', id: 'call_1', name: 'get_weather', arguments: {} }],
          }) as any,
        )
        .mockResolvedValueOnce(
          interaction({
            id: 'v1_second',
            steps: [{ type: 'model_output', content: [{ type: 'text', text: '52F' }] }],
          }) as any,
        );

      const provider = new GoogleInteractionsChatProvider('gemini-3-flash-preview', {
        config: {
          vertexai: true,
          projectId: 'p',
          tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
          functionToolCallbacks: { get_weather: () => '52F' },
        } as any,
      });
      const result = await provider.callApi('Weather?');

      const second = bodyOf(mockFetchWithCache.mock.calls[1]);
      // Vertex stores the interaction (it requires store:true) but ignores the
      // reference, so the timeline must be resent for the answer to be correct.
      expect(second.previous_interaction_id).toBeUndefined();
      expect(second.input).toEqual([
        { type: 'user_input', content: [{ type: 'text', text: 'Weather?' }] },
        {
          type: 'function_result',
          call_id: 'call_1',
          name: 'get_weather',
          result: [{ type: 'text', text: '52F' }],
        },
      ]);
      expect(result.output).toBe('52F');
    });

    it('reports a Vertex authentication failure', async () => {
      vi.spyOn(GoogleAuthManager, 'getOAuthClient').mockRejectedValue(new Error('reauth required'));
      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        config: { vertexai: true, projectId: 'p' } as any,
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toContain('Gemini Interactions Vertex AI authentication error');
    });
  });
});

describe('geminiContentsToInteractionsInput', () => {
  it('maps inline and file media parts onto typed content entries', () => {
    expect(
      geminiContentsToInteractionsInput([
        {
          role: 'user',
          parts: [
            { text: 'look' },
            { inlineData: { mimeType: 'image/png', data: 'AAA' } },
            { fileData: { mimeType: 'video/mp4', fileUri: 'gs://b/o' } },
          ],
        },
      ]),
    ).toEqual([
      {
        type: 'user_input',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', mime_type: 'image/png', data: 'AAA' },
          { type: 'video', mime_type: 'video/mp4', uri: 'gs://b/o' },
        ],
      },
    ]);
  });

  it('promotes a functionResponse part to a top-level function_result entry', () => {
    expect(
      geminiContentsToInteractionsInput([
        {
          role: 'user',
          parts: [{ functionResponse: { id: 'call_1', name: 'f', response: { ok: true } } }],
        },
      ]),
    ).toEqual([
      {
        type: 'function_result',
        call_id: 'call_1',
        name: 'f',
        result: [{ type: 'text', text: '{"ok":true}' }],
      },
    ]);
  });

  it('treats model and assistant roles as model output', () => {
    expect(
      geminiContentsToInteractionsInput([{ role: 'model', parts: [{ text: 'hi' }] }])[0],
    ).toMatchObject({ type: 'model_output' });
  });
});

describe('toInteractionsTools', () => {
  it('accepts snake_case Gemini tool shapes', () => {
    expect(
      toInteractionsTools([
        { function_declarations: [{ name: 'f' }] },
        { google_search: {} },
        { code_execution: {} },
      ] as any),
    ).toEqual([
      { type: 'function', name: 'f' },
      { type: 'google_search' },
      { type: 'code_execution' },
    ]);
  });

  it('maps googleSearchRetrieval onto the google_search tool', () => {
    expect(toInteractionsTools([{ googleSearchRetrieval: {} }] as any)).toEqual([
      { type: 'google_search' },
    ]);
  });

  it('ignores declarations without a name', () => {
    expect(toInteractionsTools([{ functionDeclarations: [{ description: 'x' }] }] as any)).toEqual(
      [],
    );
  });
});

describe('shouldUseInteractions', () => {
  it('defaults to the Interactions API for AI Studio chat models', () => {
    expect(shouldUseInteractions('gemini-3.6-flash', {})).toBe(true);
  });

  it.each([
    ['a TTS model', 'gemini-2.5-flash-preview-tts', {}],
    ['configured safetySettings', 'gemini-3.6-flash', { safetySettings: [{ category: 'X' }] }],
    [
      'an audio response modality',
      'gemini-3.6-flash',
      { generationConfig: { responseModalities: ['AUDIO'] } },
    ],
    [
      'a snake_case image modality',
      'gemini-3.6-flash',
      { generationConfig: { response_modalities: ['IMAGE'] } },
    ],
    ['a tool mode Interactions cannot enforce', 'gemini-3.6-flash', { tool_choice: 'required' }],
    [
      'functionCallingConfig.mode ANY',
      'gemini-3.6-flash',
      { toolConfig: { functionCallingConfig: { mode: 'ANY' } } },
    ],
    ['a legacy PaLM model', 'chat-bison-001', {}],
    ['a script-like id', 'custom-model.ts', {}],
  ])('falls back to generateContent for %s', (_label, model, config) => {
    expect(shouldUseInteractions(model, config as any)).toBe(false);
  });

  it('keeps Vertex on generateContent unless explicitly opted in', () => {
    expect(shouldUseInteractions('gemini-3-flash-preview', {}, { vertex: true })).toBe(false);
    expect(
      shouldUseInteractions('gemini-3-flash-preview', { interactions: true } as any, {
        vertex: true,
      }),
    ).toBe(true);
  });

  it('lets an explicit flag override every fallback in both directions', () => {
    // Opting in past a known gap is allowed; the request may fail, but the
    // caller asked for it.
    expect(
      shouldUseInteractions('gemini-2.5-flash-preview-tts', { interactions: true } as any),
    ).toBe(true);
    expect(shouldUseInteractions('gemini-3.6-flash', { interactions: false } as any)).toBe(false);
  });
});
