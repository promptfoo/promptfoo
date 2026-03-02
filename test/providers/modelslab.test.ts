import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { ModelsLabImageProvider } from '../../src/providers/modelslab';

vi.mock('../../src/cache');

const mockedFetchWithCache = vi.mocked(fetchWithCache);

describe('ModelsLabImageProvider', () => {
  const mockApiKey = 'test-modelslab-api-key';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
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
      false,
    );
  });

  it('polls for completion when status is processing', async () => {
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

    const resultPromise = provider.callApi('A futuristic city');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.output).toContain('processed-image.jpg');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(2);
  });

  it('continues polling after transient fetch failure', async () => {
    mockedFetchWithCache
      .mockResolvedValueOnce({
        data: { status: 'processing', id: 99, request_id: 'req_x', fetch_result: '', eta: 10 },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce({
        data: { status: 'success', output: ['https://cdn.modelslab.com/img.jpg'] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const resultPromise = provider.callApi('A cat');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.output).toContain('img.jpg');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(3);
  });

  it('returns error when API returns error status', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { status: 'error', message: 'Invalid API key' },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Invalid API key');
  });

  it('returns error on 5xx server error response', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { status: 'error', message: 'Internal Server Error' },
      cached: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Internal Server Error');
  });

  it('returns error on 429 rate-limit response', async () => {
    mockedFetchWithCache.mockRejectedValue(new Error('429 Too Many Requests'));

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toMatch(/429|Too Many Requests|API call error/);
  });

  it('returns error when no API key is provided', async () => {
    const provider = new ModelsLabImageProvider('flux', {});
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('API key is not set');
  });

  it('uses default values for width and height when not configured', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { status: 'success', output: ['https://modelslab.com/output/test.jpg'] },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    await provider.callApi('Test');

    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"width":512'),
      }),
      expect.any(Number),
      'json',
      false,
    );
  });

  it('id() returns correct provider identifier', () => {
    const provider = new ModelsLabImageProvider('flux', { config: { apiKey: mockApiKey } });
    expect(provider.id()).toBe('modelslab:image:flux');
  });

  it('custom id overrides default', () => {
    const provider = new ModelsLabImageProvider('flux', { id: 'my-modelslab', config: { apiKey: mockApiKey } });
    expect(provider.id()).toBe('my-modelslab');
  });
});
