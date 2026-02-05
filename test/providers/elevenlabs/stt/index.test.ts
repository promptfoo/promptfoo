import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsSTTProvider } from '../../../../src/providers/elevenlabs/stt';

// Mock dependencies
vi.mock('../../../../src/providers/elevenlabs/client');
vi.mock('../../../../src/providers/elevenlabs/cache');
vi.mock('../../../../src/providers/elevenlabs/cost-tracker');

describe('ElevenLabsSTTProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:stt:scribe_v1');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsSTTProvider('elevenlabs:stt')).toThrow(
        'ElevenLabs API key not found',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: {
          modelId: 'custom-model',
          diarization: true,
          maxSpeakers: 3,
          language: 'es',
        },
      });

      expect(provider.config.modelId).toBe('custom-model');
      expect(provider.config.diarization).toBe(true);
      expect(provider.config.maxSpeakers).toBe(3);
      expect(provider.config.language).toBe('es');
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        label: 'Custom STT Label',
      });

      expect(provider.id()).toBe('Custom STT Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID with model', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt');

      expect(provider.id()).toBe('elevenlabs:stt:scribe_v1');
    });

    it('should include custom model ID if configured', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { modelId: 'eleven_speech_to_text_v2' },
      });

      expect(provider.id()).toBe('elevenlabs:stt:eleven_speech_to_text_v2');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt');
      const str = provider.toString();

      expect(str).toContain('ElevenLabs STT Provider');
    });

    it('should include diarization info when enabled', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { diarization: true },
      });
      const str = provider.toString();

      expect(str).toContain('diarization');
    });
  });

  describe('configuration validation', () => {
    it('should accept valid model IDs', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { modelId: 'scribe_v1' },
      });

      expect(provider.config.modelId).toBe('scribe_v1');
    });

    it('should accept valid language codes', () => {
      const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'hi', 'ja', 'ko', 'zh'];

      for (const lang of validLanguages) {
        const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
          config: { language: lang },
        });

        expect(provider.config.language).toBe(lang);
      }
    });

    it('should handle diarization settings', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: {
          diarization: true,
          maxSpeakers: 5,
        },
      });

      expect(provider.config.diarization).toBe(true);
      expect(provider.config.maxSpeakers).toBe(5);
    });
  });

  describe('API key resolution', () => {
    it('should use config API key over environment variable', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { apiKey: 'config-key' },
      });

      expect(provider).toBeDefined();
    });

    it('should use environment variable when config key not provided', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt');

      expect(provider).toBeDefined();
    });

    it('should support custom API key environment variable', () => {
      process.env.CUSTOM_ELEVENLABS_KEY = 'custom-key';

      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { apiKeyEnvar: 'CUSTOM_ELEVENLABS_KEY' },
      });

      expect(provider).toBeDefined();

      delete process.env.CUSTOM_ELEVENLABS_KEY;
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsSTTProvider('elevenlabs:stt')).toThrow(/ELEVENLABS_API_KEY/i);
    });

    it('should handle invalid configuration gracefully', () => {
      // Should not throw on construction, only on usage
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: {
          timeout: -1, // Invalid timeout
        },
      });

      expect(provider).toBeDefined();
    });
  });

  describe('configuration defaults', () => {
    it('should use default model if not specified', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt');

      expect(provider.config.modelId).toBe('scribe_v1');
    });

    it('should use custom model if specified', () => {
      const provider = new ElevenLabsSTTProvider('elevenlabs:stt', {
        config: { modelId: 'scribe_v1' },
      });

      expect(provider.config.modelId).toBe('scribe_v1');
    });
  });
});
