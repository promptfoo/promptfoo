import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsIsolationProvider } from '../../../../src/providers/elevenlabs/isolation';

import type { CallApiContextParams } from '../../../../src/types/providers';

// Mock dependencies
vi.mock('../../../../src/providers/elevenlabs/client');

// Create hoisted mocks before vi.mock is hoisted
const mockReadFile = vi.hoisted(() => vi.fn());
const mockEncodeAudio = vi.hoisted(() => vi.fn());

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: mockReadFile,
    },
  };
});

vi.mock('../../../../src/providers/elevenlabs/tts/audio', () => ({
  encodeAudio: mockEncodeAudio,
}));

describe('ElevenLabsIsolationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
  });

  describe('constructor', () => {
    it('should create provider with default configuration', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:isolation');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsIsolationProvider('elevenlabs:isolation')).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        config: {
          outputFormat: 'mp3_22050_32',
          timeout: 180000,
        },
      });

      expect(provider.config.outputFormat).toBe('mp3_22050_32');
      expect(provider.config.timeout).toBe(180000);
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        label: 'Custom Isolation Label',
      });

      expect(provider.id()).toBe('Custom Isolation Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      expect(provider.id()).toBe('elevenlabs:isolation');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');
      const str = provider.toString();

      expect(str).toBe('[ElevenLabs Audio Isolation Provider]');
    });
  });

  describe('API key resolution', () => {
    it('should use config API key over environment variable', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        config: { apiKey: 'config-key' },
      });

      expect(provider).toBeDefined();
    });

    it('should use environment variable when config key not provided', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      expect(provider).toBeDefined();
    });

    it('should support custom API key environment variable', () => {
      process.env.CUSTOM_ELEVENLABS_KEY = 'custom-key';

      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        config: { apiKeyEnvar: 'CUSTOM_ELEVENLABS_KEY' },
      });

      expect(provider).toBeDefined();

      delete process.env.CUSTOM_ELEVENLABS_KEY;
    });
  });

  describe('callApi', () => {
    it('should require audio file path', async () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      const response = await provider.callApi('');

      expect(response.error).toContain('Audio file path is required');
    });

    it('should process audio file from prompt', async () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      const mockAudioBuffer = Buffer.from('original-audio-data');
      const mockIsolatedData = Buffer.from('isolated-audio-data');
      // Create ArrayBuffer with exact size
      const mockIsolatedBuffer = new Uint8Array(mockIsolatedData).buffer;

      mockReadFile.mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = vi.fn().mockResolvedValue(mockIsolatedBuffer);

      const mockEncodedAudio = {
        data: Buffer.from(mockIsolatedBuffer).toString('base64'),
        sizeBytes: mockIsolatedData.length,
        format: 'mp3',
      };
      mockEncodeAudio.mockResolvedValue(mockEncodedAudio);

      const response = await provider.callApi('/path/to/audio.mp3');

      expect(response.error).toBeUndefined();
      expect(response.output).toContain('Audio isolated successfully');
      expect(response.audio).toBeDefined();
      expect(response.metadata).toMatchObject({
        sourceFile: '/path/to/audio.mp3',
        originalSizeBytes: mockAudioBuffer.length,
        isolatedSizeBytes: mockEncodedAudio.sizeBytes,
        format: 'mp3',
        latency: expect.any(Number),
      });
    });

    it('should process audio file from context vars', async () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockIsolatedBuffer = Buffer.from('isolated-data');

      mockReadFile.mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = vi.fn().mockResolvedValue(mockIsolatedBuffer.buffer);

      mockEncodeAudio.mockResolvedValue({
        data: mockIsolatedBuffer.toString('base64'),
        sizeBytes: mockIsolatedBuffer.length,
        format: 'mp3',
      });

      const response = await provider.callApi('', {
        vars: { audioFile: '/path/to/audio.mp3' },
      } as unknown as CallApiContextParams);

      expect(response.error).toBeUndefined();
      expect(response.metadata?.sourceFile).toBe('/path/to/audio.mp3');
    });

    it('should handle file read errors', async () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      mockReadFile.mockRejectedValue(new Error('File not found'));

      const response = await provider.callApi('/path/to/missing.mp3');

      expect(response.error).toContain('Failed to isolate audio');
    });

    it('should handle API errors', async () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      const mockAudioBuffer = Buffer.from('audio-data');

      mockReadFile.mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = vi.fn().mockRejectedValue(new Error('API Error'));

      const response = await provider.callApi('/path/to/audio.mp3');

      expect(response.error).toContain('Failed to isolate audio');
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsIsolationProvider('elevenlabs:isolation')).toThrow(
        /ELEVENLABS_API_KEY/i,
      );
    });

    it('should handle invalid configuration gracefully', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        config: {
          timeout: -1, // Invalid timeout
        },
      });

      expect(provider).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default timeout if not specified', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      expect(provider.config.timeout).toBe(120000);
    });

    it('should use custom timeout if specified', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation', {
        config: { timeout: 180000 },
      });

      expect(provider.config.timeout).toBe(180000);
    });

    it('should use default output format if not specified', () => {
      const provider = new ElevenLabsIsolationProvider('elevenlabs:isolation');

      expect(provider.config.outputFormat).toBeUndefined();
    });
  });
});
