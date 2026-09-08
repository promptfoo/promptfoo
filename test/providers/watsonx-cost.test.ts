import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import {
  clearModelSpecsCache,
  WatsonXChatProvider,
  WatsonXProvider,
} from '../../src/providers/watsonx';

vi.mock('@ibm-cloud/watsonx-ai', () => ({ WatsonXAI: { newInstance: vi.fn() } }));
vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal()),
  getEnvString: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
  fetchWithCache: vi.fn(),
}));

const modelId = 'account/custom-model';
const textResult = {
  result: {
    model_id: modelId,
    model_version: '1',
    created_at: '2026-09-08T00:00:00Z',
    results: [{ generated_text: 'Hello', input_token_count: 10, generated_token_count: 20 }],
  },
};
const chatResult = {
  result: {
    choices: [{ message: { content: 'Hello' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  },
};
function metadata(inputTier: unknown = 'class_c1', outputTier: unknown = 'class_9') {
  return {
    result: { resources: [{ model_id: modelId, input_tier: inputTier, output_tier: outputTier }] },
  };
}
function client(inputTier: unknown = 'class_c1', outputTier: unknown = 'class_9') {
  return {
    generateText: vi.fn().mockResolvedValue(textResult),
    textChat: vi.fn().mockResolvedValue(chatResult),
    listFoundationModelSpecs: vi.fn().mockResolvedValue(metadata(inputTier, outputTier)),
  };
}
function provider(chat = false, config: Record<string, unknown> = {}) {
  const Provider = chat ? WatsonXChatProvider : WatsonXProvider;
  return new Provider('route-label', {
    config: {
      apiBearerToken: 'fixture-account-token',
      projectId: 'fixture-project',
      modelId,
      serviceUrl: 'https://eu-de.ml.cloud.ibm.com',
      version: '2024-05-01',
      ...config,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  clearModelSpecsCache();
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  vi.mocked(fetchWithCache).mockRejectedValue(new Error('Metadata must use the SDK client'));
  vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
});
afterEach(() => {
  expect(fetchWithCache).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  clearModelSpecsCache();
});

describe.each([false, true])('WatsonX regional cost (chat=%s)', (chat) => {
  it('uses the generation client and effective model ID for authenticated regional metadata', async () => {
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const result = await provider(chat).callApi('Hello');

    expect(WatsonXAI.newInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceUrl: 'https://eu-de.ml.cloud.ibm.com',
        version: '2024-05-01',
        authenticator: expect.anything(),
      }),
    );
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledWith({
      filters: `modelid_${modelId}`,
    });
    expect(chat ? regionalClient.textChat : regionalClient.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ modelId }),
    );
    expect(result.output).toBe('Hello');
    expect(result.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
  });

  it.each([
    ['new input tier', 'future_class', 'class_9'],
    ['new output tier', 'class_c1', 'future_class'],
    ['missing input tier', null, 'class_9'],
    ['missing output tier', 'class_c1', null],
  ])(
    'leaves cost unknown for %s while preserving the generated output',
    async (_name, input, output) => {
      const regionalClient = client(input, output);
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      const result = await provider(chat).callApi('Hello');
      expect(result.output).toBe('Hello');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeUndefined();
    },
  );

  it('keeps a metadata failure out of the generation error and retries after recovery', async () => {
    const regionalClient = client();
    regionalClient.listFoundationModelSpecs.mockRejectedValueOnce(
      new Error('Metadata unavailable'),
    );
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider(chat);
    const first = await instance.callApi('Hello');
    const second = await instance.callApi('Hello again');
    expect(first).toMatchObject({ output: 'Hello' });
    expect(first.error).toBeUndefined();
    expect(first.cost).toBeUndefined();
    expect(second.cost).toBeCloseTo((10 * 0.106 + 20 * 0.371) / 1e6, 12);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });

  it.each([
    { cost: 0.01, expected: 0.3 },
    { inputCost: 0.01, outputCost: 0.02, expected: 0.5 },
    { cost: 0.01, outputCost: 0.02, expected: 0.5 },
    { inputCost: 0, outputCost: 0, expected: 0 },
  ])(
    'honors explicit per-token prices without fetching metadata ($expected)',
    async ({ expected, ...config }) => {
      const regionalClient = client();
      vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
      expect((await provider(chat, config).callApi('Hello')).cost).toBeCloseTo(expected, 12);
      expect(regionalClient.listFoundationModelSpecs).not.toHaveBeenCalled();
    },
  );

  it('combines an explicit input price with a known output tier', async () => {
    const regionalClient = client('unknown', 'class_9');
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    expect((await provider(chat, { inputCost: 0.01 }).callApi('Hello')).cost).toBeCloseTo(
      0.1 + (20 * 0.371) / 1e6,
      12,
    );
  });

  it('does not replay old cached responses with fabricated zero costs', async () => {
    const regionalClient = client('unknown', 'unknown');
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    const cache = {
      get: vi.fn(async (key: string) =>
        key.startsWith('watsonx:v2:') ||
        (key.startsWith('watsonx:chat:') && !key.startsWith('watsonx:chat:v3:'))
          ? JSON.stringify({ output: 'Old response', cost: 0 })
          : null,
      ),
      set: vi.fn(),
    };
    vi.mocked(getCache).mockReturnValue(cache as any);
    const response = await provider(chat).callApi('Hello');
    expect(response.output).toBe('Hello');
    expect(response.cost).toBeUndefined();
    expect(response.cached).not.toBe(true);
  });
});

describe('WatsonX metadata cache boundaries', () => {
  it.each([
    ['different regions', { serviceUrl: 'https://jp-tok.ml.cloud.ibm.com' }],
    ['different accounts in the same region', { apiBearerToken: 'other-account-token' }],
    ['different API versions', { version: '2025-01-01' }],
  ])('isolates %s', async (_name, config) => {
    const firstClient = client('class_c1', 'class_c1');
    const secondClient = client('class_9', 'class_9');
    vi.mocked(WatsonXAI.newInstance)
      .mockReturnValueOnce(firstClient as any)
      .mockReturnValueOnce(secondClient as any);
    const first = provider();
    const second = provider(false, config);
    expect((await first.callApi('Hello')).cost).toBeCloseTo((30 * 0.106) / 1e6, 12);
    expect((await second.callApi('Hello')).cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    await first.callApi('Again');
    expect(firstClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
    expect(secondClient.listFoundationModelSpecs).toHaveBeenCalledTimes(1);
  });

  it('refreshes expired metadata', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const regionalClient = client();
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider();
    await instance.callApi('First');
    now.mockReturnValue(1000 + 5 * 60 * 1000);
    regionalClient.listFoundationModelSpecs.mockResolvedValue(metadata('class_9', 'class_9'));
    expect((await instance.callApi('Second')).cost).toBeCloseTo((30 * 0.371) / 1e6, 12);
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });

  it.each([
    { result: { resources: {} } },
    { result: { resources: [] } },
    {
      result: {
        resources: [
          { model_id: 'different-model', input_tier: 'class_c1', output_tier: 'class_c1' },
        ],
      },
    },
  ])('does not cache missing or malformed model metadata: %j', async (unavailable) => {
    const regionalClient = client();
    regionalClient.listFoundationModelSpecs.mockResolvedValueOnce(unavailable as any);
    vi.mocked(WatsonXAI.newInstance).mockReturnValue(regionalClient as any);
    const instance = provider();
    expect((await instance.callApi('First')).cost).toBeUndefined();
    expect((await instance.callApi('Second')).cost).toBeDefined();
    expect(regionalClient.listFoundationModelSpecs).toHaveBeenCalledTimes(2);
  });
});
