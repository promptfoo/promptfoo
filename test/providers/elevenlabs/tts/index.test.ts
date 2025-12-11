import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsTTSProvider } from '../../../../src/providers/elevenlabs/tts';

// Mock dependencies
vi.mock('../../../../src/providers/elevenlabs/client');
vi.mock('../../../../src/providers/elevenlabs/cache');
vi.mock('../../../../src/providers/elevenlabs/cost-tracker');

describe('ElevenLabsTTSProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:tts:eleven_multilingual_v2');
    });

    it('should parse voice ID from provider path', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts:rachel');

      expect(provider.config.voiceId).toBe('rachel');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsTTSProvider('elevenlabs:tts')).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts', {
        config: {
          voiceId: 'custom-voice',
          modelId: 'eleven_flash_v2_5',
          outputFormat: 'mp3_22050_32',
        },
      });

      expect(provider.config.voiceId).toBe('custom-voice');
      expect(provider.config.modelId).toBe('eleven_flash_v2_5');
      expect(provider.config.outputFormat).toBe('mp3_22050_32');
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts', {
        label: 'Custom TTS Label',
      });

      expect(provider.id()).toBe('Custom TTS Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider.id()).toContain('elevenlabs:tts');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');
      const str = provider.toString();

      expect(str).toContain('ElevenLabs TTS Provider');
      expect(str).toContain('Model:');
      expect(str).toContain('Voice:');
    });
  });

  describe('parseConfig', () => {
    it('should parse voice ID from colon-separated path', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts:custom-voice');

      expect(provider.config.voiceId).toBe('custom-voice');
    });

    it('should handle multiple colons in voice ID', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts:voice:with:colons');

      expect(provider.config.voiceId).toBe('voice:with:colons');
    });

    it('should use default voice settings', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider.config.voiceSettings).toEqual({
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0,
      });
    });

    it('should merge custom voice settings', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts', {
        config: {
          voiceSettings: {
            stability: 0.8,
            speed: 1.5,
          },
        },
      });

      expect(provider.config.voiceSettings?.stability).toBe(0.8);
      expect(provider.config.voiceSettings?.speed).toBe(1.5);
    });

    it('should set default model to eleven_multilingual_v2', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider.config.modelId).toBe('eleven_multilingual_v2');
    });

    it('should set default output format to mp3_44100_128', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider.config.outputFormat).toBe('mp3_44100_128');
    });

    it('should use default Rachel voice ID', () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      expect(provider.config.voiceId).toBe('21m00Tcm4TlvDq8ikWAM');
    });
  });

  describe('callApi', () => {
    it('should include character count in output', async () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      // Mock the client to return a fake audio buffer
      const mockAudioBuffer = Buffer.from('fake-audio-data');
      (provider as any).client.post = vi.fn().mockResolvedValue(mockAudioBuffer.buffer);

      const response = await provider.callApi('Hello world');

      expect(response.output).toContain('11 characters');
    });

    it('should track token usage based on character count', async () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      const mockAudioBuffer = Buffer.from('fake-audio-data');
      (provider as any).client.post = vi.fn().mockResolvedValue(mockAudioBuffer.buffer);

      const response = await provider.callApi('Test prompt');

      expect(response.tokenUsage).toEqual({
        total: 11,
        prompt: 11,
        completion: 0,
        cached: undefined,
        numRequests: 1,
      });
    });

    it('should return audio data in response', async () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      const mockAudioBuffer = Buffer.from('fake-audio-data');
      (provider as any).client.post = vi.fn().mockResolvedValue(mockAudioBuffer.buffer);

      const response = await provider.callApi('Hello');

      expect(response.audio).toBeDefined();
      expect(response.audio?.data).toBeDefined();
      expect(response.audio?.format).toBe('mp3');
    });

    it('should include metadata in response', async () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      const mockAudioBuffer = Buffer.from('fake-audio-data');
      (provider as any).client.post = vi.fn().mockResolvedValue(mockAudioBuffer.buffer);

      const response = await provider.callApi('Hello');

      expect(response.metadata).toMatchObject({
        voiceId: expect.any(String),
        modelId: expect.any(String),
        outputFormat: expect.any(String),
        latency: expect.any(Number),
        cacheHit: expect.any(Boolean),
      });
    });

    it('should handle API errors gracefully', async () => {
      const provider = new ElevenLabsTTSProvider('elevenlabs:tts');

      // Ensure cache returns null so API is called
      (provider as any).cache.get = vi.fn().mockResolvedValue(null);
      (provider as any).client.post = vi.fn().mockRejectedValue(new Error('API Error'));

      const response = await provider.callApi('Hello');

      expect(response.error).toContain('ElevenLabs TTS API error');
    });
  });
});
