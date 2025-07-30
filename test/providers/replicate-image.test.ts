import { ReplicateImageProvider } from '../../src/providers/replicate';
import { fetchWithCache } from '../../src/cache';

jest.mock('../../src/cache');

const mockedFetchWithCache = jest.mocked(fetchWithCache);

describe('ReplicateImageProvider Demonstration', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('demonstrates FLUX 1.1 Pro Ultra image generation', async () => {
    // Mock successful API response
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

    // The provider formats the output as markdown
    expect(result.output).toBe(
      '![A majestic mountain landscape at golden hour](https://replicate.delivery/pbxt/flux-ultra-example/beautiful-landscape.webp)',
    );
    expect(result.error).toBeUndefined();

    // Verify the API was called correctly
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
    // Some models return multiple images
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

    // Only the first image is returned for simplicity
    expect(result.output).toBe(
      '![Generate variations](https://replicate.delivery/pbxt/example/image1.png)',
    );
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

    expect(result.output).toBe(
      '![Professional headshot, natural lighting](https://replicate.delivery/pbxt/flux-raw/photorealistic.png)',
    );

    // Verify raw parameter was passed (note: raw should be in input)
    const callArgs = mockedFetchWithCache.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs && callArgs[1] && callArgs[1].body) {
      const bodyJson = JSON.parse(callArgs[1].body as string);
      expect(bodyJson.input.prompt).toBe('Professional headshot, natural lighting');
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
