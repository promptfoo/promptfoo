import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import {
  AzureImageProvider,
  getMaiImageEditCacheKey,
  loadMaiEditImage,
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

  it('leaves the model-specific pixel maximum to the API', () => {
    // MAI-Image-2.6 accepts up to 1536x1536 and MAI-Image-2.7 up to 2048x2048, while
    // MAI-Image-2.5 stops near 1024x1024. The deployment name can't tell these apart.
    expect(validateMaiImageDimensions(1536, 1536)).toEqual({ valid: true });
    expect(validateMaiImageDimensions(2048, 2048)).toEqual({ valid: true });
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
    // 1024 tokens * $47 / 1,000,000 output tokens
    expect(result.cost).toBeCloseTo(0.048128, 6);
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

  it('prices text input tokens from the usage object', async () => {
    mockSuccess({
      usage: { num_output_tokens: 1024, num_input_text_tokens: 100, num_input_image_tokens: 0 },
    });
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');
    // 100 input * $5/1M + 1024 output * $47/1M
    expect(result.cost).toBeCloseTo(100 * (5 / 1e6) + 1024 * (47 / 1e6), 9);
    expect(result.tokenUsage).toEqual({
      prompt: 100,
      completion: 1024,
      total: 1124,
      numRequests: 1,
    });
  });

  it('prices reference-image input tokens at the image input rate', async () => {
    mockSuccess({
      usage: { num_output_tokens: 1024, num_input_text_tokens: 20, num_input_image_tokens: 500 },
    });
    const provider = makeProvider({ model: 'MAI-Image-2.7' });
    const result = await provider.callApi('replace the sky');
    // 20 text * $5/1M + 500 image * $8/1M + 1024 output * $34/1M
    expect(result.cost).toBeCloseTo(20 * (5 / 1e6) + 500 * (8 / 1e6) + 1024 * (34 / 1e6), 9);
    expect(result.tokenUsage).toMatchObject({ prompt: 520, completion: 1024, total: 1544 });
  });

  it.each([
    // Global Standard meters: [model, text input, image output] per 1M tokens.
    ['MAI-Image-2.5-Flash', 1.75, 19.5],
    ['MAI-Image-2.5-Pro', 5, 106],
    ['MAI-Image-2.6', 5, 38],
    ['MAI-Image-2.6-Flash', 1.75, 19],
    ['MAI-Image-2.7', 5, 34],
    ['MAI-Image-2.7-Flash', 1.75, 10],
  ])('prices %s generations', async (model, inputRate, outputRate) => {
    mockSuccess({
      usage: { num_output_tokens: 4096, num_input_text_tokens: 19, num_input_image_tokens: 0 },
    });
    const provider = makeProvider({ model });
    const result = await provider.callApi('a cheerful orange toy robot');
    expect(result.cost).toBeCloseTo(19 * (inputRate / 1e6) + 4096 * (outputRate / 1e6), 9);
  });

  it('sends sizes above 1MP and surfaces the API error for an oversized request', async () => {
    mockSuccess({ size: '2048x2048' });
    const provider = makeProvider({ width: 2048, height: 2048, model: 'MAI-Image-2.7' });
    const result = await provider.callApi('a poster');
    expect(result.error).toBeUndefined();
    const body = JSON.parse((vi.mocked(fetchWithCache).mock.calls[0][1] as any).body);
    expect(body).toMatchObject({ width: 2048, height: 2048 });

    const deleteFromCache = vi.fn();
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        error: {
          code: 'unsupported_request_value',
          message:
            'Model does not support request parameter value supplied: Invalid dimensions 2560x2560: total pixel count (6553600) exceeds the maximum of 4194304.',
        },
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
      deleteFromCache,
    } as any);
    const tooLarge = makeProvider({ width: 2560, height: 2560, model: 'MAI-Image-2.7' });
    const errorResult = await tooLarge.callApi('a poster');
    expect(errorResult.error).toBe(
      'API response error: unsupported_request_value Model does not support request parameter value supplied: Invalid dimensions 2560x2560: total pixel count (6553600) exceeds the maximum of 4194304.',
    );
    expect(errorResult.cost).toBeUndefined();
    expect(deleteFromCache).toHaveBeenCalledTimes(1);
  });

  it('supports the legacy top-level num_output_tokens shape', async () => {
    // Older API responses reported tokens at the top level without a usage object.
    mockSuccess({ usage: undefined, num_output_tokens: 512 });
    const provider = makeProvider({ model: 'MAI-Image-2.5' });
    const result = await provider.callApi('a red cube');
    expect(result.cost).toBeCloseTo(512 * (47 / 1e6), 9);
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

// Minimal byte sequences the edits path recognizes by their signatures.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-png-body'),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg')]);
const WEBP_BYTES = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 fake');

function lastFetchCall() {
  const calls = vi.mocked(fetchWithCache).mock.calls;
  const [url, options, , , cacheOptions] = calls[calls.length - 1];
  return { url, options: options as RequestInit, cacheOptions: cacheOptions as any };
}

async function formImages(form: FormData) {
  return Promise.all(
    form.getAll('image').map(async (entry) => {
      const file = entry as File;
      return {
        name: file.name,
        type: file.type,
        bytes: Buffer.from(await file.arrayBuffer()),
      };
    }),
  );
}

describe('AzureImageProvider edits', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mai-edit-'));
    fs.writeFileSync(path.join(tempDir, 'source.png'), PNG_BYTES);
    fs.writeFileSync(path.join(tempDir, 'style.jpg'), JPEG_BYTES);
    fs.writeFileSync(path.join(tempDir, 'source.webp'), WEBP_BYTES);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.resetAllMocks();
  });

  it('sends a multipart edit to /mai/v1/images/edits and prices reference-image tokens', async () => {
    // Usage shape and counts from a live MAI-Image-2.7-Flash edit of a 1024x1024 PNG.
    mockSuccess({
      model: 'mai-image-2-7-flash',
      usage: {
        num_output_tokens: 1024,
        num_input_text_tokens: 19,
        num_input_image_tokens: 1024,
        num_web_calls: 0,
      },
    });
    const provider = new AzureImageProvider('mai-image-2-7-flash', {
      config: {
        apiHost: 'res.services.ai.azure.com',
        apiKey: 'test-key',
        model: 'MAI-Image-2.7-Flash',
        basePath: tempDir,
        images: ['file://source.png'],
      },
    });

    const result = await provider.callApi('Make the circle red');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe(`data:image/png;base64,${FAKE_B64}`);
    // 19 text * $1.75/1M + 1,024 image input * $2.50/1M + 1,024 output * $10/1M
    expect(result.cost).toBeCloseTo(19 * 1.75e-6 + 1024 * 2.5e-6 + 1024 * 10e-6, 12);
    expect(result.tokenUsage).toEqual({
      prompt: 1043,
      completion: 1024,
      total: 2067,
      numRequests: 1,
    });

    const { url, options, cacheOptions } = lastFetchCall();
    expect(url).toBe('https://res.services.ai.azure.com/mai/v1/images/edits');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'api-key': 'test-key' });
    const form = options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('model')).toBe('mai-image-2-7-flash');
    expect(form.get('prompt')).toBe('Make the circle red');
    // Without a configured size, the API picks one from the reference image.
    expect(form.has('width')).toBe(false);
    expect(form.has('height')).toBe(false);
    expect(await formImages(form)).toEqual([
      { name: 'image-1.png', type: 'image/png', bytes: PNG_BYTES },
    ]);
    expect(cacheOptions).toEqual({
      bust: false,
      cacheKey: expect.stringMatching(/^azure-mai-image-edit:[0-9a-f]{64}$/),
    });
  });

  it('renders test vars into images and sends each reference image in order', async () => {
    mockSuccess();
    const provider = makeProvider({
      basePath: tempDir,
      images: ['{{source}}', 'file://style.jpg'],
    });
    // A var loaded from file://source.png reaches the provider as a data URL.
    const sourceDataUrl = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

    const result = await provider.callApi('Restyle the first image like the second', {
      prompt: { raw: 'x', label: 'x' },
      vars: { source: sourceDataUrl },
    } as any);

    expect(result.error).toBeUndefined();
    const form = lastFetchCall().options.body as FormData;
    expect(await formImages(form)).toEqual([
      { name: 'image-1.png', type: 'image/png', bytes: PNG_BYTES },
      { name: 'image-2.jpg', type: 'image/jpeg', bytes: JPEG_BYTES },
    ]);
  });

  it('accepts a single image string and an absolute file path', async () => {
    mockSuccess();
    const provider = makeProvider({ images: `file://${path.join(tempDir, 'style.jpg')}` });
    const result = await provider.callApi('Add a hat');
    expect(result.error).toBeUndefined();
    const form = lastFetchCall().options.body as FormData;
    expect(await formImages(form)).toEqual([
      { name: 'image-1.jpg', type: 'image/jpeg', bytes: JPEG_BYTES },
    ]);
  });

  it('sends a configured size and passthrough options as form fields', async () => {
    mockSuccess({ size: '1536x1024' });
    const provider = makeProvider({
      basePath: tempDir,
      images: ['file://source.png'],
      width: 1536,
      height: 1024,
      passthrough: { background: 'transparent', auto_aspect_ratio: true },
      headers: { 'Content-Type': 'application/json', 'x-trace': 'abc' },
    });

    const result = await provider.callApi('Remove the background');

    expect(result.error).toBeUndefined();
    const { options } = lastFetchCall();
    const form = options.body as FormData;
    expect(form.get('width')).toBe('1536');
    expect(form.get('height')).toBe('1024');
    expect(form.get('background')).toBe('transparent');
    expect(form.get('auto_aspect_ratio')).toBe('true');
    // A JSON Content-Type would break the multipart boundary, so it is dropped.
    expect(options.headers).toEqual({ 'api-key': 'test-key', 'x-trace': 'abc' });
  });

  it('validates a configured edit size before calling the API', async () => {
    const provider = makeProvider({ basePath: tempDir, images: ['file://source.png'], width: 512 });
    const result = await provider.callApi('Shrink it');
    expect(result.error).toMatch(/at least 768/);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('rejects more than five reference images without calling the API', async () => {
    const provider = makeProvider({
      basePath: tempDir,
      images: Array.from({ length: 6 }, () => 'file://source.png'),
    });
    const result = await provider.callApi('Combine them');
    expect(result.error).toBe('MAI image edits accept 1 to 5 reference images; got 6.');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it.each([
    ['a WebP file', 'file://source.webp', 'MAI image edits accept only JPEG or PNG images'],
    ['a missing file', 'file://missing.png', 'file not found:'],
    ['a non-base64 data URL', 'data:image/png,rawbytes', 'data URLs must be base64-encoded'],
    ['an HTTPS URL', 'https://example.com/a.png', 'expected a file:// path or a base64 data URL'],
    ['an empty rendered var', '{{missing}}', 'expected a file:// path or a base64 data URL'],
    [
      'image bytes read as text',
      PNG_BYTES.toString('utf8'),
      'received image bytes as text; when providers are loaded from a file, pass images through test vars instead',
    ],
  ])('reports %s without calling the API', async (_label, reference, message) => {
    const provider = makeProvider({ basePath: tempDir, images: [reference] });
    const result = await provider.callApi('Edit it', {
      prompt: { raw: 'x', label: 'x' },
      vars: {},
    } as any);
    expect(result.error).toContain('Invalid images[0]: ');
    expect(result.error).toContain(message);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('surfaces an edits API error and evicts it from the cache', async () => {
    const deleteFromCache = vi.fn();
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        error: {
          code: 'invalid_image',
          message:
            'The provided image is invalid: Unsupported format: only RGB, RGBA, and palette-based GIF images are supported',
        },
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
      deleteFromCache,
    } as any);
    const provider = makeProvider({ basePath: tempDir, images: ['file://source.png'] });
    const result = await provider.callApi('Edit it');
    expect(result.error).toBe(
      'API response error: invalid_image The provided image is invalid: Unsupported format: only RGB, RGBA, and palette-based GIF images are supported',
    );
    expect(deleteFromCache).toHaveBeenCalledTimes(1);
  });

  it('reports a template that fails to render without calling the API', async () => {
    const provider = makeProvider({ images: ['{{ unclosed'] });
    const result = await provider.callApi('Edit it', {
      prompt: { raw: 'x', label: 'x' },
      vars: {},
    } as any);
    expect(result.error).toMatch(/^Could not render images: /);
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('takes images from the prompt config and resolves them against cliState.basePath', async () => {
    mockSuccess();
    const originalBasePath = cliState.basePath;
    cliState.basePath = tempDir;
    try {
      const provider = makeProvider();
      const result = await provider.callApi('Edit it', {
        prompt: { raw: 'x', label: 'x', config: { images: ['file://style.jpg'] } },
        vars: {},
      } as any);
      expect(result.error).toBeUndefined();
    } finally {
      cliState.basePath = originalBasePath;
    }
    const { url, options } = lastFetchCall();
    expect(url).toBe('https://res.services.ai.azure.com/mai/v1/images/edits');
    expect(await formImages(options.body as FormData)).toEqual([
      { name: 'image-1.jpg', type: 'image/jpeg', bytes: JPEG_BYTES },
    ]);
  });

  it('busts the cache on request and keeps Content-Type out of the cache key', async () => {
    mockSuccess();
    mockSuccess();
    const plain = makeProvider({ basePath: tempDir, images: ['file://source.png'] });
    await plain.callApi('Edit it', { prompt: { raw: 'x', label: 'x' }, bustCache: true } as any);
    const first = lastFetchCall().cacheOptions;
    expect(first.bust).toBe(true);

    const withContentType = makeProvider({
      basePath: tempDir,
      images: ['file://source.png'],
      headers: { 'content-type': 'application/json' },
    });
    await withContentType.callApi('Edit it');
    const second = lastFetchCall().cacheOptions;
    expect(second.bust).toBe(false);
    expect(second.cacheKey).toBe(first.cacheKey);
  });

  it('reports a cached edit with zero cost', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        data: [{ b64_json: FAKE_B64 }],
        usage: { num_output_tokens: 1024, num_input_text_tokens: 19, num_input_image_tokens: 1024 },
      },
      cached: true,
      status: 200,
      statusText: 'OK',
    } as any);
    const provider = makeProvider({
      basePath: tempDir,
      images: ['file://source.png'],
      model: 'MAI-Image-2.7-Flash',
    });
    const result = await provider.callApi('Edit it');
    expect(result.cached).toBe(true);
    expect(result.cost).toBe(0);
    expect(result.tokenUsage).toEqual({ cached: 2067, total: 2067 });
  });

  it('keeps generations on the JSON route when images is empty', async () => {
    mockSuccess();
    const provider = makeProvider({ images: [] });
    await provider.callApi('a red cube');
    const { url, options, cacheOptions } = lastFetchCall();
    expect(url).toBe('https://res.services.ai.azure.com/mai/v1/images/generations');
    expect(JSON.parse(options.body as string)).toMatchObject({ width: 1024, height: 1024 });
    expect(cacheOptions).toBeUndefined();
  });
});

describe('loadMaiEditImage', () => {
  it('detects PNG and JPEG from a data URL regardless of its declared type', async () => {
    const png = await loadMaiEditImage(`data:image/jpeg;base64,${PNG_BYTES.toString('base64')}`);
    expect(png).toEqual({ bytes: PNG_BYTES, mimeType: 'image/png' });
    const jpeg = await loadMaiEditImage(
      `data:application/octet-stream;base64,${JPEG_BYTES.toString('base64')}`,
    );
    expect(jpeg).toEqual({ bytes: JPEG_BYTES, mimeType: 'image/jpeg' });
  });
});

describe('getMaiImageEditCacheKey', () => {
  const url = 'https://res.services.ai.azure.com/mai/v1/images/edits';
  const fields: [string, string][] = [
    ['model', 'mai-image-2-7-flash'],
    ['prompt', 'Make the circle red'],
  ];
  const png = { bytes: PNG_BYTES, mimeType: 'image/png' as const };
  const jpeg = { bytes: JPEG_BYTES, mimeType: 'image/jpeg' as const };

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('is stable across field order and depends on every input', () => {
    const key = getMaiImageEditCacheKey(url, fields, [png]);
    expect(getMaiImageEditCacheKey(url, [...fields].reverse(), [png])).toBe(key);
    expect(getMaiImageEditCacheKey(url, fields, [jpeg])).not.toBe(key);
    expect(getMaiImageEditCacheKey(url, fields, [png, jpeg])).not.toBe(key);
    expect(getMaiImageEditCacheKey(url, fields, [jpeg, png])).not.toBe(
      getMaiImageEditCacheKey(url, fields, [png, jpeg]),
    );
    expect(getMaiImageEditCacheKey(url, [...fields, ['width', '1536']], [png])).not.toBe(key);
    expect(getMaiImageEditCacheKey(url.replace('res.', 'other.'), fields, [png])).not.toBe(key);
    expect(getMaiImageEditCacheKey(url, fields, [png], { 'x-route': 'b' })).not.toBe(key);
  });

  it('leaves credentials out of the key', () => {
    const key = getMaiImageEditCacheKey(url, fields, [png]);
    expect(
      getMaiImageEditCacheKey(url, fields, [png], {
        'api-key': 'secret-one',
        Authorization: 'Bearer secret-two',
        'x-custom-token': 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
        'Ocp-Apim-Subscription-Key': '0123456789abcdef0123456789abcdef',
        'x-functions-key': 'plain-function-key',
      }),
    ).toBe(key);
  });

  it('gives the same key for requests that differ only in their API key', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-mai-edit-key-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'source.png'), PNG_BYTES);
      const keys: string[] = [];
      for (const apiKey of ['first-key', 'second-key']) {
        vi.mocked(fetchWithCache).mockReset();
        mockSuccess();
        const provider = makeProvider({ apiKey, basePath: tempDir, images: ['file://source.png'] });
        await provider.callApi('Edit it');
        const { cacheKey } = lastFetchCall().cacheOptions as { cacheKey: string };
        expect(cacheKey).not.toContain(apiKey);
        keys.push(cacheKey);
      }
      expect(keys[0]).toBe(keys[1]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
