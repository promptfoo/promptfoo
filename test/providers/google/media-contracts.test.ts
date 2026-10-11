import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import * as googleUtil from '../../../src/providers/google/util';
import { getProviderPromptOverride } from '../../../src/util/promptMatching';
import { createMockFetchResponse } from '../mockProviderResponses';

import type { GoogleProviderConfig } from '../../../src/providers/google/types';
import type { CallApiContextParams } from '../../../src/types/providers';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  getGoogleClient: vi.fn(),
}));

const model = 'gemini-nano-banana-2.1';
const imageResponse = {
  candidates: [
    {
      content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] },
      finishReason: 'STOP',
    },
  ],
};
const context = (config: GoogleProviderConfig): CallApiContextParams => ({
  vars: {},
  prompt: { raw: 'Draw', label: 'Draw', config },
});

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of [
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GEMINI_API_KEY',
    'PALM_API_KEY',
    'GOOGLE_API_HOST',
    'PALM_API_HOST',
    'GOOGLE_API_BASE_URL',
    'GOOGLE_GENAI_USE_VERTEXAI',
    'VERTEX_API_KEY',
    'VERTEX_PROJECT_ID',
    'GOOGLE_PROJECT_ID',
    'GOOGLE_CLOUD_PROJECT',
    'VERTEX_REGION',
    'GOOGLE_LOCATION',
    'GOOGLE_CLOUD_LOCATION',
  ]) {
    vi.stubEnv(key, '');
  }
  vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(imageResponse));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(['google', 'palm'])('%s Nano Banana routing contracts', (prefix) => {
  const id = `${prefix}:${model}`;

  it.each([
    {
      config: { apiBaseUrl: 'http://gateway.test/custom' },
      env: {},
      base: 'http://gateway.test/custom',
    },
    {
      config: {},
      env: { GOOGLE_API_HOST: 'gateway.test/custom' },
      base: 'https://gateway.test/custom',
    },
    {
      config: {},
      env: { PALM_API_HOST: 'gateway.test/custom' },
      base: 'https://gateway.test/custom',
    },
    {
      config: {},
      env: { GOOGLE_API_BASE_URL: 'http://gateway.test/custom' },
      base: 'http://gateway.test/custom',
    },
    {
      config: { apiHost: 'explicit.test', apiBaseUrl: 'http://ignored.test' },
      env: { GOOGLE_API_HOST: 'ignored.test' },
      base: 'https://explicit.test',
    },
  ])('preserves the configured gateway: $base', async ({ config, env, base }) => {
    const provider = await loadApiProvider(id, {
      options: {
        config: {
          apiKey: 'key',
          vertexai: false,
          apiVersion: 'v1',
          headers: { 'x-gateway-auth': 'synthetic' },
          ...config,
        },
        env,
      },
    });
    expect((await provider.callApi('Draw')).error).toBeUndefined();
    expect(fetchWithCache).toHaveBeenCalledWith(
      `${base}/v1/models/${model}:generateContent`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-gateway-auth': 'synthetic' }),
      }),
      expect.any(Number),
      'json',
      false,
    );
  });

  it.each(['GEMINI_API_KEY', 'PALM_API_KEY'] as const)(
    'keeps provider %s ahead of an eval key',
    async (key) => {
      const provider = await loadApiProvider(id, {
        env: { GOOGLE_GENERATIVE_AI_API_KEY: 'eval-key' },
        options: { config: { vertexai: false }, env: { [key]: 'provider-key' } },
      });
      expect((await provider.callApi('Draw')).error).toBeUndefined();
      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
        'x-goog-api-key': 'provider-key',
      });
    },
  );

  it('preserves legacy PALM-only authentication', async () => {
    const provider = await loadApiProvider(id, {
      options: { config: { vertexai: false }, env: { PALM_API_KEY: 'legacy-key' } },
    });
    expect((await provider.callApi('Draw')).error).toBeUndefined();
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
      'x-goog-api-key': 'legacy-key',
    });
  });

  it('keeps provider-scoped Vertex credentials and projects ahead of eval aliases', async () => {
    const provider = await loadApiProvider(id, {
      env: { VERTEX_API_KEY: 'eval-key' },
      options: { config: { vertexai: true }, env: { GOOGLE_API_KEY: 'provider-key' } },
    });
    expect((await provider.callApi('Draw')).error).toBeUndefined();
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
      'x-goog-api-key': 'provider-key',
    });
    const request = vi.fn().mockResolvedValue({ data: imageResponse });
    vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({ client: { request } } as never);
    const oauth = await loadApiProvider(id, {
      env: { VERTEX_PROJECT_ID: 'eval-project' },
      options: {
        config: { vertexai: true, expressMode: false },
        env: { GOOGLE_PROJECT_ID: 'provider-project' },
      },
    });
    expect((await oauth.callApi('Draw')).error).toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/projects/provider-project/') }),
    );
  });

  it.each([
    { config: {}, env: { GOOGLE_GENAI_USE_VERTEXAI: 'true' }, vertex: true },
    { config: {}, env: { GOOGLE_GENAI_USE_VERTEXAI: '1' }, vertex: true },
    { config: { projectId: 'project' }, env: {}, vertex: true },
    { config: {}, env: { GOOGLE_PROJECT_ID: 'project' }, vertex: true },
    { config: { vertexai: false }, env: { GOOGLE_GENAI_USE_VERTEXAI: 'true' }, vertex: false },
    {
      config: { projectId: 'project' },
      env: { GOOGLE_GENAI_USE_VERTEXAI: 'false' },
      vertex: false,
    },
    { config: { vertexai: true }, env: { GOOGLE_GENAI_USE_VERTEXAI: 'false' }, vertex: true },
    { config: {}, env: { GOOGLE_GENAI_USE_VERTEXAI: undefined }, vertex: true },
  ])(
    'normalizes credential scope using effective Vertex mode: %j',
    async ({ config, env, vertex }) => {
      const provider = await loadApiProvider(id, {
        env: { VERTEX_API_KEY: 'eval-key', GOOGLE_GENAI_USE_VERTEXAI: 'true' },
        options: {
          config: { expressMode: true, ...config },
          env: { GOOGLE_API_KEY: 'provider-key', ...env },
        },
      });
      expect((await provider.callApi('Draw')).error).toBeUndefined();
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(request?.headers).toMatchObject({ 'x-goog-api-key': 'provider-key' });
      expect(String(url).includes('/publishers/google/')).toBe(vertex);
    },
  );

  it('normalizes aliases when ambient environment selects Vertex mode', async () => {
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true');
    const provider = await loadApiProvider(id, {
      env: { VERTEX_API_KEY: 'eval-key' },
      options: { env: { GOOGLE_API_KEY: 'provider-key' } },
    });
    expect((await provider.callApi('Draw')).error).toBeUndefined();
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
      'x-goog-api-key': 'provider-key',
    });
  });

  it('retains custom provider IDs used by prompt selection', async () => {
    const provider = await loadApiProvider(id, {
      options: { id: 'custom-target', config: { apiKey: 'key', vertexai: false } },
    });
    expect(provider.id()).toBe('custom-target');
    expect(getProviderPromptOverride(provider, { 'custom-target': ['selected'] })).toEqual([
      'selected',
    ]);
  });

  it.each([
    { bustCache: true, debug: false, bypass: true },
    { bustCache: false, debug: true, bypass: false },
    { debug: true, bypass: true },
  ])('honors per-call cache policy: %j', async ({ bypass, ...policy }) => {
    const provider = await loadApiProvider(id, {
      options: { config: { apiKey: 'key', vertexai: false } },
    });
    await provider.callApi('Draw', { ...context({}), ...policy });
    expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBe(bypass);
  });
});

describe('image prompt configuration', () => {
  it.each(['native', 'vertex-express', 'vertex-oauth'])(
    'uses prompt options for %s request, validation and cost without leaking into the next call',
    async (mode) => {
      const request = vi.fn().mockResolvedValue({ data: imageResponse });
      vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({ client: { request } } as never);
      const provider = await loadApiProvider(`google:${model}`, {
        options: {
          config: {
            ...(mode === 'vertex-oauth'
              ? { projectId: 'project', expressMode: false }
              : { apiKey: 'key' }),
            vertexai: mode !== 'native',
            imageSize: '1K',
            imageAspectRatio: '1:1',
          },
        },
      });
      const result = await provider.callApi(
        'Draw',
        context({
          maxOutputTokens: 128,
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: { imageSize: '4K', aspectRatio: '16:9' },
          },
          tools: [{ googleSearch: {} }],
        }),
      );
      const body =
        mode === 'vertex-oauth'
          ? request.mock.calls[0][0].data
          : JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(result.error).toBeUndefined();
      expect(body).toMatchObject({
        generationConfig: {
          maxOutputTokens: 128,
          responseModalities: ['IMAGE'],
          imageConfig: { imageSize: '4K', aspectRatio: '16:9' },
        },
        tools: [{ googleSearch: {} }],
      });
      expect(result.cost).toBeCloseTo(0.1134, 12);
      expect((await provider.callApi('Draw again')).cost).toBeCloseTo(0.0336, 12);
      const callsBefore =
        mode === 'vertex-oauth'
          ? request.mock.calls.length
          : vi.mocked(fetchWithCache).mock.calls.length;
      expect(
        (
          await provider.callApi(
            'Invalid',
            context({ generationConfig: { imageConfig: { imageSize: '512px' } } }),
          )
        ).error,
      ).toContain('only supports imageSize');
      expect((await provider.callApi('Invalid', context({ temperature: 0 }))).error).toContain(
        'does not support temperature',
      );
      expect(
        mode === 'vertex-oauth'
          ? request.mock.calls.length
          : vi.mocked(fetchWithCache).mock.calls.length,
      ).toBe(callsBefore);
    },
  );
});

describe('image passthrough requests', () => {
  it.each(['native', 'vertex-express', 'vertex-oauth'])(
    'preserves instructions and merged tools on %s',
    async (mode) => {
      const request = vi.fn().mockResolvedValue({ data: imageResponse });
      vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({ client: { request } } as never);
      const provider = await loadApiProvider(`google:${model}`, {
        options: {
          config: {
            ...(mode === 'vertex-oauth'
              ? { projectId: 'project', expressMode: false }
              : { apiKey: 'key' }),
            vertexai: mode !== 'native',
            systemInstruction: 'Provider instruction',
            tools: [
              { codeExecution: {} },
              { functionDeclarations: [{ name: 'disabled_function' }] },
            ],
            tool_choice: 'none',
            passthrough: {
              system_instruction: { parts: [{ text: 'Passthrough instruction' }] },
              tools: { googleSearch: {} },
            },
          },
        },
      });
      expect((await provider.callApi('Draw')).error).toBeUndefined();
      const body =
        mode === 'vertex-oauth'
          ? request.mock.calls[0][0].data
          : JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'Passthrough instruction' }] });
      expect(body.system_instruction).toBeUndefined();
      expect(body.tools).toEqual([{ codeExecution: {} }, { googleSearch: {} }]);
      expect(body.toolConfig.functionCallingConfig.mode).toBe('NONE');
    },
  );

  it.each(['systemInstruction', 'system_instruction'])(
    'honors explicit null %s to clear provider instructions',
    async (key) => {
      const provider = await loadApiProvider(`google:${model}`, {
        options: {
          config: {
            apiKey: 'key',
            vertexai: false,
            systemInstruction: 'Provider instruction',
            passthrough: { [key]: null },
          },
        },
      });
      await provider.callApi('Draw');
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.systemInstruction).toBeUndefined();
      expect(body.system_instruction).toBeUndefined();
    },
  );

  it('validates and prices the final raw generation override', async () => {
    const provider = await loadApiProvider(`google:${model}`, {
      options: {
        config: {
          apiKey: 'key',
          vertexai: false,
          temperature: 0,
          imageSize: '1K',
          passthrough: {
            generationConfig: { responseModalities: ['IMAGE'], imageConfig: { imageSize: '4K' } },
          },
        },
      },
    });
    const result = await provider.callApi('Draw');
    expect(result.error).toBeUndefined();
    expect(result.cost).toBeCloseTo(0.1134, 12);
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.generationConfig).toEqual({
      responseModalities: ['IMAGE'],
      imageConfig: { imageSize: '4K' },
    });
    const calls = vi.mocked(fetchWithCache).mock.calls.length;
    expect(
      (
        await provider.callApi(
          'Invalid sampling',
          context({ passthrough: { generationConfig: { temperature: 0 } } }),
        )
      ).error,
    ).toContain('does not support temperature');
    expect(
      (
        await provider.callApi(
          'Invalid size',
          context({ passthrough: { generationConfig: { imageConfig: { imageSize: '512px' } } } }),
        )
      ).error,
    ).toContain('only supports imageSize');
    expect(fetchWithCache).toHaveBeenCalledTimes(calls);
  });
});

describe('native terminal stream chunks', () => {
  const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 };
  const ratings = [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }];
  it.each(['STOP', 'MAX_TOKENS'])(
    'retains output, usage, cost and safety on contentless %s',
    async (finishReason) => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse([
          { candidates: [{ content: { parts: [{ text: 'Partial output' }] } }] },
          { candidates: [{ finishReason, safetyRatings: ratings }] },
          { usageMetadata },
        ]),
      );
      const provider = await loadApiProvider('google:gemini-2.5-flash', {
        options: { config: { apiKey: 'key', streaming: true } },
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Partial output');
      expect(result.guardrails).toMatchObject({ flaggedOutput: true, flagged: true });
      expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 2, total: 12 });
      expect(result.cost).toBeGreaterThan(0);
    },
  );

  it('retains TTS audio across a contentless MAX_TOKENS terminator', async () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse([
        {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: { mimeType: 'audio/l16;rate=24000', data: pcm.toString('base64') },
                  },
                ],
              },
            },
          ],
        },
        { candidates: [{ finishReason: 'MAX_TOKENS' }], usageMetadata },
      ]),
    );
    const provider = await loadApiProvider('google:gemini-3.8-flash-tts', {
      options: { config: { apiKey: 'key', streaming: true } },
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toBeUndefined();
    expect(result.audio?.format).toBe('wav');
    expect(Buffer.from(result.audio?.data ?? '', 'base64').subarray(44)).toEqual(pcm);
  });

  it('retains earlier safety ratings when a terminal chunk omits them', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse([
        { candidates: [{ content: { parts: [{ text: 'Output' }] }, safetyRatings: ratings }] },
        { candidates: [{ finishReason: 'STOP' }], usageMetadata },
      ]),
    );
    const provider = await loadApiProvider('google:gemini-2.5-flash', {
      options: { config: { apiKey: 'key', streaming: true } },
    });
    expect((await provider.callApi('Hello')).guardrails?.flaggedOutput).toBe(true);
  });

  it.each(['SAFETY', 'RECITATION'])(
    'keeps terminal %s refusals as errors',
    async (finishReason) => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse([
          { candidates: [{ content: { parts: [{ text: 'Partial output' }] } }] },
          { candidates: [{ finishReason, safetyRatings: ratings }], usageMetadata },
        ]),
      );
      const provider = await loadApiProvider('google:gemini-2.5-flash', {
        options: { config: { apiKey: 'key', streaming: true } },
      });
      const result = await provider.callApi('Hello');
      expect(result.error).toContain(finishReason);
      expect(result.output).toBeUndefined();
    },
  );
});

describe('Vertex terminal stream chunks', () => {
  const pcm = Buffer.from([1, 0, 2, 0]);
  const usageMetadata = {
    promptTokenCount: 10,
    candidatesTokenCount: 2,
    totalTokenCount: 12,
    trafficType: 'ON_DEMAND',
  };
  const audioChunks = [0, 2].map((start) => ({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/l16;rate=24000',
                data: pcm.subarray(start, start + 2).toString('base64'),
              },
            },
          ],
        },
      },
    ],
  }));

  async function callStream(chunks: unknown[], model = 'gemini-3.8-flash-tts') {
    const request = vi.fn().mockResolvedValue({ data: chunks });
    vi.mocked(googleUtil.getGoogleClient).mockResolvedValue({ client: { request } } as never);
    const provider = await loadApiProvider(`vertex:${model}`, {
      options: {
        config: {
          projectId: 'fixture-project',
          region: 'global',
          expressMode: false,
          streaming: true,
        },
      },
    });
    const result = await provider.callApi('Speak', { ...context({}), bustCache: true });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining(`/${model}:streamGenerateContent`),
      }),
    );
    return result;
  }

  it.each(
    ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'].flatMap((model) =>
      ['STOP', 'MAX_TOKENS'].map((finishReason) => ({ model, finishReason })),
    ),
  )(
    'preserves $model audio and final usage after contentless $finishReason',
    async ({ model, finishReason }) => {
      const result = await callStream(
        [...audioChunks, { candidates: [{ finishReason }], usageMetadata }],
        model,
      );
      expect(result.error).toBeUndefined();
      expect(result.audio?.format).toBe('wav');
      expect(Buffer.from(result.audio?.data ?? '', 'base64').subarray(44)).toEqual(pcm);
      expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 2, total: 12 });
      expect(result.metadata).toMatchObject({ trafficType: 'ON_DEMAND' });
      expect(result.cost).toBeGreaterThan(0);
    },
  );

  it('preserves ordinary Vertex text across a contentless STOP terminator', async () => {
    const result = await callStream(
      [
        { candidates: [{ content: { parts: [{ text: 'Partial output' }] } }] },
        { candidates: [{ finishReason: 'STOP' }], usageMetadata },
      ],
      'gemini-3.8-flash',
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Partial output');
    expect(result.tokenUsage).toMatchObject({ prompt: 10, completion: 2, total: 12 });
  });

  it.each(['STOP', 'MAX_TOKENS'])('rejects a terminal-only %s stream', async (finishReason) => {
    const result = await callStream([{ candidates: [{ finishReason }], usageMetadata }]);
    expect(result.error).toContain('No output found');
    expect(result.output).toBeUndefined();
    expect(result.audio).toBeUndefined();
  });

  it.each(['SAFETY', 'RECITATION'])(
    'preserves %s refusals after partial audio',
    async (finishReason) => {
      const result = await callStream([
        ...audioChunks,
        { candidates: [{ finishReason }], usageMetadata },
      ]);
      expect(result.error).toContain(finishReason);
      expect(result.guardrails).toMatchObject({ flagged: true, flaggedOutput: true });
      expect(result.output).toBeUndefined();
      expect(result.audio).toBeUndefined();
    },
  );

  it('keeps missing nonterminal content as an error', async () => {
    const result = await callStream([...audioChunks, { candidates: [{}], usageMetadata }]);
    expect(result.error).toContain('No output found');
    expect(result.audio).toBeUndefined();
  });
});
