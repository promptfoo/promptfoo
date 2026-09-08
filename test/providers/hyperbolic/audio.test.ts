import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  createHyperbolicAudioProvider,
  HyperbolicAudioProvider,
} from '../../../src/providers/hyperbolic/audio';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache');

describe('HyperbolicAudioProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create provider with default model', () => {
    const provider = new HyperbolicAudioProvider('');
    expect(provider.modelName).toBe('Melo-TTS');
  });

  it('should create provider with specified model', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.modelName).toBe('melo');
  });

  it('should get API key from config', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      config: { apiKey: 'test-key' },
    });
    expect(provider.getApiKey()).toBe('test-key');
  });

  it('should get API key from env', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      env: { HYPERBOLIC_API_KEY: 'env-key' },
    });
    expect(provider.getApiKey()).toBe('env-key');
  });

  it('should get default API URL', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.getApiUrl()).toBe('https://api.hyperbolic.xyz/v1');
  });

  it('should get custom API URL from config', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      config: { apiBaseUrl: 'https://custom.api.com' },
    });
    expect(provider.getApiUrl()).toBe('https://custom.api.com');
  });

  it('should generate correct provider ID', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.id()).toBe('hyperbolic:audio:melo');
  });

  it('should have correct string representation', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.toString()).toBe('[Hyperbolic Audio Provider melo]');
  });

  describe('callApi', () => {
    it('should throw error if API key is not set', async () => {
      const restoreEnv = mockProcessEnv({ HYPERBOLIC_API_KEY: undefined });
      try {
        const provider = new HyperbolicAudioProvider('melo');
        await expect(provider.callApi('test')).rejects.toThrow('Hyperbolic API key is not set');
      } finally {
        restoreEnv();
      }
    });

    it('should handle successful API call', async () => {
      const mockResponse = {
        data: { audio: 'base64audio' },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text');

      expect(result).toEqual({
        output: 'base64audio',
        cached: false,
        cost: 0.005 * (9 / 1000), // $5 per million characters
        isBase64: true,
        audio: {
          data: 'base64audio',
          format: 'mp3',
        },
      });
    });

    it.each(['hyperbolic:audio', 'hyperbolic:audio:melo', 'hyperbolic:audio:custom:model'])(
      'sends documented audio controls without treating %s as a model selector',
      async (id) => {
        vi.mocked(fetchWithCache).mockResolvedValue({
          data: { audio: 'base64audio' },
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        const provider = createHyperbolicAudioProvider(id, {
          config: {
            apiKey: 'test-key',
            language: 'EN',
            speaker: 'EN-US',
            speed: 1,
            sdp_ratio: 0.5,
            noise_scale: 0.5,
            noise_scale_w: 0.5,
          },
        });

        await provider.callApi('Hello', {
          prompt: {
            raw: 'Hello',
            label: 'Hello',
            config: {
              speaker: 'EN-AU',
              speed: 0.7,
              sdp_ratio: 0,
              noise_scale: 0,
              noise_scale_w: 0,
            },
          },
          vars: {},
        });

        const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
        expect(url).toBe('https://api.hyperbolic.xyz/v1/audio/generation');
        expect(request).toMatchObject({ method: 'POST' });
        expect(JSON.parse(request?.body as string)).toEqual({
          text: 'Hello',
          language: 'EN',
          speaker: 'EN-AU',
          speed: 0.7,
          sdp_ratio: 0,
          noise_scale: 0,
          noise_scale_w: 0,
        });
      },
    );

    it('preserves custom endpoint metadata and explicit legacy parameter overrides', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { audio: 'base64audio' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createHyperbolicAudioProvider('hyperbolic:audio:local-identity', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://custom.example/v2',
          model: 'provider-model',
          voice: 'provider-voice',
        },
      });

      const result = await provider.callApi('Hello', {
        prompt: {
          raw: 'Hello',
          label: 'Hello',
          config: { model: 'tenant:custom/model', voice: 'custom-voice' },
        },
        vars: {},
      });

      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://custom.example/v2/audio/generation');
      expect(JSON.parse(request?.body as string)).toEqual({
        text: 'Hello',
        model: 'tenant:custom/model',
        voice: 'custom-voice',
      });
      expect(provider.id()).toBe('hyperbolic:audio:local-identity');
      expect(result.audio).toEqual({ data: 'base64audio', format: 'wav' });
      expect(result.cost).toBe(0.001 * (5 / 1000));
    });

    it('uses native metadata when the official base URL is configured explicitly', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { audio: 'base64audio' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createHyperbolicAudioProvider('hyperbolic:audio', {
        config: { apiKey: 'test-key', apiBaseUrl: 'https://api.hyperbolic.xyz/v1' },
      });

      const result = await provider.callApi('Hello');

      expect(result.audio).toEqual({ data: 'base64audio', format: 'mp3' });
      expect(result.cost).toBe(0.005 * (5 / 1000));
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        data: { error: 'API Error' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toBe('API error: 400 Bad Request\n{"error":"API Error"}');
    });

    it('should handle missing audio data', async () => {
      const mockResponse = {
        data: {},
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toBe('No audio data returned from API');
    });

    it('should handle cached responses', async () => {
      const mockResponse = {
        data: { audio: 'base64audio' },
        cached: true,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text');
      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0); // Cost should be 0 for cached responses
    });
  });

  describe('createHyperbolicAudioProvider', () => {
    it('should create provider with default model', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio');
      expect((provider as HyperbolicAudioProvider).modelName).toBe('Melo-TTS');
    });

    it('should create provider with specified model', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio:melo');
      expect((provider as HyperbolicAudioProvider).modelName).toBe('melo');
    });

    it('should create provider with config', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio', {
        config: { apiKey: 'test-key' },
      });
      expect((provider as HyperbolicAudioProvider).getApiKey()).toBe('test-key');
    });
  });
});
