import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCache, withCacheNamespace } from '../../../src/cache';
import { OpenAiImageProvider } from '../../../src/providers/openai/image';
import { fetchWithRetries } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

const namespace = 'openai-image-malformed-response';

describe.each(['url', 'b64_json'] as const)('image response recovery (%s)', (responseFormat) => {
  const missingImageError =
    responseFormat === 'url' ? 'No image URL found' : 'No base64 image data found';

  afterEach(async () => {
    // The shared test setup uses memory storage; clear only this suite's namespace.
    await withCacheNamespace(namespace, () => getCache().clear());
    vi.resetAllMocks();
  });

  it.each([
    { name: 'empty array', body: { data: [] } },
    { name: 'missing array', body: { created: 123 } },
    { name: 'null response', body: null },
    { name: 'null image', body: { data: [null] } },
    { name: 'non-array data', body: { data: { 0: { url: 'bad', b64_json: 'bad' } } } },
    { name: 'non-string image', body: { data: [{ url: 123, b64_json: 123 }] } },
    { name: 'empty image', body: { data: [{ url: '', b64_json: '' }] } },
    {
      name: 'API error envelope',
      body: { error: { message: 'Image generation failed' } },
      expectedError: 'Image generation failed',
    },
  ])(
    'evicts $name so the next call can recover',
    async ({ body, expectedError = missingImageError }) => {
      const provider = new OpenAiImageProvider('compatible-image-model', {
        config: {
          apiBaseUrl: 'https://images.example/v1',
          useDefaultApiKey: false,
          apiKeyRequired: false,
          response_format: responseFormat,
        },
      });
      const valid = {
        data: [{ url: 'https://example.com/image.png', b64_json: 'aW1hZ2U=' }],
      };
      vi.mocked(fetchWithRetries)
        .mockResolvedValueOnce(Response.json(body))
        .mockImplementation(async () => Response.json(valid));

      await withCacheNamespace(namespace, async () => {
        const first = await provider.callApi('draw a capybara');
        expect(first.error).toContain(expectedError);
        expect(first.output).toBeUndefined();

        const recovered = await provider.callApi('draw a capybara');
        expect(recovered.error).toBeUndefined();
        expect(recovered.cached).toBe(false);
        expect(recovered.output).toBe(
          responseFormat === 'url'
            ? '![draw a capybara](https://example.com/image.png)'
            : 'data:image/png;base64,aW1hZ2U=',
        );
        const cached = await provider.callApi('draw a capybara');
        expect(cached.output).toBe(recovered.output);
        expect(cached.cached).toBe(true);
        expect(fetchWithRetries).toHaveBeenCalledTimes(2);
      });
    },
  );
});
