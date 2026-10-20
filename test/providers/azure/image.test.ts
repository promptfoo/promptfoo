import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  AzureImageProvider,
  summarizeImageResponse,
  validateMaiImageDimensions,
} from '../../../src/providers/azure/image';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

const FAKE_B64 = Buffer.from('fake-png-bytes').toString('base64');

function makeProvider(config: Record<string, any> = {}) {
  return new AzureImageProvider('mai-image-2-5', {
    config: {
      apiHost: 'res.services.ai.azure.com',
      apiKey: 'test-key',
      ...config,
    },
  });
}

function mockSuccess(overrides: Record<string, any> = {}) {
  vi.mocked(fetchWithCache).mockResolvedValueOnce({
    data: {
      created: 1,
      data: [{ b64_json: FAKE_B64, revised_prompt: 'a revised prompt' }],
      model: 'mai-image-2-5',
      size: '1024x1024',
      // Current API shape: token counts live under `usage`.
      usage: { num_output_tokens: 1024, num_input_text_tokens: 0, num_input_image_tokens: 0 },
      ...overrides,
    },
    cached: false,
    status: 200,
    statusText: 'OK',
    latencyMs: 123,
  } as any);
}

describe('validateMaiImageDimensions', () => {
  it('accepts valid square dimensions', () => {
    expect(validateMaiImageDimensions(1024, 1024)).toEqual({ valid: true });
    expect(validateMaiImageDimensions(768, 768)).toEqual({ valid: true });
  });

  it('rejects dimensions below the 768px minimum', () => {
    const result = validateMaiImageDimensions(256, 256);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/at least 768/);
  });

  it('rejects images whose pixel count exceeds the maximum', () => {
    const result = validateMaiImageDimensions(2048, 2048);
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/must not exceed/);
  });

  it('rejects non-integer / non-positive dimensions', () => {
    expect(validateMaiImageDimensions(0, 1024).valid).toBe(false);
    expect(validateMaiImageDimensions(1024.5, 1024).valid).toBe(false);
  });
});

describe('summarizeImageResponse', () => {
  it('replaces base64 payloads with their length and keeps other fields', () => {
    const summary = summarizeImageResponse({
      data: [{ b64_json: 'a'.repeat(5000), revised_prompt: 'p' }],
      usage: { num_output_tokens: 10 },
    });
    expect(summary).not.toContain('aaaa');
    expect(summary).toContain('<5000 base64 chars>');
    expect(summary).toContain('revised_prompt');
    expect(summary).toContain('num_output_tokens');
  });

  it('falls back to plain JSON for non-image-shaped values', () => {
    expect(summarizeImageResponse({ error: { code: 'X' } })).toBe('{"error":{"code":"X"}}');
  });
});

describe('AzureImageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports id and toString', () => {
    const provider = makeProvider();
    expect(provider.id()).toBe('azure:image:mai-image-2-5');
    expect(provider.toString()).toBe('[Azure Image Provider mai-image-2-5]');
  });

  it('generates an image and returns a PNG data URL with structured images', async () => {
    mockSuccess();
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe(`data:image/png;base64,${FAKE_B64}`);
    expect(result.images).toEqual([
      { data: `data:image/png;base64,${FAKE_B64}`, mimeType: 'image/png' },
    ]);
    expect(result.isBase64).toBe(true);
    expect(result.tokenUsage).toEqual({
      prompt: 0,
      completion: 1024,
      total: 1024,
      numRequests: 1,
    });
    expect(result.metadata).toMatchObject({
      revisedPrompt: 'a revised prompt',
      size: '1024x1024',
      model: 'mai-image-2-5',
    });
  });

  it('posts to the /mai/v1/images/generations route with the deployment name and dimensions', async () => {
    mockSuccess();
    const provider = makeProvider({ width: 768, height: 1024 });
    await provider.callApi('a blue sphere');

    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://res.services.ai.azure.com/mai/v1/images/generations');
    const body = JSON.parse((options as any).body);
    expect(body).toMatchObject({
      model: 'mai-image-2-5',
      prompt: 'a blue sphere',
      width: 768,
      height: 1024,
    });
    expect((options as any).headers).toMatchObject({
      'Content-Type': 'application/json',
      'api-key': 'test-key',
    });
  });

  it('sends per-prompt config headers (uses merged config, not just provider headers)', async () => {
    mockSuccess();
    const provider = makeProvider({ headers: { 'x-custom': 'base' } });
    await provider.callApi('hi', {
      prompt: {
        raw: 'hi',
        label: 'hi',
        config: { headers: { 'x-custom': 'override', 'x-extra': 'yes' } },
      },
    } as any);
    const headers = (vi.mocked(fetchWithCache).mock.calls[0][1] as any).headers;
    expect(headers).toMatchObject({
      'api-key': 'test-key',
      'x-custom': 'override',
      'x-extra': 'yes',
    });
  });

  it('computes cost from num_output_tokens when model is mapped', async () => {
    mockSuccess();
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');
    // 1024 tokens * $33 / 1,000,000 output tokens
    expect(result.cost).toBeCloseTo(0.033792, 6);
  });

  it('omits cost when the deployment name is not a known model id', async () => {
    mockSuccess();
    const provider = makeProvider(); // no `model` override; deployment name unknown
    const result = await provider.callApi('a red cube');
    expect(result.cost).toBeUndefined();
    // Token usage is still reported even without a cost rate.
    expect(result.tokenUsage).toEqual({
      prompt: 0,
      completion: 1024,
      total: 1024,
      numRequests: 1,
    });
  });

  it('prices input (text + image) tokens from the usage object', async () => {
    mockSuccess({
      usage: { num_output_tokens: 1024, num_input_text_tokens: 100, num_input_image_tokens: 0 },
    });
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');
    // 100 input * $5/1M + 1024 output * $33/1M
    expect(result.cost).toBeCloseTo(100 * (5 / 1e6) + 1024 * (33 / 1e6), 9);
    expect(result.tokenUsage).toEqual({
      prompt: 100,
      completion: 1024,
      total: 1124,
      numRequests: 1,
    });
  });

  it('supports the legacy top-level num_output_tokens shape', async () => {
    // Older API responses reported tokens at the top level without a usage object.
    mockSuccess({ usage: undefined, num_output_tokens: 512 });
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');
    expect(result.cost).toBeCloseTo(512 * (33 / 1e6), 9);
    expect(result.tokenUsage).toEqual({
      prompt: 0,
      completion: 512,
      total: 512,
      numRequests: 1,
    });
  });

  it('passes through extra body params and custom dimensions', async () => {
    mockSuccess();
    const provider = makeProvider({ passthrough: { seed: 42 } });
    await provider.callApi('something');
    const body = JSON.parse((vi.mocked(fetchWithCache).mock.calls[0][1] as any).body);
    expect(body.seed).toBe(42);
  });

  it('validates dimensions before calling the API', async () => {
    const provider = makeProvider({ width: 256, height: 256 });
    const result = await provider.callApi('too small');
    expect(result.error).toMatch(/at least 768/);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('surfaces a structured API error and evicts it from the cache', async () => {
    // `deleteFromCache` is returned as a sibling of `data` by fetchWithCache,
    // not on the parsed body — the provider must call the captured handle.
    const deleteFromCache = vi.fn();
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        error: {
          code: 'unsupported_request_value',
          message: "'width' must be at least 768 pixels.",
        },
      },
      deleteFromCache,
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    } as any);

    const provider = makeProvider();
    const result = await provider.callApi('boom');
    expect(result.error).toContain('unsupported_request_value');
    expect(result.error).toContain('must be at least 768 pixels');
    expect(deleteFromCache).toHaveBeenCalledTimes(1);
  });

  it('evicts malformed 2xx responses (missing image data) from the cache', async () => {
    const deleteFromCache = vi.fn();
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { data: [{}], num_output_tokens: 0 },
      deleteFromCache,
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const provider = makeProvider();
    const result = await provider.callApi('no image');
    expect(result.error).toMatch(/No image data found/);
    expect(deleteFromCache).toHaveBeenCalledTimes(1);
  });

  it('surfaces non-2xx responses without a structured error body', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: 'upstream exploded',
      cached: false,
      status: 502,
      statusText: 'Bad Gateway',
    } as any);

    const provider = makeProvider();
    const result = await provider.callApi('boom');
    expect(result.error).toContain('502');
    expect(result.error).toContain('Bad Gateway');
  });

  it('marks cached responses and zeroes their cost', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        data: [{ b64_json: FAKE_B64 }],
        num_output_tokens: 1024,
        size: '1024x1024',
      },
      cached: true,
      status: 200,
      statusText: 'OK',
    } as any);

    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('cached cube');
    expect(result.cached).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.tokenUsage).toEqual({ cached: 1024, total: 1024 });
  });
});
