import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsClient } from '../../../src/providers/elevenlabs/client';
import {
  ElevenLabsAPIError,
  ElevenLabsAuthError,
  ElevenLabsRateLimitError,
} from '../../../src/providers/elevenlabs/errors';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/util/fetch/index.ts');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockFetch = vi.mocked(fetchWithProxy);

describe('ElevenLabsClient', () => {
  let client: ElevenLabsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    client = new ElevenLabsClient({
      apiKey: 'test-api-key',
      timeout: 5000,
      retries: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with correct defaults', () => {
      const defaultClient = new ElevenLabsClient({ apiKey: 'test-key' });
      expect(defaultClient).toBeDefined();
    });

    it('should use custom base URL if provided', () => {
      const customClient = new ElevenLabsClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/v1',
      });
      expect(customClient).toBeDefined();
    });

    it('should preserve explicit zero retries', () => {
      const zeroRetryClient = new ElevenLabsClient({ apiKey: 'test-key', retries: 0 });

      expect((zeroRetryClient as any).retries).toBe(0);
    });
  });

  describe('post', () => {
    it('should make successful POST request with JSON response', async () => {
      const mockResponse = { success: true, data: 'test' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      } as Response);

      const result = await client.post<{ success: boolean; data: string }>('/test', {
        foo: 'bar',
      });

      expect(result).toEqual(mockResponse);
      const [url, options] = mockFetch.mock.calls[0];
      const headers = new Headers(options?.headers);

      expect(url).toBe('https://api.elevenlabs.io/v1/test');
      expect(options?.method).toBe('POST');
      expect(options?.body).toBe(JSON.stringify({ foo: 'bar' }));
      expect(options?.headers).not.toBeInstanceOf(Headers);
      expect(headers.get('xi-api-key')).toBe('test-api-key');
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should normalize caller Headers to a plain object before fetchWithProxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      } as Response);

      await client.post<{ success: boolean }>(
        '/test',
        { foo: 'bar' },
        { headers: new Headers({ 'Idempotency-Key': 'request-123' }) },
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual({
        'idempotency-key': 'request-123',
        'xi-api-key': 'test-api-key',
        'content-type': 'application/json',
      });
    });

    it('should handle binary response', async () => {
      const mockBuffer = new ArrayBuffer(100);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockBuffer,
      } as Response);

      const result = await client.post<ArrayBuffer>('/text-to-speech/voice-id', { text: 'test' });

      expect(result).toEqual(mockBuffer);
    });

    it('should throw ElevenLabsAuthError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      } as Response);

      await expect(client.post('/test', {})).rejects.toThrow(ElevenLabsAuthError);
    });

    it('should throw ElevenLabsRateLimitError on 429', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => JSON.stringify({ message: 'Rate limited' }),
      } as Response;
      mockFetch.mockResolvedValue(rateLimitResponse);

      const promise = client.post('/test', {}).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(ElevenLabsRateLimitError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network error', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        } as Response);

      const promise = client.post<{ success: boolean }>('/test', {});
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should make one attempt when retries is set to 0', async () => {
      const zeroRetryClient = new ElevenLabsClient({
        apiKey: 'test-api-key',
        timeout: 5000,
        retries: 0,
      });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(zeroRetryClient.post('/test', {})).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw ElevenLabsAPIError on 500', async () => {
      // Mock all retry attempts (retries: 2 means 3 total attempts)
      const errorResponse = {
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => JSON.stringify({ message: 'Internal server error' }),
      } as Response;
      mockFetch.mockResolvedValue(errorResponse);

      const promise = client.post('/test', {}).catch((e) => e);
      await vi.runAllTimersAsync();
      const error = await promise;
      expect(error).toBeInstanceOf(ElevenLabsAPIError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('get', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { voice_id: 'test-voice', name: 'Test Voice' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      } as Response);

      const result = await client.get<{ voice_id: string; name: string }>('/voices/test-voice');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/voices/test-voice',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
          }),
        }),
      );
    });

    it('should normalize caller Headers to a plain object for GET requests', async () => {
      const mockResponse = { voice_id: 'test-voice', name: 'Test Voice' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      } as Response);

      await client.get('/voices/test-voice', {
        headers: new Headers({ 'Idempotency-Key': 'request-123' }),
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual({
        'idempotency-key': 'request-123',
        'xi-api-key': 'test-api-key',
      });
    });

    it('should prefer client xi-api-key when GET caller headers include mixed-case api key', async () => {
      const mockResponse = { voice_id: 'test-voice', name: 'Test Voice' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      } as Response);

      await client.get('/voices/test-voice', {
        headers: {
          'Idempotency-Key': 'request-123',
          'Xi-Api-Key': 'caller-key',
        },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual({
        'idempotency-key': 'request-123',
        'xi-api-key': 'test-api-key',
      });
    });
  });

  describe('delete', () => {
    it('should make successful DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      } as Response);

      await expect(client.delete('/agents/test-agent')).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/agents/test-agent',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
          }),
        }),
      );
    });

    it('should normalize caller Headers to a plain object for DELETE requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      } as Response);

      await client.delete('/agents/test-agent', {
        headers: new Headers({ 'Idempotency-Key': 'request-123' }),
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual({
        'idempotency-key': 'request-123',
        'xi-api-key': 'test-api-key',
      });
    });

    it('should prefer client xi-api-key when DELETE caller Headers include api key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      } as Response);

      await client.delete('/agents/test-agent', {
        headers: new Headers({
          'Idempotency-Key': 'request-123',
          'xi-api-key': 'caller-key',
        }),
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options?.headers).toEqual({
        'idempotency-key': 'request-123',
        'xi-api-key': 'test-api-key',
      });
    });
  });
});
