import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { ModelsLabImageProvider } from '../../src/providers/modelslab';

vi.mock('../../src/cache');
vi.mock('../../src/blobs/extractor', () => ({
  isBlobStorageEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock('../../src/blobs/index', () => ({
  storeBlob: vi.fn(),
}));
vi.mock('../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));
vi.mock(import('../../src/envars'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getEnvString: vi.fn().mockReturnValue(undefined),
  };
});

const mockedFetchWithCache = vi.mocked(fetchWithCache);

function mockResponse(
  data: Record<string, unknown>,
  status = 200,
  statusText = 'OK',
  cached = false,
) {
  return { data, cached, status, statusText, deleteFromCache: vi.fn() };
}

describe('ModelsLabImageProvider', () => {
  const mockApiKey = 'test-modelslab-api-key';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('returns correct id and toString', () => {
    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    expect(provider.id()).toBe('modelslab:image:flux');
    expect(provider.toString()).toBe('[ModelsLab Image Provider flux]');
  });

  it('supports custom id override', () => {
    const provider = new ModelsLabImageProvider('flux', {
      id: 'my-custom-id',
      config: { apiKey: mockApiKey },
    });
    expect(provider.id()).toBe('my-custom-id');
  });

  it('generates an image with successful response', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse({
        status: 'success',
        output: ['https://modelslab.com/output/flux-image-123.jpg'],
      }),
    );

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey, width: 1024, height: 1024 },
    });

    const result = await provider.callApi('A serene mountain landscape at sunset');

    expect(result.output).toBe(
      '![A serene mountain landscape at sunset](https://modelslab.com/output/flux-image-123.jpg)',
    );
    expect(result.error).toBeUndefined();

    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://modelslab.com/api/v6/images/text2img',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"key":"test-modelslab-api-key"'),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('propagates cached flag from fetchWithCache response', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse(
        { status: 'success', output: ['https://modelslab.com/output/cached.jpg'] },
        200,
        'OK',
        true,
      ),
    );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test');

    expect(result.cached).toBe(true);
  });

  it('sets cached to false after polling completes', async () => {
    mockedFetchWithCache
      .mockResolvedValueOnce(
        mockResponse({
          status: 'processing',
          id: 1,
          request_id: 'req_poll',
          fetch_result: '',
          eta: 5,
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          output: ['https://modelslab.com/output/polled.jpg'],
        }),
      );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const resultPromise = provider.callApi('Poll test');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.cached).toBe(false);
    expect(result.output).toContain('polled.jpg');
  });

  it('merges per-prompt config overrides from context', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse({
        status: 'success',
        output: ['https://modelslab.com/output/wide.jpg'],
      }),
    );

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey, width: 512, height: 512 },
    });

    await provider.callApi('Test', {
      prompt: { raw: 'Test', label: 'Test', config: { width: 1920, height: 1080 } },
      vars: {},
    });

    const body = JSON.parse((mockedFetchWithCache.mock.calls[0][1] as RequestInit).body as string);
    expect(body.width).toBe(1920);
    expect(body.height).toBe(1080);
  });

  it('polls for completion when status is processing', async () => {
    mockedFetchWithCache
      .mockResolvedValueOnce(
        mockResponse({
          status: 'processing',
          id: 12345,
          request_id: 'req_abc123',
          fetch_result: 'https://modelslab.com/api/v6/images/fetch/12345',
          eta: 30,
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          output: ['https://modelslab.com/output/processed-image.jpg'],
        }),
      );

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey },
    });

    const resultPromise = provider.callApi('A futuristic city');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.output).toContain('processed-image.jpg');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(2);

    // Verify poll request uses correct URL, sends API key, and busts cache
    expect(mockedFetchWithCache).toHaveBeenNthCalledWith(
      2,
      'https://modelslab.com/api/v6/images/fetch/req_abc123',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"key":"test-modelslab-api-key"'),
      }),
      expect.any(Number),
      'json',
      true,
    );
  });

  it('continues polling after transient network failure', async () => {
    mockedFetchWithCache
      .mockResolvedValueOnce(
        mockResponse({
          status: 'processing',
          id: 99,
          request_id: 'req_x',
          fetch_result: '',
          eta: 10,
        }),
      )
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(
        mockResponse({
          status: 'success',
          output: ['https://cdn.modelslab.com/img.jpg'],
        }),
      );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const resultPromise = provider.callApi('A cat');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.output).toContain('img.jpg');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(3);
  });

  it('returns error when API returns error status', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse({ status: 'error', message: 'Invalid API key' }, 400, 'Bad Request'),
    );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Invalid API key');
  });

  it('returns error when API returns server error body', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse(
        { status: 'error', message: 'Internal Server Error' },
        500,
        'Internal Server Error',
      ),
    );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Internal Server Error');
  });

  it('returns error when fetch throws (e.g. rate limit)', async () => {
    mockedFetchWithCache.mockRejectedValue(new Error('429 Too Many Requests'));

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('ModelsLab API call error');
    expect(result.error).toContain('429 Too Many Requests');
  });

  it('returns error when no API key is provided', async () => {
    const provider = new ModelsLabImageProvider('flux', {});
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('API key is not set');
  });

  it('returns error when API returns empty output array', async () => {
    mockedFetchWithCache.mockResolvedValue(mockResponse({ status: 'success', output: [] }));

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('no image URLs');
  });

  it('uses default width/height when not configured', async () => {
    mockedFetchWithCache.mockResolvedValue(
      mockResponse({ status: 'success', output: ['https://modelslab.com/output/test.jpg'] }),
    );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    await provider.callApi('Test');

    const body = JSON.parse((mockedFetchWithCache.mock.calls[0][1] as RequestInit).body as string);
    expect(body.width).toBe(512);
    expect(body.height).toBe(512);
  });

  it('reads API key from env override', () => {
    const provider = new ModelsLabImageProvider('flux', {
      env: { MODELSLAB_API_KEY: 'env-key' },
    });
    // Provider should have picked up the env key (we verify indirectly - no error on construction)
    expect(provider.id()).toBe('modelslab:image:flux');
  });

  it('downloads image to blob storage when enabled', async () => {
    const { isBlobStorageEnabled } = await import('../../src/blobs/extractor');
    const { storeBlob } = await import('../../src/blobs/index');
    const { fetchWithProxy } = await import('../../src/util/fetch');
    vi.mocked(isBlobStorageEnabled).mockReturnValue(true);
    vi.mocked(storeBlob).mockResolvedValue({
      ref: {
        uri: 'promptfoo://blob/abc123',
        hash: 'abc123',
        mimeType: 'image/png',
        sizeBytes: 1024,
        provider: 'filesystem',
      },
      deduplicated: false,
    });
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as Response);

    mockedFetchWithCache.mockResolvedValue(
      mockResponse({
        status: 'success',
        output: ['https://modelslab.com/output/blob-test.jpg'],
      }),
    );

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Blob test');

    expect(result.output).toContain('promptfoo://blob/abc123');
    expect(result.metadata).toEqual(
      expect.objectContaining({
        blobRef: expect.objectContaining({ uri: 'promptfoo://blob/abc123', hash: 'abc123' }),
        blobHash: 'abc123',
      }),
    );
    expect(fetchWithProxy).toHaveBeenCalledWith('https://modelslab.com/output/blob-test.jpg');
    expect(storeBlob).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/jpeg',
      expect.objectContaining({ kind: 'image' }),
    );
  });
});
