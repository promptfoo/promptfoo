import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callApi } from './api';

// Mock the apiConfig store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({
      apiBaseUrl: 'http://localhost:3000',
    })),
  },
}));

describe('callApi', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should make a request with the correct URL', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      await callApi('/test');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/test', {});
    });

    it('should pass through options to fetch', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      };

      await callApi('/test', options);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/test', options);
    });
  });

  describe('timeout functionality', () => {
    it('should not use AbortSignal when no timeout is specified', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      await callApi('/test');

      // Check that fetch was called without signal
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      expect(fetchCall[1]).toEqual({});
    });

    it('should use AbortSignal.timeout() when timeout is specified', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      await callApi('/test', { timeout: 5000 });

      // Check that fetch was called with signal
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      expect(fetchCall[1]).toHaveProperty('signal');
      expect(fetchCall[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it('should throw timeout error when request exceeds timeout', async () => {
      // Simulate a timeout error (what AbortSignal.timeout() throws)
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';

      // Mock fetch to reject with timeout error
      vi.mocked(global.fetch).mockRejectedValueOnce(timeoutError);

      // Call the API with a timeout
      await expect(callApi('/test', { timeout: 50 })).rejects.toThrow(
        'Request timed out after 50ms',
      );
    });

    it('should throw timeout error with correct message format', async () => {
      // Create a TimeoutError
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      vi.mocked(global.fetch).mockRejectedValueOnce(timeoutError);

      await expect(callApi('/test', { timeout: 1000 })).rejects.toThrow(
        'Request timed out after 1000ms',
      );
    });

    it('should preserve non-timeout errors', async () => {
      const networkError = new Error('Network failure');
      vi.mocked(global.fetch).mockRejectedValueOnce(networkError);

      await expect(callApi('/test', { timeout: 5000 })).rejects.toThrow('Network failure');
    });

    it('should not include timeout in fetch options', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      await callApi('/test', {
        method: 'POST',
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      // Check that timeout is not passed to fetch
      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      expect(fetchCall[1]).not.toHaveProperty('timeout');
      expect(fetchCall[1]).toHaveProperty('method', 'POST');
      expect(fetchCall[1]).toHaveProperty('headers');
    });
  });

  describe('backward compatibility', () => {
    it('should work with all existing RequestInit options', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({ data: 'test' }),
        mode: 'cors' as RequestMode,
        credentials: 'include' as RequestCredentials,
        cache: 'no-cache' as RequestCache,
        redirect: 'follow' as RequestRedirect,
        referrerPolicy: 'no-referrer' as ReferrerPolicy,
      };

      await callApi('/test', options);

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/test', options);
    });

    it('should maintain the same behavior when timeout is not provided', async () => {
      const mockResponse = new Response('{"result":"success"}', { status: 200 });
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse);

      const response = await callApi('/test');
      const data = await response.json();

      expect(data).toEqual({ result: 'success' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
