import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { GoogleAuthManager } from '../../../src/providers/google/auth';
import {
  GoogleInteractionsChatProvider,
  geminiContentsToInteractionsInput,
  toInteractionsTools,
} from '../../../src/providers/google/interactionsChat';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { checkProviderApiKeys } from '../../../src/util/provider';

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
    vi.stubEnv('PALM_API_HOST', '');
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

  it.each(['ambient', 'scoped'])(
    'accepts the generative API key alias during %s preflight',
    async (scope) => {
      for (const name of [
        'GOOGLE_API_KEY',
        'GEMINI_API_KEY',
        'PALM_API_KEY',
        'GOOGLE_GENERATIVE_AI_API_KEY',
      ]) {
        vi.stubEnv(name, '');
      }
      if (scope === 'ambient') {
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'fixture-alias-key');
      }
      const provider = new GoogleInteractionsChatProvider('gemini-3.6-flash', {
        config: { vertexai: false },
        env: scope === 'scoped' ? { GOOGLE_GENERATIVE_AI_API_KEY: 'fixture-alias-key' } : undefined,
      });
      expect(checkProviderApiKeys([provider]).size).toBe(0);
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await provider.callApi('Hello');
      expect(mockFetchWithCache.mock.calls[0][1]?.headers).toMatchObject({
        'x-goog-api-key': 'fixture-alias-key',
      });
    },
  );

  describe('request mapping', () => {
    it.each([
      [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
        { type: 'image', mime_type: 'image/png', data: 'aW1hZ2U=' },
      ],
      [
        { type: 'input_image', image_url: 'https://image.example/ordinary.png' },
        { type: 'image', uri: 'https://image.example/ordinary.png' },
      ],
      [
        { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'MP3' } },
        { type: 'audio', mime_type: 'audio/mpeg', data: 'YXVkaW8=' },
      ],
      [
        { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'pcm16' } },
        { type: 'audio', mime_type: 'audio/pcm', data: 'YXVkaW8=' },
      ],
      [
        { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'audio/wav' } },
        { type: 'audio', mime_type: 'audio/wav', data: 'YXVkaW8=' },
      ],
    ])('normalizes OpenAI media content before requesting: %j', async (part, expected) => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const result = await make().callApi(
        JSON.stringify([
          { role: 'user', content: [{ type: 'text', text: 'Describe this sample.' }, part] },
        ]),
      );

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).input).toEqual([
        {
          type: 'user_input',
          content: [{ type: 'text', text: 'Describe this sample.' }, expected],
        },
      ]);
    });

    it.each([
      { type: 'image_url', image_url: {} },
      { type: 'input_audio', input_audio: { format: 'wav' } },
      {
        type: 'image_url',
        image_url: 'https://image.example/ordinary.png',
        fileData: { fileUri: 'https://image.example/other.png' },
      },
    ])('rejects invalid OpenAI media content before requesting: %j', async (part) => {
      const result = await make().callApi(JSON.stringify([{ role: 'user', content: [part] }]));
      expect(result.error).toContain('Unsupported Gemini prompt part');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it.each(['system_instruction', 'systemInstruction'])(
      'preserves %s in native Gemini prompt wrappers',
      async (field) => {
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        await make().callApi(
          JSON.stringify({
            [field]: { parts: [{ text: 'Reply briefly.' }] },
            contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          }),
        );
        expect(bodyOf(mockFetchWithCache.mock.calls[0])).toMatchObject({
          system_instruction: 'Reply briefly.',
          input: [{ type: 'user_input', content: [{ type: 'text', text: 'Hi' }] }],
        });
      },
    );

    it.each(['apiHost', 'apiBaseUrl'])(
      'renders a configured %s before building the endpoint',
      async (field) => {
        vi.stubEnv('FIXTURE_GOOGLE_HOST', 'http://127.0.0.1:12345');
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        await make({ [field]: '{{env.FIXTURE_GOOGLE_HOST}}' }).callApi('Hello');
        expect(mockFetchWithCache.mock.calls[0][0]).toBe(
          'http://127.0.0.1:12345/v1beta/interactions',
        );
      },
    );

    it('retains latest-turn thought signatures in normalized metadata', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          steps: [
            { type: 'thought', signature: 'old-signature' },
            { type: 'user_input', content: [{ type: 'text', text: 'Hi' }] },
            { type: 'thought', signature: 'current-signature' },
            { type: 'function_call', name: 'lookup', id: 'call-1', signature: 'tool-signature' },
          ],
        }) as any,
      );
      const result = await make().callApi('Hi');
      expect(result.metadata?.thoughtSignatures).toEqual(['current-signature', 'tool-signature']);
    });

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

    it('bypasses persistent caching without a credential-derived cache identity', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make().callApi('Hello');
      const init = mockFetchWithCache.mock.calls[0][1] as any;
      expect(init._authHash).toBeUndefined();
      expect(mockFetchWithCache.mock.calls[0][4]).toBe(true);
    });

    it('busts the cache when the caller asks for fresh results', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make().callApi('Hello', { bustCache: true } as any);
      expect(mockFetchWithCache.mock.calls[0][4]).toBe(true);
    });

    it('does not send an already aborted request', async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await make().callApi('Hello', undefined, { abortSignal: controller.signal });
      expect(result.error).toContain('aborted');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
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

    it.each([
      { passthrough: { serviceTier: 'priority' }, expected: 'priority' },
      { passthrough: { service_tier: 'flex', serviceTier: 'priority' }, expected: 'flex' },
      { passthrough: { serviceTier: 'SERVICE_TIER_PRIORITY' }, expected: 'priority' },
    ])(
      'uses the effective passthrough tier for requests and cost: $expected',
      async ({ passthrough, expected }) => {
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        const result = await make({ service_tier: 'standard', passthrough }).callApi('Hello');
        const body = bodyOf(mockFetchWithCache.mock.calls[0]);
        expect(body.service_tier).toBe(expected);
        expect(body).not.toHaveProperty('serviceTier');
        const reference = await make({ service_tier: expected }).callApi('Hello');
        expect(result.cost).toBe(reference.cost);
        expect(result.cost).toBeGreaterThan(0);
      },
    );

    it('prices a priority request at the actual standard processing tier', async () => {
      mockFetchWithCache.mockResolvedValue({
        ...interaction(),
        headers: { 'x-gemini-service-tier': 'standard' },
      } as any);
      const downgraded = await make({ service_tier: 'priority' }).callApi('Hello');
      const standard = await make({ service_tier: 'standard' }).callApi('Hello');
      expect(downgraded.cost).toBe(standard.cost);
      expect(downgraded.metadata?.serviceTier).toBe('standard');
      expect(downgraded.cost).toBeGreaterThan(0);
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const priority = await make({ service_tier: 'priority' }).callApi('Hello');
      expect(priority.cost).toBeGreaterThan(standard.cost!);
      mockFetchWithCache
        .mockResolvedValueOnce({
          ...interaction({ status: 'in_progress' }),
          headers: { 'x-gemini-service-tier': 'standard' },
        } as any)
        .mockResolvedValueOnce(interaction() as any);
      const polled = await make({ service_tier: 'priority' }).callApi('Hello');
      expect(polled.cost).toBe(standard.cost);
      expect(polled.metadata?.serviceTier).toBe('standard');
    });

    it('renders loaded schema content once after resolving the filename', async () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'interactions-schema-'));
      try {
        fs.writeFileSync(
          path.join(directory, 'schema.json'),
          JSON.stringify({
            type: 'OBJECT',
            properties: { color: { type: 'STRING', description: '{{ description }}' } },
          }),
        );
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        await make({ responseSchema: `file://${directory}/{{ filename }}.json` }).callApi('Hello', {
          vars: { filename: 'schema', description: 'A "color"\n{{ literal }}', literal: 'unused' },
        } as any);
        expect(
          bodyOf(mockFetchWithCache.mock.calls[0]).response_format.schema.properties.color
            .description,
        ).toBe('A "color"\n{{ literal }}');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });

    it.each(['responseSchema', 'response_schema'])(
      'uses the passthrough %s over base schemas',
      async (key) => {
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        await make({
          responseSchema: { type: 'STRING' },
          generationConfig: { response_schema: { type: 'NUMBER' } },
          passthrough: { generation_config: { [key]: { type: 'BOOLEAN' } } },
        }).callApi('Hello');
        expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format.schema).toEqual({
          type: 'boolean',
        });
      },
    );

    it.each(['parametersJsonSchema', 'parameters_json_schema'])(
      'preserves and validates native declaration %s',
      async (field) => {
        const parameters = {
          type: 'object',
          properties: { value: { const: { type: 'STRING' } } },
          required: ['value'],
        };
        const provider = make({
          tools: [{ functionDeclarations: [{ name: 'lookup', [field]: parameters }] }],
        });
        mockFetchWithCache.mockResolvedValue(
          interaction({
            steps: [
              {
                type: 'function_call',
                id: 'native-schema',
                name: 'lookup',
                arguments: { value: { type: 'STRING' } },
              },
            ],
          }) as any,
        );
        const result = await provider.callApi('Return the fixture');
        expect(result.error).toBeUndefined();
        expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools[0].parameters).toEqual(parameters);
        expect(() => provider.validateFunctionToolCall(result.output!)).not.toThrow();
        expect(() =>
          provider.validateFunctionToolCall(
            JSON.stringify([
              { functionCall: { name: 'lookup', args: { value: { type: 'string' } } } },
            ]),
          ),
        ).toThrow(/does not match schema/);
      },
    );

    it.each(['tools', 'passthrough'])(
      'validates native function calls configured through %s',
      async (location) => {
        const tools = [
          {
            type: 'function',
            name: 'lookup',
            parameters: {
              type: 'object',
              properties: { item: { type: 'string' } },
              required: ['item'],
            },
          },
        ];
        const provider = make(location === 'tools' ? { tools } : { passthrough: { tools } });
        mockFetchWithCache.mockResolvedValue(
          interaction({
            steps: [
              {
                type: 'function_call',
                id: 'lookup-1',
                name: 'lookup',
                arguments: { item: 'leaf' },
              },
            ],
          }) as any,
        );
        const result = await provider.callApi('Find a leaf');
        expect(result.error).toBeUndefined();
        expect(() => provider.validateFunctionToolCall(result.output!)).not.toThrow();
        expect(() =>
          provider.validateFunctionToolCall(
            JSON.stringify([{ functionCall: { name: 'lookup', args: { item: 1 } } }]),
          ),
        ).toThrow(/does not match schema/);
      },
    );

    it.each(['tools', 'passthrough'])(
      'validates native schema const and enum values unchanged through %s',
      async (location) => {
        const parameters = {
          type: 'object',
          properties: {
            constant: { const: { type: 'STRING' } },
            choice: { enum: [{ type: 'NUMBER' }, { type: 'BOOLEAN' }] },
          },
          required: ['constant', 'choice'],
        };
        const tools = [{ type: 'function', name: 'lookup', parameters }];
        const provider = make(location === 'tools' ? { tools } : { passthrough: { tools } });
        mockFetchWithCache.mockResolvedValue(
          interaction({
            steps: [
              {
                type: 'function_call',
                id: 'literal-1',
                name: 'lookup',
                arguments: { constant: { type: 'STRING' }, choice: { type: 'NUMBER' } },
              },
            ],
          }) as any,
        );

        const result = await provider.callApi('Select a fixed value');

        expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools[0].parameters).toEqual(parameters);
        expect(() => provider.validateFunctionToolCall(result.output!)).not.toThrow();
        expect(() =>
          provider.validateFunctionToolCall(
            JSON.stringify([
              {
                functionCall: {
                  name: 'lookup',
                  args: { constant: { type: 'string' }, choice: { type: 'number' } },
                },
              },
            ]),
          ),
        ).toThrow(/does not match schema/);
      },
    );

    it('maps a nested generationConfig response schema onto response_format', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        generationConfig: {
          response_schema: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
        },
      }).callApi('Hello');

      // Otherwise opting into Interactions would silently drop structured output.
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format.schema).toEqual({
        type: 'object',
        properties: { color: { type: 'string' } },
      });
    });

    it.each([
      ['responseSchema', 'response_schema'],
      ['response_schema', 'responseSchema'],
    ])('preserves schema precedence across %s and %s aliases', async (camelKey, snakeKey) => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        passthrough: {
          generationConfig: { [camelKey]: { type: 'STRING' } },
          generation_config: {
            [snakeKey]: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
          },
        },
      }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format.schema).toEqual({
        type: 'object',
        properties: { color: { type: 'string' } },
      });
    });

    it('preserves an explicit native response format override', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const responseFormat = { type: 'text', mime_type: 'text/plain' };
      await make({
        responseSchema: { type: 'STRING' },
        passthrough: { response_format: responseFormat },
      }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format).toEqual(responseFormat);
    });

    it.each([false, true])(
      'sends responseSchema in the text response format with Vertex=%s',
      async (vertexai) => {
        if (vertexai) {
          mockVertexAuth();
        }
        mockFetchWithCache.mockResolvedValue(interaction() as any);

        await make({
          vertexai,
          projectId: 'fixture',
          responseSchema: JSON.stringify({
            type: 'OBJECT',
            properties: { color: { type: 'STRING' } },
            required: ['color'],
          }),
        }).callApi('Hello');

        const format = {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: { color: { type: 'string' } },
            required: ['color'],
          },
        };
        expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format).toEqual(
          vertexai ? [format] : format,
        );
      },
    );

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

    it.each([
      {
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      },
      { tool_choice: 'required' },
      { passthrough: { tool_choice: 'required' } },
      { passthrough: { tool_config: { function_calling_config: { mode: 'ANY' } } } },
      { tool_choice: { type: 'function', function: { name: 'f' } } },
      { generationConfig: { thinkingConfig: { thinkingBudget: 512 } } },
      { generationConfig: { responseModalities: ['AUDIO'] } },
      { generationConfig: { response_mime_type: 'text/plain' } },
      { mcp: { enabled: true } },
      { modelArmor: { promptTemplate: 'fixture-policy' } },
      { passthrough: { model_armor_config: { prompt_template_name: 'fixture-policy' } } },
    ])('rejects unsupported effective options before sending: %j', async (config) => {
      const result = await make().callApi('Hello', {
        prompt: { raw: 'Hello', label: 'prompt', config },
      } as any);
      expect(result.error).toBeTruthy();
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('preserves native Gemini media and function-result parts at the call boundary', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const result = await make().callApi(
        JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/png', data: 'fixture' } },
                {
                  file_data: {
                    mime_type: 'application/pdf',
                    file_uri: 'https://example.com/doc.pdf',
                  },
                },
                { functionResponse: { id: 'call_1', name: 'f', response: { ok: true } } },
                { text: 'last' },
              ],
            },
          ],
        }),
      );
      expect(result.error).toBeUndefined();
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).input).toEqual([
        {
          type: 'user_input',
          content: [
            { type: 'image', mime_type: 'image/png', data: 'fixture' },
            { type: 'document', mime_type: 'application/pdf', uri: 'https://example.com/doc.pdf' },
          ],
        },
        {
          type: 'function_result',
          call_id: 'call_1',
          name: 'f',
          result: [{ type: 'text', text: '{"ok":true}' }],
        },
        { type: 'user_input', content: [{ type: 'text', text: 'last' }] },
      ]);
    });

    it('preserves schema instance values and normalizes only schema keywords', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        responseSchema: JSON.stringify({
          type: 'OBJECT',
          properties: { type: { type: 'STRING', const: 'PREMIUM' } },
          const: { type: 'STRING' },
          examples: [{ type: 'PREMIUM' }],
        }),
      }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).response_format.schema).toEqual({
        type: 'object',
        properties: { type: { type: 'string', const: 'PREMIUM' } },
        const: { type: 'STRING' },
        examples: [{ type: 'PREMIUM' }],
      });
    });

    it('maps camel-case passthrough generation config and model overrides', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        passthrough: {
          model: 'other-model',
          generationConfig: { maxOutputTokens: 12, responseSchema: { type: 'STRING' } },
        },
      }).callApi('Hello');
      const body = bodyOf(mockFetchWithCache.mock.calls[0]);
      expect(body).toMatchObject({
        model: 'other-model',
        generation_config: { max_output_tokens: 12 },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: { type: 'string' },
        },
      });
      expect(body.generationConfig).toBeUndefined();
    });

    it('preserves native passthrough tools while withholding disabled functions', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        tool_choice: 'none',
        passthrough: { tools: [{ type: 'google_maps' }, { type: 'function', name: 'f' }] },
      }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual([{ type: 'google_maps' }]);
    });

    it.each([
      {
        googleSearchRetrieval: {
          dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC', dynamicThreshold: 0.8 },
        },
      },
      { functionDeclarations: [{ name: 'f', response: { type: 'STRING' } }] },
      { googleMaps: {} },
      { fileSearch: {} },
      { computerUse: {} },
    ])('rejects tool configuration that cannot be preserved: %j', async (tool) => {
      const result = await make({ tools: [tool] }).callApi('Hello');
      expect(result.error).toContain('not supported');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('retained compatibility coverage', () => {
    it('normalizes both passthrough generation spellings with snake-case precedence', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await make({
        passthrough: {
          generationConfig: { maxOutputTokens: 15, temperature: 0.1 },
          generation_config: { temperature: 0.8 },
        },
      }).callApi('Hello');
      const body = bodyOf(mockFetchWithCache.mock.calls[0]);
      expect(body.generation_config).toMatchObject({ max_output_tokens: 15, temperature: 0.8 });
      expect(body).not.toHaveProperty('generationConfig');
    });

    it.each(['responseSchema', 'response_schema'])(
      'preserves snake-case generation_config %s',
      async (key) => {
        mockFetchWithCache.mockResolvedValue(interaction() as any);
        const result = await make({
          passthrough: {
            generation_config: {
              [key]: { type: 'OBJECT', properties: { color: { type: 'STRING' } } },
              response_mime_type: 'application/json',
            },
          },
        }).callApi('Hello');
        expect(result.error).toBeUndefined();
        const body = bodyOf(mockFetchWithCache.mock.calls[0]);
        expect(body.response_format.schema).toEqual({
          type: 'object',
          properties: { color: { type: 'string' } },
        });
        expect(body.generation_config).toBeUndefined();
      },
    );

    it.each([
      { inlineData: { mimeType: 'image/png', data: 'fixture' } },
      { fileData: { mimeType: 'image/png', fileUri: 'https://example.com/fixture.png' } },
    ])('rejects unsupported function-response media before requesting: %j', async (part) => {
      const result = await make().callApi(
        JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'call_1',
                  name: 'get_weather',
                  response: { ok: true },
                  parts: [part],
                },
              },
            ],
          },
        ]),
      );
      expect(result.error).toContain('Function response media is not supported');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('prices the effective prompt-level Vertex region', async () => {
      mockVertexAuth();
      mockFetchWithCache.mockResolvedValue(
        interaction({ usage: { total_input_tokens: 1000, total_output_tokens: 100 } }) as any,
      );
      const provider = new GoogleInteractionsChatProvider('gemini-3.5-flash-lite', {
        config: { vertexai: true, projectId: 'fixture', region: 'global' },
      });
      const result = await provider.callApi('Hello', {
        vars: {},
        prompt: { raw: 'Hello', label: 'regional', config: { region: 'us' } },
      });
      expect(mockFetchWithCache.mock.calls[0][0]).toContain('/locations/us/interactions');
      expect(result.cost).toBeCloseTo(0.000605);
    });

    it('prices the model selected through passthrough', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const overridden = await make({ passthrough: { model: 'gemini-2.5-pro' } }).callApi('Hello');
      const direct = await new GoogleInteractionsChatProvider('gemini-2.5-pro', {
        config: { apiKey: 'test-key', vertexai: false },
      }).callApi('Hello');
      expect(overridden.cost).toBeGreaterThan(0);
      expect(overridden.cost).toBe(direct.cost);
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).model).toBe('gemini-2.5-pro');
    });

    it('rejects unsupported camel-case passthrough generation settings', async () => {
      const response = await make({
        passthrough: { generationConfig: { thinkingConfig: { thinkingBudget: 128 } } },
      }).callApi('Hello');
      expect(response.error).toContain('thinkingBudget');
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('honors PALM_API_HOST in provider-scoped environment overrides', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      await new GoogleInteractionsChatProvider('gemini-2.5-flash', {
        config: { apiKey: 'test-key', vertexai: false },
        env: { PALM_API_HOST: 'http://127.0.0.1:12345' },
      }).callApi('Hello');
      expect(mockFetchWithCache.mock.calls[0][0]).toBe(
        'http://127.0.0.1:12345/v1beta/interactions',
      );
    });

    it('keeps native tool declarations and withholds native functions when disabled', async () => {
      mockFetchWithCache.mockResolvedValue(interaction() as any);
      const tools = [
        { type: 'function', name: 'echo', parameters: { type: 'object' } },
        { type: 'google_search' },
      ];
      await make({ tools }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[0]).tools).toEqual(tools);
      await make({ tools, tool_choice: 'none' }).callApi('Hello');
      expect(bodyOf(mockFetchWithCache.mock.calls[1]).tools).toEqual([{ type: 'google_search' }]);
    });
  });

  describe('response handling', () => {
    it.each([
      null,
      [],
      'unexpected',
      { steps: {} },
      { steps: [null] },
      { steps: [{ content: [null] }] },
    ])('normalizes malformed success payload %j', async (data) => {
      mockFetchWithCache.mockResolvedValue({ data, cached: false, status: 200 } as any);
      const result = await make().callApi('Hello');
      expect(result.error).toContain('invalid response');
    });

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

    it.each([
      undefined,
      { total_tokens: 12 },
      { total_input_tokens: 10 },
      { total_output_tokens: 2 },
    ])('leaves cost unknown when usage components are missing: %j', async (usage) => {
      mockFetchWithCache.mockResolvedValue(interaction({ usage }) as any);
      const result = await make().callApi('Hello');
      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeUndefined();
      expect(result.tokenUsage?.numRequests).toBe(1);
    });

    it('prices explicit zero usage without requiring a total counter', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({ usage: { total_input_tokens: 0, total_output_tokens: 0 } }) as any,
      );
      const result = await make().callApi('Hello');
      expect(result.cost).toBe(0);
      expect(result.tokenUsage?.numRequests).toBe(1);
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

    it.each([false, true])(
      'retains intermediate model output in stateless history (Vertex: %s)',
      async (vertexai) => {
        if (vertexai) {
          mockVertexAuth();
        }
        const pending = pendingCall();
        pending.data.steps.unshift({
          type: 'model_output',
          content: [{ type: 'text', text: 'Looking up the forecast.' }],
        });
        mockFetchWithCache
          .mockResolvedValueOnce(pending as any)
          .mockResolvedValueOnce(finalAnswer() as any);
        const result = await make({
          ...toolConfig,
          vertexai,
          projectId: 'fixture',
          functionToolCallbacks: { get_weather: () => '52F and rain' },
        }).callApi('Weather in Boston?');
        expect(result.output).toBe('52F and rain');
        expect(
          bodyOf(mockFetchWithCache.mock.calls[1]).input.map((item: any) => item.type),
        ).toEqual(['user_input', 'model_output', 'function_result']);
        expect(bodyOf(mockFetchWithCache.mock.calls[1]).input[1].content).toEqual([
          { type: 'text', text: 'Looking up the forecast.' },
        ]);
      },
    );

    it('does not replay completed callbacks after a continuation rate limit', async () => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
      const callback = vi.fn(() => 'fixture weather');
      const provider = make({ ...toolConfig, functionToolCallbacks: { get_weather: callback } });
      mockFetchWithCache.mockResolvedValueOnce(pendingCall() as any).mockResolvedValue({
        data: { error: { message: 'Rate limit exceeded' } },
        status: 429,
        statusText: 'Too Many Requests',
      } as any);
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      try {
        const result = await registry.execute(
          provider,
          () => provider.callApi('Weather?'),
          createProviderRateLimitOptions(),
        );
        expect(result.error).toContain('Rate limit');
        expect(result.metadata?.rateLimitRetryable).toBe(false);
        expect(result.tokenUsage?.numRequests).toBe(1);
        expect(callback).toHaveBeenCalledOnce();
        expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
        expect(Object.values(registry.getMetrics())[0].retriedRequests).toBe(0);
      } finally {
        registry.dispose();
      }
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

    it('includes component usage for each round that omits total_tokens', async () => {
      const final = finalAnswer();
      delete (final.data.usage as Partial<typeof final.data.usage>).total_tokens;
      mockFetchWithCache
        .mockResolvedValueOnce(pendingCall() as any)
        .mockResolvedValueOnce(final as any);
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

    it.each(['input', 'returned'])(
      'does not replay calls answered in %s history',
      async (where) => {
        const callback = vi.fn(() => 'unused');
        const pending = pendingCall();
        const steps = [
          ...pending.data.steps,
          ...(where === 'returned' ? [{ type: 'function_result', call_id: 'call_1' }] : []),
          ...finalAnswer().data.steps,
        ];
        mockFetchWithCache.mockResolvedValueOnce(interaction({ steps }) as any);
        const prompt =
          where === 'input'
            ? JSON.stringify([
                {
                  role: 'user',
                  parts: [
                    {
                      functionResponse: {
                        id: 'call_1',
                        name: 'get_weather',
                        response: '52F and rain',
                      },
                    },
                  ],
                },
              ])
            : 'Weather?';
        const result = await make({
          ...toolConfig,
          previousInteractionId: 'v1_prev',
          functionToolCallbacks: { get_weather: callback },
        }).callApi(prompt);
        expect(result.output).toBe('52F and rain');
        expect(callback).not.toHaveBeenCalled();
        expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      },
    );

    it('prices each tool round before applying the context tier', async () => {
      const first = pendingCall();
      const final = finalAnswer();
      const usage = { total_input_tokens: 110_000, total_output_tokens: 0 };
      mockFetchWithCache
        .mockResolvedValueOnce(interaction({ ...first.data, usage }) as any)
        .mockResolvedValueOnce(interaction({ ...final.data, usage }) as any);
      const provider = new GoogleInteractionsChatProvider('gemini-2.5-pro', {
        config: {
          apiKey: 'test-key',
          vertexai: false,
          ...toolConfig,
          functionToolCallbacks: { get_weather: () => 'ok' },
        } as any,
      });
      const result = await provider.callApi('Weather?');
      expect(result.tokenUsage).toMatchObject({ prompt: 220_000, numRequests: 2 });
      expect(result.cost).toBeCloseTo(0.275);
    });

    it.each(['http', 'abort'])(
      'retains completed usage and callbacks after a follow-up %s failure',
      async (failure) => {
        const controller = new AbortController();
        mockFetchWithCache.mockResolvedValueOnce(pendingCall() as any);
        if (failure === 'http') {
          mockFetchWithCache.mockResolvedValueOnce({
            data: { error: { message: 'fixture unavailable' } },
            status: 503,
            statusText: 'Unavailable',
          } as any);
        }
        const result = await make({
          ...toolConfig,
          functionToolCallbacks: {
            get_weather: () => {
              if (failure === 'abort') {
                controller.abort();
              }
              return 'ok';
            },
          },
        }).callApi('Weather?', undefined, { abortSignal: controller.signal });
        expect(result.error).toContain(failure === 'abort' ? 'aborted' : 'fixture unavailable');
        expect(result.tokenUsage).toMatchObject({
          total: 30,
          prompt: 10,
          completion: 5,
          numRequests: 1,
        });
        expect(result.cost).toBeGreaterThan(0);
        expect(result.metadata?.toolCalls).toEqual([
          { name: 'get_weather', args: { location: 'Boston' }, result: 'ok' },
        ]);
        expect(mockFetchWithCache).toHaveBeenCalledTimes(failure === 'abort' ? 1 : 2);
      },
    );

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
          result: [{ type: 'text', text: 'Tool execution failed.' }],
        }),
      );
      expect(JSON.stringify(bodyOf(mockFetchWithCache.mock.calls[1]))).not.toContain(
        'upstream down',
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

    it.each(['constructor', 'toString', '__proto__', 'valueOf'])(
      'does not execute inherited object member %s as a callback',
      async (name) => {
        mockFetchWithCache.mockResolvedValue(
          interaction({
            status: 'requires_action',
            steps: [{ type: 'function_call', id: 'call_1', name, arguments: {} }],
          }) as any,
        );

        const result = await make({
          tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
          functionToolCallbacks: { get_weather: () => 'ok' },
        }).callApi('Go');

        // A bare index lookup resolves these to Object.prototype members, which
        // would then be invoked as though the caller had registered them.
        expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
        expect(JSON.parse(result.output as string)[0].functionCall.name).toBe(name);
      },
    );

    it('logs unhandled tool names as structured context, not interpolated text', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'requires_action',
          steps: [
            { type: 'function_call', id: 'call_1', name: 'get_weather', arguments: {} },
            { type: 'function_call', id: 'call_2', name: 'send_email', arguments: {} },
          ],
        }) as any,
      );

      await make({
        tools: [{ functionDeclarations: [{ name: 'get_weather' }] }],
        functionToolCallbacks: { get_weather: () => 'ok' },
      }).callApi('Go');

      // The logger sanitizes context objects, so the real name is reported
      // as-is rather than being mangled into the message.
      const [message, context] = warn.mock.calls[0];
      expect(message).not.toContain('send_email');
      expect(context).toMatchObject({ pending: 2, unhandled: ['send_email'] });
      warn.mockRestore();
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
    it.each([
      { kind: 'failed', continuation: false },
      { kind: 'step', continuation: false },
      { kind: 'http', continuation: false },
      { kind: 'failed', continuation: true },
      { kind: 'step', continuation: true },
      { kind: 'http', continuation: true },
    ])(
      'retains reported usage and actual-tier cost for $kind errors, continuation=$continuation',
      async ({ kind, continuation }) => {
        if (continuation) {
          mockFetchWithCache.mockResolvedValueOnce({
            ...interaction({
              status: 'requires_action',
              steps: [{ type: 'function_call', id: 'call_1', name: 'lookup', arguments: {} }],
            }),
            headers: { 'x-gemini-service-tier': 'standard' },
          } as any);
        }
        mockFetchWithCache.mockResolvedValueOnce({
          ...interaction(
            kind === 'step'
              ? { steps: [{ type: 'model_output', error: { message: 'fixture model failure' } }] }
              : { status: 'failed' },
          ),
          ...(kind === 'http' ? { status: 503, statusText: 'Unavailable' } : {}),
          headers: { 'x-gemini-service-tier': 'standard' },
        } as any);
        const result = await make({
          service_tier: 'priority',
          tools: [{ functionDeclarations: [{ name: 'lookup' }] }],
          functionToolCallbacks: { lookup: () => 'fixed answer' },
        }).callApi('Hello');
        const rounds = continuation ? 2 : 1;
        expect(result.error).toBeTruthy();
        expect(result.tokenUsage).toMatchObject({
          total: 30 * rounds,
          prompt: 10 * rounds,
          completion: 5 * rounds,
          numRequests: rounds,
        });
        expect(mockFetchWithCache).toHaveBeenCalledTimes(rounds);
        if (continuation) {
          expect(result.metadata?.toolCalls).toEqual([
            { name: 'lookup', args: {}, result: 'fixed answer' },
          ]);
          expect(result.metadata?.rateLimitRetryable).toBe(false);
        }
        mockFetchWithCache.mockResolvedValueOnce(interaction() as any);
        const reference = await make({ service_tier: 'standard' }).callApi('Hello');
        expect(result.cost).toBeCloseTo(reference.cost! * rounds, 10);
      },
    );

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

    it.each([
      { steps: [] },
      { steps: [{ type: 'thought', signature: 'budget-signature' }] },
      { steps: [{ type: 'model_output', content: [{ type: 'text', text: '' }] }] },
    ])('reports incomplete responses without usable output: %j', async ({ steps }) => {
      mockFetchWithCache.mockResolvedValue(interaction({ status: 'incomplete', steps }) as any);
      const result = await make({ maxOutputTokens: 1 }).callApi('Hello');
      expect(result.error).toContain('No output');
      expect(result.tokenUsage).toMatchObject({ total: 30, prompt: 10, completion: 5 });
      expect(result.cost).toBeGreaterThan(0);
      expect(result.metadata?.interactionStatus).toBe('incomplete');
    });

    it('retains a pending function call when an interaction is incomplete', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'incomplete',
          steps: [
            { type: 'function_call', id: 'pending', name: 'lookup', arguments: { city: 'Paris' } },
          ],
        }) as any,
      );
      const result = await make().callApi('Hello');
      expect(result.error).toBeUndefined();
      expect(JSON.parse(result.output as string)).toEqual([
        { functionCall: { id: 'pending', name: 'lookup', args: { city: 'Paris' } } },
      ]);
    });

    it('returns the partial output of a truncated interaction instead of failing', async () => {
      mockFetchWithCache.mockResolvedValue(
        interaction({
          status: 'incomplete',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: '**Title:** The' }] }],
        }) as any,
      );

      const result = await make({ maxOutputTokens: 120 }).callApi('Write an essay');

      // generateContent returns truncated text with finishReason MAX_TOKENS, so
      // erroring here would drop real output and diverge from the legacy path.
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('**Title:** The');
      expect(result.metadata?.interactionStatus).toBe('incomplete');
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
    it('uses provider-local cloud location before ambient regions for routing and cost', async () => {
      mockVertexAuth();
      vi.stubEnv('VERTEX_REGION', 'global');
      vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'global');
      mockFetchWithCache.mockResolvedValue(
        interaction({ usage: { total_input_tokens: 1000, total_output_tokens: 100 } }) as any,
      );
      const provider = new GoogleInteractionsChatProvider('gemini-3.5-flash-lite', {
        config: { vertexai: true, projectId: 'fixture' },
        env: { GOOGLE_CLOUD_LOCATION: 'us' },
      });

      const result = await provider.callApi('Hello');

      expect(mockFetchWithCache.mock.calls[0][0]).toContain('/locations/us/interactions');
      expect(result.cost).toBeCloseTo(0.000605);
    });

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
