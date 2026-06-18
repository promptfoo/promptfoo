import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { callOpenAiImageApi } from '../../src/providers/image/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

describe('callOpenAiImageApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('posts JSON image requests through the shared cached transport', async () => {
    const response = {
      data: { ok: true },
      cached: false,
      status: 200,
      statusText: 'OK',
    };
    vi.mocked(fetchWithCache).mockResolvedValue(response);

    const result = await callOpenAiImageApi(
      'https://example.com/v1/images/generations',
      { model: 'example-image-model', prompt: 'draw a skyline' },
      { Authorization: 'Bearer test-key' },
      30_000,
    );

    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://example.com/v1/images/generations',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-key' },
        body: JSON.stringify({ model: 'example-image-model', prompt: 'draw a skyline' }),
      },
      30_000,
    );
    expect(result).toEqual(response);
  });
});
