import { lookup } from 'node:dns/promises';

import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { isBlobStorageEnabled } from '../../src/blobs/extractor';
import { storeBlob } from '../../src/blobs/index';
import { NscaleImageProvider } from '../../src/providers/nscale/image';
import { callOpenAiImageApi } from '../../src/providers/openai/image';
import { fetchWithProxy } from '../../src/util/fetch/index';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../src/blobs/extractor', () => ({
  isBlobStorageEnabled: vi.fn(),
}));
vi.mock('../../src/blobs/index', () => ({
  storeBlob: vi.fn(),
}));
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));
vi.mock('../../src/providers/openai/image', async () => {
  const actual = await vi.importActual('../../src/providers/openai/image');
  return {
    ...actual,
    callOpenAiImageApi: vi.fn(),
  };
});

const lookupMock = lookup as unknown as Mock;

describe('NscaleImageProvider', () => {
  const blobUri = (index: number) => `promptfoo://blob/${index.toString(16).padStart(32, '0')}`;

  beforeEach(() => {
    vi.resetAllMocks();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(isBlobStorageEnabled).mockReturnValue(true);
    vi.mocked(callOpenAiImageApi).mockResolvedValue({
      data: {
        data: [{ url: 'https://example.com/generated.png' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as Response);
    let blobIndex = 0;
    vi.mocked(storeBlob).mockImplementation(async (_buffer, mimeType) => {
      blobIndex += 1;
      return {
        ref: {
          uri: blobUri(blobIndex),
          hash: blobIndex.toString(16).padStart(32, '0'),
          mimeType,
          sizeBytes: 1024,
          provider: 'filesystem',
        },
        deduplicated: false,
      };
    });
  });

  it('internalizes provider image URLs into blob-backed outputs', async () => {
    const provider = new NscaleImageProvider('BlackForestLabs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'url' },
    });

    const result = await provider.callApi('Generate a cat');

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      'https://inference.api.nscale.com/v1/images/generations',
      {
        model: 'BlackForestLabs/FLUX.1-schnell',
        prompt: 'Generate a cat',
        n: 1,
        response_format: 'url',
      },
      {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
      },
      expect.any(Number),
    );
    expect(result).toMatchObject({
      output: `![Generate a cat](${blobUri(1)})`,
      images: [{ blobRef: expect.objectContaining({ uri: blobUri(1) }), mimeType: 'image/png' }],
      cached: false,
      cost: 0.0013,
    });
  });

  it('redacts blocked external image URLs instead of fetching them', async () => {
    vi.mocked(callOpenAiImageApi).mockResolvedValue({
      data: {
        data: [{ url: 'http://169.254.169.254/latest/meta-data' }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new NscaleImageProvider('BlackForestLabs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'url' },
    });

    const result = await provider.callApi('test prompt');

    expect(result).toMatchObject({
      output: '[external image URL omitted for security]',
      cached: false,
      cost: 0.0013,
    });
    expect(result.images).toBeUndefined();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
});
