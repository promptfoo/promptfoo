import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { buildSafeStructuredImageOutputs } from '../../src/providers/openai/image';
import { ReplicateImageProvider } from '../../src/providers/replicate';

vi.mock('../../src/cache');
vi.mock('../../src/providers/openai/image', () => ({ buildSafeStructuredImageOutputs: vi.fn() }));
const imageData = 'data:image/png;base64,aW1hZ2U=';

const mockedFetchWithCache = vi.mocked(fetchWithCache);

describe('ReplicateImageProvider Demonstration', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(buildSafeStructuredImageOutputs).mockResolvedValue([
      { data: imageData, mimeType: 'image/png' },
    ]);
  });

  it('demonstrates FLUX 1.1 Pro Ultra image generation', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-prediction-id',
        status: 'succeeded',
        output: ['https://replicate.delivery/pbxt/flux-ultra-example/beautiful-landscape.webp'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('black-forest-labs/flux-1.1-pro-ultra', {
      config: {
        apiKey: mockApiKey,
        width: 1024,
        height: 1024,
        output_format: 'webp',
      },
    });

    const prompt = 'A majestic mountain landscape at golden hour';
    const result = await provider.callApi(prompt);

    expect(result.output).toBe(imageData);
    expect(result.error).toBeUndefined();

    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro-ultra/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockApiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        }),
        body: expect.stringContaining('"prompt":"A majestic mountain landscape at golden hour"'),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('demonstrates multiple image outputs handling', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-prediction-id',
        status: 'succeeded',
        output: [
          'https://replicate.delivery/pbxt/example/image1.png',
          'https://replicate.delivery/pbxt/example/image2.png',
          'https://replicate.delivery/pbxt/example/image3.png',
        ],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('Generate variations');

    // The provider retains its existing first-image behavior.
    expect(result.output).toBe(imageData);
  });

  it('demonstrates raw mode for FLUX 1.1 Pro Ultra', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-prediction-id',
        status: 'succeeded',
        output: ['https://replicate.delivery/pbxt/flux-raw/photorealistic.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('black-forest-labs/flux-1.1-pro-ultra', {
      config: {
        apiKey: mockApiKey,
        raw: true, // Enable raw mode for photorealistic results
      },
    });

    const result = await provider.callApi('Professional headshot, natural lighting');

    expect(result.output).toBe(imageData);

    const callArgs = mockedFetchWithCache.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1] && callArgs[1].body) {
      const bodyJson = JSON.parse(callArgs[1].body as string);
      expect(bodyJson.input.prompt).toBe('Professional headshot, natural lighting');
      expect(bodyJson.input.raw).toBe(true);
    }
  });

  it('demonstrates error handling', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-prediction-id',
        status: 'failed',
        error: 'NSFW content detected',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('inappropriate content');

    expect(result.error).toBe('NSFW content detected');
    expect(result.output).toBeUndefined();
  });
});
