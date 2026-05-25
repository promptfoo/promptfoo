import * as api from '@app/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMediaItemByHash } from './useMediaItems';

vi.mock('@app/utils/api');

describe('fetchMediaItemByHash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return item when API call succeeds with valid data', async () => {
    const mockItem = {
      hash: 'abc123',
      mimeType: 'image/png',
      sizeBytes: 1024,
      kind: 'image' as const,
      createdAt: '2024-01-01T00:00:00Z',
      url: 'http://example.com/blob/abc123',
      context: {
        evalId: 'eval-1',
      },
    };

    vi.mocked(api.callApiJson).mockResolvedValue({
      success: true,
      data: {
        items: [mockItem],
        total: 1,
        hasMore: false,
      },
    });

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: mockItem,
      error: null,
    });
    expect(vi.mocked(api.callApiJson).mock.calls[0][2]?.query?.toString()).toBe(
      'hash=abc123&limit=1',
    );
  });

  it('should return not_found error when items array is empty', async () => {
    vi.mocked(api.callApiJson).mockResolvedValue({
      success: true,
      data: {
        items: [],
        total: 0,
        hasMore: false,
      },
    });

    const result = await fetchMediaItemByHash('nonexistent');

    expect(result).toEqual({
      item: null,
      error: 'not_found',
    });
  });

  it('should return server_error when response is not ok', async () => {
    vi.mocked(api.callApiJson).mockRejectedValue(
      new api.ApiResponseError(500, { error: 'failed' }, new Response(null, { status: 500 })),
    );

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'server_error',
    });
  });

  it('should return server_error when the typed request rejects with a server response', async () => {
    vi.mocked(api.callApiJson).mockRejectedValue(
      new api.ApiResponseError(
        400,
        { error: 'Something went wrong' },
        new Response(null, { status: 400 }),
      ),
    );

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'server_error',
    });
  });

  it('should return network_error when API call throws', async () => {
    vi.mocked(api.callApiJson).mockRejectedValue(new Error('Network failure'));

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'network_error',
    });
  });

  it('should properly encode hash with special characters', async () => {
    vi.mocked(api.callApiJson).mockResolvedValue({
      success: true,
      data: {
        items: [],
        total: 0,
        hasMore: false,
      },
    });

    await fetchMediaItemByHash('hash with spaces & special=chars');

    expect(vi.mocked(api.callApiJson).mock.calls[0][2]?.query?.toString()).toBe(
      'hash=hash+with+spaces+%26+special%3Dchars&limit=1',
    );
  });
});
