import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import { createQuiverAiProvider, QuiverAiProvider } from '../../src/providers/quiverai';
import { fetchWithProxy } from '../../src/util/fetch';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn(),
  getEnvInt: vi.fn().mockReturnValue(300_000),
  getEnvFloat: vi.fn(),
  getEnvBool: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeSvgResponse(svgs: string[], usage?: Record<string, number>) {
  return {
    id: 'resp_test',
    created: 1704067200,
    data: svgs.map((svg) => ({ svg, mime_type: 'image/svg+xml' })),
    ...(usage && { usage }),
  };
}

function makeErrorResponse(code: string, message: string, status = 400) {
  return { status, code, message, request_id: 'req_test123' };
}

// Helper to create a readable stream from SSE text
function createSSEStream(events: string) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events));
      controller.close();
    },
  });
}

describe('QuiverAI Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('QuiverAiProvider', () => {
    it('should initialize with correct model name', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.modelName).toBe('arrow-preview');
    });

    it('should return correct provider id', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.id()).toBe('quiverai:arrow-preview');
    });

    it('should return correct string representation', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.toString()).toBe('[QuiverAI Provider arrow-preview]');
    });

    it('should use correct API URL', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.getApiUrl()).toBe('https://api.quiver.ai/v1/svgs/generations');
    });

    it('should use custom apiBaseUrl when provided', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', apiBaseUrl: 'https://custom.api.quiver.ai/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://custom.api.quiver.ai/v1/svgs/generations');
    });

    it('should allow custom id override', () => {
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
        id: 'custom-id',
      });
      expect(provider.id()).toBe('custom-id');
    });

    it('should resolve API key from config first', () => {
      vi.mocked(getEnvString).mockReturnValue('env-key');
      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'config-key' },
        env: { QUIVERAI_API_KEY: 'override-key' },
      });
      expect(provider['apiKey']).toBe('config-key');
    });

    it('should resolve API key from env override second', () => {
      vi.mocked(getEnvString).mockReturnValue('env-key');
      const provider = new QuiverAiProvider('arrow-preview', {
        env: { QUIVERAI_API_KEY: 'override-key' },
      });
      expect(provider['apiKey']).toBe('override-key');
    });

    it('should resolve API key from environment variable last', () => {
      vi.mocked(getEnvString).mockReturnValue('env-key');
      const provider = new QuiverAiProvider('arrow-preview', {});
      expect(provider['apiKey']).toBe('env-key');
    });

    it('should return error when API key is not set', async () => {
      vi.mocked(getEnvString).mockReturnValue('');
      const provider = new QuiverAiProvider('arrow-preview', {});
      const result = await provider.callApi('test prompt');
      expect(result.error).toContain('QuiverAI API key is not set');
    });
  });

  describe('callApi - non-streaming (stream: false)', () => {
    it('should call API with correct request body', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: {
          apiKey: 'test-key',
          stream: false,
          temperature: 0.7,
          instructions: 'flat design style',
          max_output_tokens: 4096,
        },
      });

      await provider.callApi('A red heart icon');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.quiver.ai/v1/svgs/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            model: 'arrow-preview',
            prompt: 'A red heart icon',
            stream: false,
            instructions: 'flat design style',
            temperature: 0.7,
            max_output_tokens: 4096,
          }),
        },
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should include references and all sampling params in request body', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const refs = [{ url: 'https://example.com/img.png' }];
      const provider = new QuiverAiProvider('arrow-preview', {
        config: {
          apiKey: 'test-key',
          stream: false,
          references: refs,
          n: 3,
          top_p: 0.9,
          presence_penalty: 0.5,
        },
      });

      await provider.callApi('test');

      const callBody = JSON.parse(
        (vi.mocked(fetchWithCache).mock.calls[0] as any)[1].body as string,
      );
      expect(callBody.references).toEqual(refs);
      expect(callBody.n).toBe(3);
      expect(callBody.top_p).toBe(0.9);
      expect(callBody.presence_penalty).toBe(0.5);
    });

    it('should return SVG output from data array', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg><circle r="50"/></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('A circle');
      expect(result.output).toBe('<svg><circle r="50"/></svg>');
      expect(result.cached).toBe(false);
    });

    it('should join multiple SVGs when n > 1', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg>1</svg>', '<svg>2</svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false, n: 2 },
      });

      const result = await provider.callApi('test');
      expect(result.output).toBe('<svg>1</svg>\n\n<svg>2</svg>');
    });

    it('should handle cached responses', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: true,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.cached).toBe(true);
      expect(result.tokenUsage?.numRequests).toBe(0);
    });

    it('should handle API error responses with request_id', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeErrorResponse('rate_limit_exceeded', 'Rate limit exceeded', 429),
        cached: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.error).toContain('rate_limit_exceeded');
      expect(result.error).toContain('req_test123');
    });

    it('should handle non-2xx response with unexpected body shape', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { unexpected: 'format' },
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('API error: 500 Internal Server Error');
      expect(result.error).toContain('"unexpected":"format"');
    });

    it('should handle non-2xx response with string body', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: 'Bad Gateway',
        cached: false,
        status: 502,
        statusText: 'Bad Gateway',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('API error: 502 Bad Gateway');
      expect(result.error).toContain('Bad Gateway');
    });

    it('should pass bustCache flag to fetchWithCache when context.debug is true', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      await provider.callApi('test', { debug: true } as any);

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should pass bustCache flag from context.bustCache', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      await provider.callApi('test', { bustCache: true } as any);

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should not bust cache when no context provided', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      await provider.callApi('test');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should handle network errors', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('QuiverAI API call error');
      expect(result.error).toContain('Network error');
    });

    it('should extract token usage with correct field names', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>'], {
          total_tokens: 100,
          input_tokens: 20,
          output_tokens: 80,
        }),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.tokenUsage).toEqual({
        total: 100,
        prompt: 20,
        completion: 80,
        numRequests: 1,
      });
    });

    it('should only include non-null config values in request body', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      await provider.callApi('test');

      const callBody = JSON.parse(
        (vi.mocked(fetchWithCache).mock.calls[0] as any)[1].body as string,
      );
      expect(callBody).toEqual({
        model: 'arrow-preview',
        prompt: 'test',
        stream: false,
      });
      expect(callBody).not.toHaveProperty('temperature');
      expect(callBody).not.toHaveProperty('instructions');
    });

    it('should merge prompt context config over provider config', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg></svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false, temperature: 0.5 },
      });

      await provider.callApi('test', {
        prompt: { config: { temperature: 0.9 } },
      } as any);

      const callBody = JSON.parse(
        (vi.mocked(fetchWithCache).mock.calls[0] as any)[1].body as string,
      );
      expect(callBody.temperature).toBe(0.9);
    });
  });

  describe('callApi - streaming (default)', () => {
    it('should use streaming by default', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: createSSEStream(
          'event: content\ndata: {"type":"content","id":"r1","svg":"<svg>ok</svg>"}\n\ndata: [DONE]\n\n',
        ),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test');

      const callBody = JSON.parse(vi.mocked(fetchWithProxy).mock.calls[0][1]!.body as string);
      expect(callBody.stream).toBe(true);
    });

    it('should parse SSE content events and return final SVG', async () => {
      const ssePayload = [
        'event: reasoning\ndata: {"type":"reasoning","id":"r1","svg":"","text":"thinking..."}\n',
        'event: draft\ndata: {"type":"draft","id":"r1","svg":"<svg>draft</svg>"}\n',
        'event: content\ndata: {"type":"content","id":"r1","svg":"<svg>final</svg>","usage":{"total_tokens":50,"input_tokens":10,"output_tokens":40}}\n',
        'data: [DONE]\n',
      ].join('\n');

      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: createSSEStream(ssePayload),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.output).toBe('<svg>final</svg>');
      expect(result.tokenUsage).toEqual({
        total: 50,
        prompt: 10,
        completion: 40,
        numRequests: 1,
      });
    });

    it('should handle streaming error responses', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve(makeErrorResponse('insufficient_credits', 'Insufficient credits', 402)),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('Insufficient credits');
      expect(result.error).toContain('insufficient_credits');
    });

    it('should handle missing response body', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: null,
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('no body');
    });

    it('should flush remaining buffer after stream ends', async () => {
      // Content event in the final buffer chunk (no trailing newline)
      const ssePayload =
        'data: {"type":"content","id":"r1","svg":"<svg>buffered</svg>","usage":{"total_tokens":10,"input_tokens":2,"output_tokens":8}}';

      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: createSSEStream(ssePayload),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.output).toBe('<svg>buffered</svg>');
    });

    it('should accept data: without trailing space', async () => {
      const ssePayload =
        'data:{"type":"content","id":"r1","svg":"<svg>nospace</svg>"}\n\ndata: [DONE]\n\n';

      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: createSSEStream(ssePayload),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.output).toBe('<svg>nospace</svg>');
    });

    it('should return error when no content event is observed', async () => {
      // Stream with only reasoning events, no content
      const ssePayload =
        'event: reasoning\ndata: {"type":"reasoning","id":"r1","svg":"","text":"thinking..."}\n\ndata: [DONE]\n\n';

      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: true,
        body: createSSEStream(ssePayload),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toContain('no SVG content');
    });

    it('should handle streaming error when json() throws', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.reject(new Error('not json')),
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toBe('QuiverAI API error: HTTP 503');
    });

    it('should use non-streaming when stream: false', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: makeSvgResponse(['<svg>non-stream</svg>']),
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const provider = new QuiverAiProvider('arrow-preview', {
        config: { apiKey: 'test-key', stream: false },
      });

      const result = await provider.callApi('test');
      expect(result.output).toBe('<svg>non-stream</svg>');
      expect(fetchWithCache).toHaveBeenCalled();
    });
  });

  describe('createQuiverAiProvider', () => {
    it('should create provider for quiverai:model format', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-preview');
      expect(provider).toBeInstanceOf(QuiverAiProvider);
      expect(provider.id()).toBe('quiverai:arrow-preview');
    });

    it('should create provider for quiverai:chat:model format', () => {
      const provider = createQuiverAiProvider('quiverai:chat:arrow-preview');
      expect(provider).toBeInstanceOf(QuiverAiProvider);
      expect(provider.id()).toBe('quiverai:arrow-preview');
    });

    it('should use default model when not specified', () => {
      const provider = createQuiverAiProvider('quiverai:');
      expect(provider).toBeInstanceOf(QuiverAiProvider);
      expect(provider.id()).toBe('quiverai:arrow-preview');
    });

    it('should pass config to provider', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-preview', {
        config: { temperature: 0.5 },
      }) as QuiverAiProvider;
      expect(provider.config.temperature).toBe(0.5);
    });

    it('should pass env overrides to provider', () => {
      const provider = createQuiverAiProvider(
        'quiverai:arrow-preview',
        {},
        { QUIVERAI_API_KEY: 'override-key' },
      ) as QuiverAiProvider;
      expect(provider['apiKey']).toBe('override-key');
    });

    it('should handle model names with colons', () => {
      const provider = createQuiverAiProvider('quiverai:chat:some:model:name');
      expect(provider).toBeInstanceOf(QuiverAiProvider);
      expect(provider.id()).toBe('quiverai:some:model:name');
    });

    it('should pass provider id to constructor', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-preview', {
        id: 'my-custom-id',
      });
      expect(provider.id()).toBe('my-custom-id');
    });
  });
});
