import { lookup } from 'node:dns/promises';

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { NscaleImageProvider } from '../../src/providers/nscale/image';
import { callOpenAiImageApi } from '../../src/providers/openai/image';
import {
  fetchWithProxy,
  getFetchTlsOptions,
  getProxyUrlForTarget,
} from '../../src/util/fetch/index';

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
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
  getFetchTlsOptions: vi.fn(),
  getProxyUrlForTarget: vi.fn(),
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
  const imageData = `data:image/png;base64,${Buffer.alloc(1024).toString('base64')}`;

  beforeEach(() => {
    vi.resetAllMocks();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.mocked(getFetchTlsOptions).mockResolvedValue({});
    vi.mocked(getProxyUrlForTarget).mockReturnValue('');
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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('downloads provider images for the existing blob storage pipeline', async () => {
    const provider = new NscaleImageProvider('black-forest-labs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'url' },
    });

    const result = await provider.callApi('Generate a cat');

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      'https://inference.api.nscale.com/v1/images/generations',
      {
        model: 'black-forest-labs/FLUX.1-schnell',
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
      output: imageData,
      images: [{ data: imageData, mimeType: 'image/png' }],
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

    const provider = new NscaleImageProvider('black-forest-labs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'url' },
    });

    const result = await provider.callApi('test prompt');

    expect(result).toMatchObject({
      error: expect.stringContaining('No usable image data'),
    });
    expect(result.images).toBeUndefined();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('evicts malformed cached URL responses when base64 was requested', async () => {
    const deleteFromCache = vi.fn();
    vi.mocked(callOpenAiImageApi).mockResolvedValue({
      data: {
        data: [{ url: 'https://example.com/generated.png' }],
      },
      cached: true,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    });

    const provider = new NscaleImageProvider('black-forest-labs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'b64_json' },
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('No base64 image data found in response');
    expect(deleteFromCache).toHaveBeenCalledWith();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('evicts expired cached URL responses rather than returning an unusable image output', async () => {
    const deleteFromCache = vi.fn();
    vi.mocked(callOpenAiImageApi).mockResolvedValue({
      data: {
        data: [{ url: 'https://example.com/expired.png' }],
      },
      cached: true,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
    });
    vi.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    } as Response);

    const provider = new NscaleImageProvider('black-forest-labs/FLUX.1-schnell', {
      config: { apiKey: 'test-key', response_format: 'url' },
    });

    const result = await provider.callApi('test prompt');

    expect(result.error).toContain('No usable image data');
    expect(deleteFromCache).toHaveBeenCalledWith();
  });
});
