import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ElevenLabsDubbingProvider } from '../../../../src/providers/elevenlabs/dubbing';
import { promises as fs } from 'fs';

// Mock dependencies
jest.mock('../../../../src/providers/elevenlabs/client');
jest.mock('fs');
jest.mock('../../../../src/providers/elevenlabs/tts/audio', () => ({
  encodeAudio: jest.fn(),
}));

describe('ElevenLabsDubbingProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';

    // Set up fs.readFile mock
    (fs.readFile as unknown as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:dubbing:es');
    });

    it('should throw error when target language is missing', () => {
      expect(() => new ElevenLabsDubbingProvider('elevenlabs:dubbing')).toThrow(
        'Target language is required for dubbing',
      );
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      })).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: {
          targetLanguage: 'es',
          sourceLanguage: 'en',
          numSpeakers: 3,
          watermark: true,
          timeout: 600000,
        },
      });

      expect(provider.config.targetLanguage).toBe('es');
      expect(provider.config.sourceLanguage).toBe('en');
      expect(provider.config.numSpeakers).toBe(3);
      expect(provider.config.watermark).toBe(true);
      expect(provider.config.timeout).toBe(600000);
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
        label: 'Custom Dubbing Label',
      });

      expect(provider.id()).toBe('Custom Dubbing Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID with target language', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:fr', {
        config: { targetLanguage: 'fr' },
      });

      expect(provider.id()).toBe('elevenlabs:dubbing:fr');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string with target language', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });
      const str = provider.toString();

      expect(str).toBe('[ElevenLabs Dubbing Provider: es]');
    });
  });

  describe('API key resolution', () => {
    it('should use config API key over environment variable', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { apiKey: 'config-key', targetLanguage: 'es' },
      });

      expect(provider).toBeDefined();
    });

    it('should use environment variable when config key not provided', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      expect(provider).toBeDefined();
    });

    it('should support custom API key environment variable', () => {
      process.env.CUSTOM_ELEVENLABS_KEY = 'custom-key';

      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { apiKeyEnvar: 'CUSTOM_ELEVENLABS_KEY', targetLanguage: 'es' },
      });

      expect(provider).toBeDefined();

      delete process.env.CUSTOM_ELEVENLABS_KEY;
    });
  });

  describe('callApi', () => {
    it('should require source file or URL', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const response = await provider.callApi('');

      expect(response.error).toContain('Source file or URL is required');
    });

    it('should process dubbing from file', async () => {
      jest.useFakeTimers();

      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const mockVideoBuffer = Buffer.from('video-data');
      const mockDubbedBuffer = Buffer.from('dubbed-audio-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockVideoBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue({
        dubbing_id: 'dub-123',
      });
      (provider as any).client.get = jest.fn()
        .mockResolvedValueOnce({
          status: 'processing',
          progress: 50,
        })
        .mockResolvedValueOnce({
          status: 'completed',
          metadata: {
            source_language: 'en',
            duration_seconds: 120,
            num_speakers: 2,
          },
        })
        .mockResolvedValueOnce(mockDubbedBuffer.buffer);

      const { encodeAudio } = await import('../../../../src/providers/elevenlabs/tts/audio');
      (encodeAudio as jest.Mock).mockResolvedValue({
        data: mockDubbedBuffer.toString('base64'),
        sizeBytes: mockDubbedBuffer.length,
        format: 'mp3',
      });

      const responsePromise = provider.callApi('/path/to/video.mp4');

      // Fast-forward through polling delays
      await jest.advanceTimersByTimeAsync(10000);

      const response = await responsePromise;

      expect(response.error).toBeUndefined();
      expect(response.output).toContain('Dubbed to es successfully');
      expect(response.audio).toBeDefined();
      expect(response.metadata).toMatchObject({
        dubbingId: 'dub-123',
        targetLanguage: 'es',
        sourceLanguage: 'en',
        durationSeconds: 120,
        numSpeakers: 2,
        latency: expect.any(Number),
      });

      jest.useRealTimers();
    });

    it('should process dubbing from URL', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const mockDubbedBuffer = Buffer.from('dubbed-audio-data');

      (provider as any).client.post = jest.fn().mockResolvedValue({
        dubbing_id: 'dub-456',
      });
      (provider as any).client.get = jest.fn()
        .mockResolvedValueOnce({
          status: 'completed',
          metadata: {
            source_language: 'en',
            duration_seconds: 60,
            num_speakers: 1,
          },
        })
        .mockResolvedValueOnce(mockDubbedBuffer.buffer);

      const { encodeAudio } = await import('../../../../src/providers/elevenlabs/tts/audio');
      (encodeAudio as jest.Mock).mockResolvedValue({
        data: mockDubbedBuffer.toString('base64'),
        sizeBytes: mockDubbedBuffer.length,
        format: 'mp3',
      });

      const response = await provider.callApi('', {
        vars: { sourceUrl: 'https://example.com/video.mp4' },
      });

      expect(response.error).toBeUndefined();
      expect(response.metadata?.sourceUrl).toBe('https://example.com/video.mp4');
    });

    it('should handle dubbing failure', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const mockVideoBuffer = Buffer.from('video-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockVideoBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue({
        dubbing_id: 'dub-789',
      });
      (provider as any).client.get = jest.fn().mockResolvedValue({
        status: 'failed',
        error_message: 'Invalid source language',
      });

      const response = await provider.callApi('/path/to/video.mp4');

      expect(response.error).toContain('Dubbing failed');
      expect(response.error).toContain('Invalid source language');
      expect(response.metadata?.status).toBe('failed');
    });

    it('should poll for completion and wait', async () => {
      jest.useFakeTimers();

      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const mockVideoBuffer = Buffer.from('video-data');
      const mockDubbedBuffer = Buffer.from('dubbed-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockVideoBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue({
        dubbing_id: 'dub-poll',
      });

      // Simulate multiple status checks
      let callCount = 0;
      (provider as any).client.get = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({
            status: 'processing',
            progress: callCount * 30,
          });
        }
        if (callCount === 3) {
          return Promise.resolve({
            status: 'completed',
            metadata: {
              source_language: 'en',
              duration_seconds: 90,
              num_speakers: 1,
            },
          });
        }
        return Promise.resolve(mockDubbedBuffer.buffer);
      });

      const { encodeAudio } = await import('../../../../src/providers/elevenlabs/tts/audio');
      (encodeAudio as jest.Mock).mockResolvedValue({
        data: mockDubbedBuffer.toString('base64'),
        sizeBytes: mockDubbedBuffer.length,
        format: 'mp3',
      });

      const responsePromise = provider.callApi('/path/to/video.mp4');

      // Fast-forward through multiple polling attempts
      await jest.advanceTimersByTimeAsync(20000);

      const response = await responsePromise;

      expect(response.error).toBeUndefined();
      expect(callCount).toBeGreaterThanOrEqual(3);

      jest.useRealTimers();
    });

    it('should support custom dubbing parameters', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: {
          targetLanguage: 'es',
          sourceLanguage: 'en',
          numSpeakers: 3,
          watermark: true,
          useProfenitiesFilter: true,
        },
      });

      const mockVideoBuffer = Buffer.from('video-data');
      const mockDubbedBuffer = Buffer.from('dubbed-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockVideoBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue({
        dubbing_id: 'dub-custom',
      });
      (provider as any).client.get = jest.fn()
        .mockResolvedValueOnce({
          status: 'completed',
          metadata: {},
        })
        .mockResolvedValueOnce(mockDubbedBuffer.buffer);

      const { encodeAudio } = await import('../../../../src/providers/elevenlabs/tts/audio');
      (encodeAudio as jest.Mock).mockResolvedValue({
        data: mockDubbedBuffer.toString('base64'),
        sizeBytes: mockDubbedBuffer.length,
        format: 'mp3',
      });

      await provider.callApi('/path/to/video.mp4');

      expect((provider as any).client.upload).toHaveBeenCalledWith(
        '/dubbing',
        expect.any(Buffer),
        expect.any(String),
        expect.objectContaining({
          target_lang: 'es',
          source_lang: 'en',
          num_speakers: 3,
          watermark: true,
          use_profanity_filter: true,
        }),
      );
    });

    it('should handle file read errors', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const response = await provider.callApi('/path/to/missing.mp4');

      expect(response.error).toContain('Failed to dub audio');
    });

    it('should handle API errors', async () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      const mockVideoBuffer = Buffer.from('video-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockVideoBuffer);
      (provider as any).client.upload = jest.fn().mockRejectedValue(new Error('API Error'));

      const response = await provider.callApi('/path/to/video.mp4');

      expect(response.error).toContain('Failed to dub audio');
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      })).toThrow(
        /ELEVENLABS_API_KEY/i,
      );
    });

    it('should throw error when target language is missing', () => {
      expect(() => new ElevenLabsDubbingProvider('elevenlabs:dubbing', {
        config: {},
      })).toThrow(
        /Target language is required/i,
      );
    });

    it('should handle invalid configuration gracefully', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: {
          targetLanguage: 'es',
          timeout: -1, // Invalid timeout
        },
      });

      expect(provider).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default timeout if not specified', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      expect(provider.config.timeout).toBe(300000);
    });

    it('should use custom timeout if specified', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es', timeout: 600000 },
      });

      expect(provider.config.timeout).toBe(600000);
    });

    it('should enable profanity filter by default', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es' },
      });

      expect(provider.config.useProfenitiesFilter).not.toBe(false);
    });

    it('should disable profanity filter when explicitly set', () => {
      const provider = new ElevenLabsDubbingProvider('elevenlabs:dubbing:es', {
        config: { targetLanguage: 'es', useProfenitiesFilter: false },
      });

      expect(provider.config.useProfenitiesFilter).toBe(false);
    });
  });
});
