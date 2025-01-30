import { fetchWithCache } from '../../src/cache';
import { WebhookProvider } from '../../src/providers/webhook';

jest.mock('../../src/cache');

describe('WebhookProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with url', () => {
      const provider = new WebhookProvider('http://test.com');
      expect(provider.webhookUrl).toBe('http://test.com');
    });

    it('should create instance with url and options', () => {
      const provider = new WebhookProvider('http://test.com', {
        id: 'test-id',
        config: { foo: 'bar' },
      });
      expect(provider.webhookUrl).toBe('http://test.com');
      expect(provider.config).toEqual({ foo: 'bar' });
      expect(provider.id()).toBe('test-id');
    });
  });

  describe('id', () => {
    it('should return webhook url id', () => {
      const provider = new WebhookProvider('http://test.com');
      expect(provider.id()).toBe('webhook:http://test.com');
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const provider = new WebhookProvider('http://test.com');
      expect(provider.toString()).toBe('[Webhook Provider http://test.com]');
    });
  });

  describe('callApi', () => {
    it('should call webhook and return output', async () => {
      const mockFetchResponse = {
        data: {
          output: 'test response',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);

      const provider = new WebhookProvider('http://test.com');
      const result = await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.com',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: 'test prompt',
          }),
        },
        300000,
        'json',
      );

      expect(result).toEqual({
        output: 'test response',
      });
    });

    it('should include config in request if provided', async () => {
      const mockFetchResponse = {
        data: {
          output: 'test response',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);

      const provider = new WebhookProvider('http://test.com', {
        config: { foo: 'bar' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://test.com',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: 'test prompt',
            config: { foo: 'bar' },
          }),
        },
        300000,
        'json',
      );
    });

    it('should handle fetch errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const provider = new WebhookProvider('http://test.com');
      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        error: 'Webhook call error: Error: Network error',
      });
    });

    it('should handle invalid response format', async () => {
      const mockFetchResponse = {
        data: {
          foo: 'bar',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);

      const provider = new WebhookProvider('http://test.com');
      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        error: 'Webhook response error: Unexpected response format: {"foo":"bar"}',
      });
    });
  });
});
