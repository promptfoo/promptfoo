import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import {
  GoogleInteractionsChatProvider,
  geminiContentsToInteractionsInput,
  toInteractionsTools,
} from '../../../src/providers/google/interactionsChat';

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

    it('does not persist credentials in the response cache', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make().callApi('Hello');
      // 5th argument is `bustCache`: always true so the API key never becomes
      // part of a durable cache fingerprint.
      expect(mockFetchWithCache.mock.calls[0][4]).toBe(true);
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

    it('times out an interaction that never leaves in_progress', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({ id: 'v1_pending', status: 'in_progress' }) as any,
      );
      const result = await make({ timeoutMs: 1 }).callApi('Hello');
      expect(result.error).toContain('timed out');
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
