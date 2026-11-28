import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import { clearModelSpecsCache, WatsonXProvider } from '../../src/providers/watsonx';

vi.mock('@ibm-cloud/watsonx-ai', async (importOriginal) => ({
  ...(await importOriginal()),
  WatsonXAI: { newInstance: vi.fn() },
}));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

const generateText = vi.fn();
const stored = new Map<string, string>();
const cache = {
  get: vi.fn(async (key: string) => stored.get(key)),
  set: vi.fn(async (key: string, value: string) => stored.set(key, value)),
};

function response(version: Record<string, unknown> = {}) {
  return {
    result: {
      model_id: 'ibm/test-model',
      created_at: '2023-10-10T00:00:00Z',
      results: [
        { generated_text: 'Generated text', input_token_count: 5, generated_token_count: 10 },
      ],
      ...version,
    },
  };
}

function provider() {
  return new WatsonXProvider('ibm/test-model', {
    config: { apiBearerToken: 'test-token', projectId: 'test-project', cost: 0 },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  stored.clear();
  clearModelSpecsCache();
  cache.get.mockImplementation(async (key) => stored.get(key));
  cache.set.mockImplementation(async (key, value) => stored.set(key, value));
  vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  vi.mocked(WatsonXAI.newInstance).mockReturnValue({
    generateText,
    listFoundationModelSpecs: vi.fn().mockResolvedValue({ result: { resources: [] } }),
  } as unknown as Awaited<ReturnType<typeof WatsonXAI.newInstance>>);
});

afterEach(() => {
  vi.resetAllMocks();
  clearModelSpecsCache();
  stored.clear();
});

describe('WatsonX optional generation model version', () => {
  it.each([{}, { model_version: '1.0.0' }, { model_version: '' }])(
    'preserves generated text and usage with %j',
    async (version) => {
      const payload = response(version);
      const original = structuredClone(payload);
      generateText.mockResolvedValue(payload);
      const result = await provider().callApi('Test prompt');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Generated text');
      expect(result.tokenUsage).toMatchObject({ prompt: 5, completion: 10, total: 15 });
      expect(payload).toEqual(original);
    },
  );

  it.each([null, 0, false, {}, []])('still rejects invalid model_version %j', async (version) => {
    generateText.mockResolvedValue(response({ model_version: version }));
    const result = await provider().callApi('Test prompt');
    expect(result.error).toContain('Invalid API response structure');
    expect(result.output).toBe('');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each(['model_id', 'created_at', 'results'])('still requires %s', async (key) => {
    const payload = response({ model_version: '1.0.0' });
    Reflect.deleteProperty(payload.result, key);
    generateText.mockResolvedValue(payload);
    const result = await provider().callApi('Test prompt');
    expect(result.error).toContain('Invalid API response structure');
  });

  it('caches and replays a valid response without model_version', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    generateText.mockResolvedValue(response());
    const instance = provider();
    const fresh = await instance.callApi('Cached prompt');
    const replay = await instance.callApi('Cached prompt');
    expect(fresh.error).toBeUndefined();
    expect(fresh.output).toBe('Generated text');
    expect(replay).toMatchObject({ output: 'Generated text', cached: true });
    expect(replay.tokenUsage).toEqual(fresh.tokenUsage);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
