import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { ModelsLabImageProvider } from '../../src/providers/modelslab';

vi.mock('../../src/cache');

const mockedFetchWithCache = vi.mocked(fetchWithCache);

describe('ModelsLabImageProvider', () => {
  const mockApiKey = 'test-modelslab-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('generates an image with successful response', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        status: 'success',
        output: ['https://modelslab.com/output/flux-image-123.jpg'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey, width: 1024, height: 1024 },
    });

    const prompt = 'A serene mountain landscape at sunset';
    const result = await provider.callApi(prompt);

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
    );
  });

  it('polls for completion when status is processing', async () => {
    // First call returns processing
    mockedFetchWithCache
      .mockResolvedValueOnce({
        data: {
          status: 'processing',
          id: 12345,
          request_id: 'req_abc123',
          fetch_result: 'https://modelslab.com/api/v6/images/fetch/12345',
          eta: 30,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      // Poll returns success
      .mockResolvedValueOnce({
        data: {
          status: 'success',
          output: ['https://modelslab.com/output/processed-image.jpg'],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey },
    });

    const prompt = 'A futuristic city';
    const result = await provider.callApi(prompt);

    expect(result.output).toContain('processed-image.jpg');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(2);
  });

  it('returns error when API returns error status', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        status: 'error',
        message: 'Invalid API key',
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Invalid API key');
  });

  it('returns error when no API key is provided', async () => {
    const provider = new ModelsLabImageProvider('flux', {});

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('API key is not set');
  });

  it('uses default values when config options are not provided', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        status: 'success',
        output: ['https://modelslab.com/output/test.jpg'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ModelsLabImageProvider('flux', {
      config: { apiKey: mockApiKey },
    });

    await provider.callApi('Test');

    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"width":512'),
      }),
      expect.any(Number),
      expect.any(String),
      expect.any(Boolean),
    );
  });
});
