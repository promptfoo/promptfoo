import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import { ReplicateImageProvider } from '../../src/providers/replicate';
import { createMockFetchResponse } from './mockProviderResponses';

vi.mock('../../src/cache');
afterEach(() => vi.resetAllMocks());

const wrappers = [
  {
    wrapper: { prefix: 'photo of ', suffix: ', studio lighting' },
    expected: 'photo of a cat, studio lighting',
  },
  { wrapper: { prefix: 'photo of ' }, expected: 'photo of a cat' },
  { wrapper: { suffix: ', studio lighting' }, expected: 'a cat, studio lighting' },
  { wrapper: {}, expected: 'a cat' },
  { wrapper: { prefix: '', suffix: '' }, expected: 'a cat' },
  { wrapper: undefined, expected: 'a cat' },
];

describe('Replicate image prompt wrappers', () => {
  it.each(
    wrappers.flatMap((entry) =>
      ['black-forest-labs/flux-dev', 'owner/model:version123'].map((model) => ({
        ...entry,
        model,
      })),
    ),
  )('formats $wrapper for $model', async ({ wrapper, expected, model }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        id: 'fixture',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      }),
    );
    const config = {
      apiKey: 'fixture-only',
      width: 1024,
      height: 512,
      seed: 0,
      raw: false,
      negative_prompt: 'blur',
      ...(wrapper === undefined ? {} : { prompt: wrapper }),
    };
    const original = structuredClone(config);
    const provider = new ReplicateImageProvider(model, { config });
    const result = await provider.callApi('a cat');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    if (!request) {
      throw new Error('Expected a prediction request');
    }
    const body = JSON.parse(request.body as string);
    expect(body.input).toEqual({
      prompt: expected,
      width: 1024,
      height: 512,
      seed: 0,
      raw: false,
      negative_prompt: 'blur',
    });
    expect(url).toBe(
      model.includes(':')
        ? 'https://api.replicate.com/v1/predictions'
        : `https://api.replicate.com/v1/models/${model}/predictions`,
    );
    expect(body.version).toBe(model.includes(':') ? 'version123' : undefined);
    expect(result.output).toBe('![a cat](https://example.com/image.png)');
    expect(result.error).toBeUndefined();
    expect(config).toEqual(original);
  });

  it('preserves an empty evaluation prompt with wrappers', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        id: 'empty',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      }),
    );
    const provider = new ReplicateImageProvider('owner/model', {
      config: { apiKey: 'fixture-only', prompt: { prefix: '[', suffix: ']' } },
    });
    await provider.callApi('');
    expect(
      JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).input.prompt,
    ).toBe('[]');
  });

  it('keeps cached image output without making another prediction', async () => {
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    const get = vi.fn().mockResolvedValue(JSON.stringify(['https://example.com/cached.png']));
    vi.mocked(getCache).mockReturnValue({ get } as unknown as ReturnType<typeof getCache>);
    const provider = new ReplicateImageProvider('owner/model', {
      config: { apiKey: 'fixture-only', prompt: { prefix: 'photo of ' } },
    });
    await expect(provider.callApi('a cat')).resolves.toMatchObject({
      output: '![a cat](https://example.com/cached.png)',
      cached: true,
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
  });
});
