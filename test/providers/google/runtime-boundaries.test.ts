import { randomUUID } from 'node:crypto';

import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheEnabled, withCacheNamespace } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { loadApiProvider } from '../../../src/providers';
import { mockProcessEnv } from '../../util/utils';

const model = 'gemini-3.5-flash-lite';
const tierHeader = 'X-Vertex-AI-LLM-Shared-Request-Type';
type Transport = 'OAuth' | 'Express';

describe('Google public request boundaries', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let restoreEnv: () => void;
  let previousConfig: typeof cliState.config;

  beforeEach(() => {
    previousConfig = cliState.config;
    cliState.config = undefined;
    restoreEnv = mockProcessEnv({
      GOOGLE_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_GENERATIVE_AI_API_KEY: undefined,
      PALM_API_KEY: undefined,
      VERTEX_API_KEY: undefined,
      GOOGLE_API_HOST: undefined,
      GOOGLE_API_BASE_URL: undefined,
      VERTEX_API_HOST: undefined,
      GOOGLE_GENAI_API_HOST: undefined,
      GOOGLE_GENAI_USE_VERTEXAI: undefined,
      HTTP_PROXY: undefined,
      HTTPS_PROXY: undefined,
      ALL_PROXY: undefined,
      http_proxy: undefined,
      https_proxy: undefined,
      all_proxy: undefined,
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url, options) => {
      const headers = new Headers(options?.headers);
      return Response.json({
        candidates: [{ content: { parts: [{ text: headers.get('X-Tenant-Id') ?? 'response' }] } }],
        usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 100 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Keep the real OAuth2Client request and Gaxios header/serialization path.
    // Only credential acquisition and the external fetch boundary are replaced.
    const client = new OAuth2Client({ transporterOptions: { fetchImplementation: fetchMock } });
    client.setCredentials({ access_token: 'test-access-token', expiry_date: 4_102_444_800_000 });
    vi.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue(client);
    vi.spyOn(GoogleAuth.prototype, 'getProjectId').mockResolvedValue('test-project');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    restoreEnv();
    cliState.config = previousConfig;
  });

  function loadVertex(transport: Transport, config: Record<string, unknown> = {}) {
    return loadApiProvider(`vertex:${model}`, {
      options: {
        config: {
          apiHost: 'vertex-gateway.example.test',
          region: 'global',
          projectId: 'test-project',
          ...(transport === 'Express'
            ? { expressMode: true, apiKey: 'test-api-key' }
            : { expressMode: false }),
          ...config,
        },
      },
    });
  }

  function withFreshCache<T>(run: () => Promise<T>) {
    return withCacheNamespace(`google-boundary-${randomUUID()}`, () => withCacheEnabled(true, run));
  }

  function expectVertexRequest(transport: Transport, expectedTier: string) {
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    const suffix = transport === 'OAuth' ? 'projects/test-project/locations/global/' : '';
    expect(String(url)).toBe(
      `https://vertex-gateway.example.test/v1/${suffix}publishers/google/models/${model}:generateContent`,
    );
    const headers = new Headers(options?.headers);
    expect(headers.get(tierHeader)).toBe(expectedTier);
    expect(headers.get('Authorization')).toBe(
      transport === 'OAuth' ? 'Bearer test-access-token' : null,
    );
    expect(headers.get('x-goog-api-key')).toBe(transport === 'Express' ? 'test-api-key' : null);
    const body = JSON.parse(options?.body as string);
    expect(body).not.toHaveProperty('service_tier');
    expect(body).not.toHaveProperty('serviceTier');
    return { headers, body };
  }

  it.each<Transport>(['OAuth', 'Express'])(
    'bypasses the response cache for provider-owned routing headers over %s',
    async (transport) => {
      await withFreshCache(async () => {
        const cache = await getCache();
        const cacheGet = vi.spyOn(cache, 'get');
        const cacheSet = vi.spyOn(cache, 'set');
        const first = await loadVertex(transport, {
          service_tier: 'priority',
          headers: { 'X-Tenant-Id': 'tenant-a' },
        });
        const second = await loadVertex(transport, {
          service_tier: 'priority',
          headers: { 'X-Tenant-Id': 'tenant-b' },
        });

        const a = await first.callApi('same prompt');
        expect(expectVertexRequest(transport, 'priority').headers.get('X-Tenant-Id')).toBe(
          'tenant-a',
        );
        const b = await second.callApi('same prompt');
        expect(expectVertexRequest(transport, 'priority').headers.get('X-Tenant-Id')).toBe(
          'tenant-b',
        );
        const repeated = await second.callApi('same prompt');

        expect([a.output, b.output, repeated.output]).toEqual(['tenant-a', 'tenant-b', 'tenant-b']);
        expect([a.cached, b.cached, repeated.cached]).toEqual([false, false, false]);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(cacheGet).not.toHaveBeenCalled();
        expect(cacheSet).not.toHaveBeenCalled();
      });
    },
  );

  it.each<Transport>(['OAuth', 'Express'])(
    'retains real cache reuse and isolation for tier-only headers over %s',
    async (transport) => {
      await withFreshCache(async () => {
        const cache = await getCache();
        const cacheSet = vi.spyOn(cache, 'set');
        const priority = await loadVertex(transport, { service_tier: 'priority' });
        const flex = await loadVertex(transport, {
          service_tier: 'priority',
          headers: { 'x-VeRtEx-Ai-LlM-ShArEd-ReQuEsT-TyPe': 'flex' },
        });

        expect((await priority.callApi('same prompt')).cached).toBe(false);
        expectVertexRequest(transport, 'priority');
        expect((await flex.callApi('same prompt')).cached).toBe(false);
        expectVertexRequest(transport, 'flex');
        expect((await flex.callApi('same prompt')).cached).toBe(true);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cacheSet).toHaveBeenCalledTimes(2);
        const keys = cacheSet.mock.calls.map(([key]) => key);
        expect(new Set(keys).size).toBe(2);
        for (const key of keys) {
          expect(key).toMatch(/^vertex:gemini-3\.5-flash-lite:[a-f0-9]{64}$/);
          expect(key).not.toContain('test-access-token');
          expect(key).not.toContain('test-api-key');
        }
      });
    },
  );

  it.each(
    (['OAuth', 'Express'] as const).flatMap((transport) =>
      [
        { requested: 'flex', configured: 'priority', trafficType: undefined, cost: 0.000275 },
        { requested: 'priority', configured: 'flex', trafficType: undefined, cost: 0.00099 },
        {
          requested: 'flex',
          configured: 'priority',
          trafficType: 'FUTURE_TRAFFIC_TYPE',
          cost: 0.000275,
        },
        {
          requested: 'flex',
          configured: 'priority',
          trafficType: 'PROVISIONED_THROUGHPUT',
          cost: 0.000275,
        },
        { requested: 'flex', configured: 'priority', trafficType: 'ON_DEMAND', cost: 0.00055 },
        { requested: 'future-tier', configured: 'priority', trafficType: undefined, cost: 0.00055 },
      ].map((testCase) => ({ ...testCase, transport })),
    ),
  )(
    'prices the effective $transport header $requested with actual traffic $trafficType',
    async ({ transport, requested, configured, trafficType, cost }) => {
      await withFreshCache(async () => {
        fetchMock.mockResolvedValueOnce(
          Response.json({
            candidates: [{ content: { parts: [{ text: 'response' }] } }],
            usageMetadata: {
              promptTokenCount: 1_000,
              candidatesTokenCount: 100,
              ...(trafficType === undefined ? {} : { trafficType }),
            },
          }),
        );
        const provider = await loadVertex(transport, {
          service_tier: configured,
          headers: { 'x-VeRtEx-Ai-LlM-ShArEd-ReQuEsT-TyPe': requested },
        });

        const result = await provider.callApi('same prompt', {
          vars: {},
          prompt: {
            raw: 'same prompt',
            label: 'same prompt',
            config: { headers: { [tierHeader]: configured } },
          },
        });

        expect(result.error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expectVertexRequest(transport, requested);
        expect(result.cost).toBeCloseTo(cost, 12);
        if (trafficType === 'ON_DEMAND') {
          expect(result.metadata?.serviceTier).toBe('standard');
        } else {
          expect(result.metadata).not.toHaveProperty('serviceTier');
        }
      });
    },
  );

  it.each(
    (['OAuth', 'Express'] as const).flatMap((transport) =>
      [
        { pricing: { cost: 0 }, expectedCost: 0 },
        { pricing: { inputCost: 0.001, outputCost: 0.002 }, expectedCost: 1.2 },
      ].map((testCase) => ({ ...testCase, transport })),
    ),
  )(
    'preserves explicit $transport prices with a tier override: $expectedCost',
    async ({ transport, pricing, expectedCost }) => {
      await withFreshCache(async () => {
        const provider = await loadVertex(transport, {
          ...pricing,
          service_tier: 'priority',
          headers: { [tierHeader]: 'flex' },
        });

        const result = await provider.callApi('same prompt');

        expect(result.error).toBeUndefined();
        expectVertexRequest(transport, 'flex');
        expect(result.cost).toBeCloseTo(expectedCost, 12);
        expect(result.metadata).not.toHaveProperty('serviceTier');
      });
    },
  );

  it('keeps native tier pricing separate from Vertex request headers', async () => {
    const provider = await loadApiProvider(`google:${model}`, {
      options: {
        config: {
          apiKey: 'native-api-key',
          apiHost: 'generativelanguage.googleapis.com',
          service_tier: 'priority',
          headers: { [tierHeader]: 'flex' },
        },
      },
    });

    const result = await withCacheEnabled(false, () => provider.callApi('native prompt'));

    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    );
    expect(JSON.parse(options?.body as string).service_tier).toBe('priority');
    expect(result.cost).toBeCloseTo(0.00099, 12);
    expect(result.metadata).not.toHaveProperty('serviceTier');
  });
});
