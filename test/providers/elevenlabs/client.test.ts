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
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ foo: 'bar' }),
        }),
      );
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
      // Mock all retry attempts - client retries on 429 without Retry-After
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
    });

    it('should retry on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      } as Response);

      const promise = client.post<{ success: boolean }>('/test', {});
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw ElevenLabsAPIError on 500', async () => {
      // Mock all retry attempts (retries: 2 means 2 total attempts)
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
  });
});
