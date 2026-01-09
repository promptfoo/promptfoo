import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMediaItemByHash } from './useMediaItems';
import * as api from '@app/utils/api';

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

    vi.mocked(api.callApi).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [mockItem],
        },
      }),
    } as Response);

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: mockItem,
      error: null,
    });
    expect(api.callApi).toHaveBeenCalledWith('/blobs/library?hash=abc123&limit=1');
  });

  it('should return not_found error when items array is empty', async () => {
    vi.mocked(api.callApi).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [],
        },
      }),
    } as Response);

    const result = await fetchMediaItemByHash('nonexistent');

    expect(result).toEqual({
      item: null,
      error: 'not_found',
    });
  });

  it('should return server_error when response is not ok', async () => {
    vi.mocked(api.callApi).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'server_error',
    });
  });

  it('should return server_error when success is false', async () => {
    vi.mocked(api.callApi).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: 'Something went wrong',
      }),
    } as Response);

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'server_error',
    });
  });

  it('should return network_error when API call throws', async () => {
    vi.mocked(api.callApi).mockRejectedValue(new Error('Network failure'));

    const result = await fetchMediaItemByHash('abc123');

    expect(result).toEqual({
      item: null,
      error: 'network_error',
    });
  });

  it('should properly encode hash with special characters', async () => {
    vi.mocked(api.callApi).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [],
        },
      }),
    } as Response);

    await fetchMediaItemByHash('hash with spaces & special=chars');

    expect(api.callApi).toHaveBeenCalledWith(
      '/blobs/library?hash=hash%20with%20spaces%20%26%20special%3Dchars&limit=1',
    );
  });
});
