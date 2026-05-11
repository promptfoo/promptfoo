import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NscaleImageProvider } from '../../src/providers/nscale/image';
import { callOpenAiImageApi } from '../../src/providers/openai/image';
import { getRequestTimeoutMs } from '../../src/providers/shared';

vi.mock('../../src/logger');
vi.mock('../../src/providers/openai/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/openai/image')>()),
  callOpenAiImageApi: vi.fn(),
}));
vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/envars')>()),
  getEnvString: vi.fn(),
}));

describe('NscaleImageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callOpenAiImageApi).mockResolvedValue({
      data: {
        data: [{ b64_json: 'base64EncodedImageData' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
  });

  it('passes cache options through to the shared image API helper', async () => {
    const provider = new NscaleImageProvider('flux/flux.1-schnell', {
      config: { apiKey: 'test-service-token' },
    });

    await provider.callApi('Generate a cat', {
      prompt: { raw: 'Generate a cat', label: 'image' },
      vars: {},
      repeatIndex: 2,
    });

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      'https://inference.api.nscale.com/v1/images/generations',
      {
        model: 'flux/flux.1-schnell',
        prompt: 'Generate a cat',
        n: 1,
        response_format: 'b64_json',
      },
      {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-service-token',
      },
      getRequestTimeoutMs(),
      { repeatIndex: 2 },
    );
  });
});
