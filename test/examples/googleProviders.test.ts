import path from 'node:path';

import { GoogleAuth } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion, runAssertions } from '../../src/assertions';
import { disableCache, enableCache, fetchWithCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { renderPrompt } from '../../src/evaluatorHelpers';
import { resolveConfigs } from '../../src/util/config/load';
import {
  buildConfiguredProviderMap,
  resolveConfiguredProviderReference,
} from '../../src/util/gradingProvider';
import { checkProviderApiKeys } from '../../src/util/provider';
import { mockProcessEnv } from '../util/utils';

import type { AtomicTestCase } from '../../src/types';

const { oauthRequest } = vi.hoisted(() => ({ oauthRequest: vi.fn() }));

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

type WireRequest = {
  url: string;
  body: Record<string, unknown>;
  auth: 'native' | 'oauth';
  headers?: HeadersInit;
};

describe('Google example provider contracts', () => {
  let restoreEnv: () => void;
  let previousCliState: Pick<typeof cliState, 'basePath' | 'config' | 'selectedProviderConfigs'>;
  let cacheWasEnabled: boolean;
  let requests: WireRequest[];
  let imageOutcome: 'image' | 'text-only' | 'blocked';

  function respond({ url, body }: WireRequest) {
    if (url.endsWith(':embedContent')) {
      return { embedding: { values: [1, 0, 0] } };
    }
    if (url.endsWith('text-embedding-005:predict')) {
      return {
        predictions: [{ embeddings: { values: [1, 0, 0], statistics: { token_count: 2 } } }],
      };
    }
    if (!url.endsWith(':generateContent')) {
      throw new Error(`Unexpected example request: ${url}`);
    }
    const generationConfig = body.generationConfig as { responseModalities?: string[] };
    const isImage = generationConfig?.responseModalities?.includes('IMAGE');
    if (isImage && imageOutcome === 'blocked') {
      return { promptFeedback: { blockReason: 'SAFETY' } };
    }
    const tools = body.tools as { functionDeclarations?: unknown[] }[] | undefined;
    const isWeather = tools?.some((tool) => tool.functionDeclarations?.length);
    const parts = isImage
      ? [
          { text: 'Here is your illustration.' },
          ...(imageOutcome === 'image'
            ? [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }]
            : []),
        ]
      : isWeather
        ? [{ functionCall: { name: 'get_current_weather', args: { location: 'San Francisco' } } }]
        : [
            {
              text: JSON.stringify({
                pass: true,
                score: 1,
                reason: 'The output requests weather.',
              }),
            },
          ];
    return {
      candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      GOOGLE_API_KEY: 'example-native-key',
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      PALM_API_KEY: undefined,
      VERTEX_API_KEY: undefined,
      GOOGLE_PROJECT_ID: undefined,
      GOOGLE_CLOUD_PROJECT: undefined,
      VERTEX_PROJECT_ID: undefined,
      GOOGLE_API_HOST: undefined,
      GOOGLE_API_BASE_URL: undefined,
      PALM_API_HOST: undefined,
      VERTEX_API_HOST: undefined,
      VERTEX_API_VERSION: undefined,
      VERTEX_PUBLISHER: undefined,
      VERTEX_REGION: undefined,
      GOOGLE_CLOUD_LOCATION: undefined,
      GOOGLE_GENAI_USE_VERTEXAI: undefined,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: 'false',
    });
    previousCliState = {
      basePath: cliState.basePath,
      config: cliState.config,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
    };
    cliState.config = undefined;
    cacheWasEnabled = isCacheEnabled();
    disableCache();
    requests = [];
    imageOutcome = 'image';
    // Stub the shared SDK prototype: lazy-loaded embedding providers can reach
    // it through a native import as well as Vitest's transformed module graph.
    vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      request: oauthRequest,
    } as unknown as Awaited<ReturnType<GoogleAuth['getClient']>>);
    vi.spyOn(GoogleAuth.prototype, 'getProjectId').mockImplementation(
      async () => 'sdk-detected-project',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Unexpected unmocked network request')),
    );
    vi.mocked(fetchWithCache).mockImplementation(async (url, options) => {
      const request: WireRequest = {
        url: String(url),
        body: JSON.parse(String(options?.body)),
        headers: options?.headers,
        auth: 'native',
      };
      requests.push(request);
      return { data: respond(request), cached: false, status: 200, statusText: 'OK' };
    });
    oauthRequest.mockImplementation(async ({ url, data, headers }) => {
      const request: WireRequest = { url, body: data, headers, auth: 'oauth' };
      requests.push(request);
      return { data: respond(request) };
    });
  });

  afterEach(() => {
    restoreEnv();
    Object.assign(cliState, previousCliState);
    if (cacheWasEnabled) {
      enableCache();
    }
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  async function loadExample(directory: string, filename = 'promptfooconfig.yaml') {
    const { testSuite } = await resolveConfigs(
      { config: [path.resolve(__dirname, '../../examples', directory, filename)] },
      {},
    );
    const firstTest = testSuite.tests![0];
    const defaults = testSuite.defaultTest;
    if (typeof defaults === 'string') {
      throw new Error('Expected the loader to resolve defaultTest');
    }
    const test = {
      ...defaults,
      ...firstTest,
      options: { ...defaults?.options, ...firstTest.options },
      assert: [...(defaults?.assert ?? []), ...(firstTest.assert ?? [])],
    } as AtomicTestCase;
    // Use the same configured-reference resolution as the evaluator, so a grader
    // that accidentally becomes an id-only reference inherits the target's tools.
    test.options!.provider = resolveConfiguredProviderReference(
      test.options?.provider,
      buildConfiguredProviderMap(testSuite.providers),
    );
    const provider = testSuite.providers[0];
    const prompt = await renderPrompt(testSuite.prompts[0], test.vars ?? {}, undefined, provider);
    return { testSuite, test, provider, prompt };
  }

  describe.each([
    { filename: 'promptfooconfig.yaml', vertex: false, imageSize: '1K', grounded: false },
    { filename: 'promptfooconfig-advanced.yaml', vertex: true, imageSize: '2K', grounded: false },
    {
      filename: 'promptfooconfig-gemini-grounding.yaml',
      vertex: false,
      imageSize: '1K',
      grounded: true,
    },
  ])('$filename', ({ filename, vertex, imageSize, grounded }) => {
    beforeEach(() => {
      if (vertex) {
        mockProcessEnv({ GOOGLE_API_KEY: undefined, GOOGLE_PROJECT_ID: 'example-project' });
      }
    });

    it.each(['image', 'text-only', 'blocked'] as const)(
      'routes and grades a %s response',
      async (outcome) => {
        imageOutcome = outcome;
        const { test, provider, prompt } = await loadExample('google-imagen', filename);
        expect(checkProviderApiKeys([provider]).size).toBe(0);
        const response = await provider.callApi(prompt, {
          vars: test.vars ?? {},
          prompt: { raw: prompt, label: prompt },
        });
        const grading = await runAssertions({ test, provider, prompt, providerResponse: response });
        expect(grading.pass).toBe(outcome === 'image');
        expect(grading.score).toBe(outcome === 'image' ? 1 : 0);
        if (outcome === 'image') {
          expect(response).toMatchObject({
            output: 'Here is your illustration.',
            images: [{ data: 'data:image/png;base64,aW1hZ2U=', mimeType: 'image/png' }],
            tokenUsage: { prompt: 10, completion: 20, total: 30 },
          });
        } else if (outcome === 'blocked') {
          expect(response.error).toMatch(/SAFETY|blocked/i);
        } else {
          expect(response.output).toBe('Here is your illustration.');
          expect(response.images ?? []).toHaveLength(0);
        }
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
          auth: vertex ? 'oauth' : 'native',
          url: vertex
            ? 'https://aiplatform.googleapis.com/v1/projects/example-project/locations/global/publishers/google/models/gemini-3.1-flash-image:generateContent'
            : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent',
          body: {
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '16:9', imageSize },
            },
          },
        });
        expect(new Headers(requests[0].headers).get('x-goog-api-key')).toBe(
          vertex ? null : 'example-native-key',
        );
        if (grounded) {
          expect(requests[0].body.tools).toEqual([{ googleSearch: {} }]);
        }
      },
    );
  });

  it('rejects the native image example without credentials before any request', async () => {
    mockProcessEnv({ GOOGLE_API_KEY: undefined });
    const { provider, prompt } = await loadExample('google-imagen');
    expect(checkProviderApiKeys([provider]).size).toBe(1);
    expect((await provider.callApi(prompt)).error).toContain('Gemini image models require either:');
    expect(requests).toHaveLength(0);
  });

  it('runs every provider in the native image comparison with structured-image assertions', async () => {
    const { testSuite, test, prompt } = await loadExample(
      'google-imagen',
      'promptfooconfig-gemini.yaml',
    );
    for (const provider of testSuite.providers) {
      const response = await provider.callApi(prompt);
      expect(
        (await runAssertions({ test, provider, prompt, providerResponse: response })).pass,
      ).toBe(true);
      expect(requests.at(-1)?.url).toBe(
        `https://generativelanguage.googleapis.com/v1beta/models/${provider.id().slice('google:'.length)}:generateContent`,
      );
    }
    expect(requests).toHaveLength(testSuite.providers.length);
    expect(oauthRequest).not.toHaveBeenCalled();
  });

  it.each([
    { directory: 'google-aistudio-tools', vertex: false },
    { directory: 'google-vertex-tools', vertex: true },
  ])(
    '$directory keeps target tools and selects its configured graders',
    async ({ directory, vertex }) => {
      if (vertex) {
        mockProcessEnv({ GOOGLE_API_KEY: undefined, GOOGLE_PROJECT_ID: 'example-project' });
      }
      const { provider, test, prompt } = await loadExample(directory);
      expect(checkProviderApiKeys([provider]).size).toBe(0);
      const response = await provider.callApi(prompt, {
        vars: test.vars ?? {},
        prompt: { raw: prompt, label: prompt },
      });
      expect(response.error).toBeUndefined();
      expect(
        (await runAssertions({ test, provider, prompt, providerResponse: response })).pass,
      ).toBe(true);
      expect(requests[0].body.tools).toEqual([
        expect.objectContaining({
          functionDeclarations: [expect.objectContaining({ name: 'get_current_weather' })],
        }),
      ]);
      // Native examples currently use deterministic assertions. Exercise their
      // declared optional graders too, without substituting any provider config.
      const similarity = await runAssertion({
        test,
        provider,
        prompt,
        providerResponse: response,
        assertion: {
          type: 'similar',
          value: 'San Francisco',
          transform: 'output[0].functionCall.args.location',
        },
      });
      expect(similarity.pass).toBe(true);
      const rubric = await runAssertion({
        test,
        provider,
        prompt,
        providerResponse: response,
        assertion: { type: 'llm-rubric', value: 'The output requests the weather.' },
      });
      expect(rubric.pass).toBe(true);
      const embeddingRequests = requests.filter(
        ({ url }) => url.endsWith(':embedContent') || url.endsWith(':predict'),
      );
      expect(embeddingRequests.length).toBeGreaterThanOrEqual(2);
      for (const request of embeddingRequests) {
        expect(request.url).toBe(
          vertex
            ? 'https://us-central1-aiplatform.googleapis.com/v1/projects/example-project/locations/us-central1/publishers/google/models/text-embedding-005:predict'
            : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
        );
      }
      const textRequests = requests.filter(({ url }) => url.endsWith(':generateContent'));
      expect(textRequests).toHaveLength(2);
      expect(textRequests[1].body.tools ?? []).toEqual([]);
      expect(textRequests[1].url).toBe(
        vertex
          ? 'https://aiplatform.googleapis.com/v1/projects/example-project/locations/global/publishers/google/models/gemini-3.8-flash:generateContent'
          : 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      );
      expect(requests.every(({ auth }) => auth === (vertex ? 'oauth' : 'native'))).toBe(true);
    },
  );
});
