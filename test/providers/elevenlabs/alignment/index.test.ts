// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ElevenLabsAlignmentProvider } from '../../../../src/providers/elevenlabs/alignment';
import { promises as fs } from 'fs';

// Mock dependencies
jest.mock('../../../../src/providers/elevenlabs/client');
jest.mock('fs');

describe('ElevenLabsAlignmentProvider', () => {
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
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      expect(provider).toBeDefined();
      expect(provider.id()).toBe('elevenlabs:alignment');
    });

    it('should throw error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsAlignmentProvider('elevenlabs:alignment')).toThrow(
        'ELEVENLABS_API_KEY environment variable is not set',
      );
    });

    it('should use custom configuration', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        config: {
          timeout: 180000,
        },
      });

      expect(provider.config.timeout).toBe(180000);
    });

    it('should use custom label if provided', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        label: 'Custom Alignment Label',
      });

      expect(provider.id()).toBe('Custom Alignment Label');
    });
  });

  describe('id()', () => {
    it('should return correct provider ID', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      expect(provider.id()).toBe('elevenlabs:alignment');
    });
  });

  describe('toString()', () => {
    it('should return human-readable string', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');
      const str = provider.toString();

      expect(str).toBe('[ElevenLabs Forced Alignment Provider]');
    });
  });

  describe('API key resolution', () => {
    it('should use config API key over environment variable', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        config: { apiKey: 'config-key' },
      });

      expect(provider).toBeDefined();
    });

    it('should use environment variable when config key not provided', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      expect(provider).toBeDefined();
    });

    it('should support custom API key environment variable', () => {
      process.env.CUSTOM_ELEVENLABS_KEY = 'custom-key';

      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        config: { apiKeyEnvar: 'CUSTOM_ELEVENLABS_KEY' },
      });

      expect(provider).toBeDefined();

      delete process.env.CUSTOM_ELEVENLABS_KEY;
    });
  });

  describe('callApi', () => {
    it('should require audio file path', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const response = await provider.callApi('transcript text');

      expect(response.error).toContain('Audio file path is required');
    });

    it('should require transcript text', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const response = await provider.callApi('', {
        vars: { audioFile: '/path/to/audio.mp3' },
      });

      expect(response.error).toContain('Transcript is required');
    });

    it('should process alignment with JSON output by default', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 },
        ],
        duration_seconds: 1.0,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('Hello world', {
        vars: { audioFile: '/path/to/audio.mp3' },
      });

      expect(response.error).toBeUndefined();
      expect(response.output).toContain('"word_alignments"');
      expect(response.metadata).toMatchObject({
        sourceFile: '/path/to/audio.mp3',
        wordCount: 2,
        characterCount: 0,
        durationSeconds: 1.0,
        latency: expect.any(Number),
      });
    });

    it('should process alignment with SRT output format', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 },
        ],
        duration_seconds: 1.0,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('Hello world', {
        vars: { audioFile: '/path/to/audio.mp3', format: 'srt' },
      });

      expect(response.error).toBeUndefined();
      expect(response.output).toContain('-->');
      expect(response.output).toContain('00:00:00,');
    });

    it('should process alignment with VTT output format', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [
          { word: 'Hello', start: 0.0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 },
        ],
        duration_seconds: 1.0,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('Hello world', {
        vars: { audioFile: '/path/to/audio.mp3', format: 'vtt' },
      });

      expect(response.error).toBeUndefined();
      expect(response.output).toContain('WEBVTT');
      expect(response.output).toContain('-->');
    });

    it('should support character alignments', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [{ word: 'Hello', start: 0.0, end: 0.5 }],
        character_alignments: [
          { character: 'H', start: 0.0, end: 0.1 },
          { character: 'e', start: 0.1, end: 0.2 },
        ],
        duration_seconds: 0.5,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('Hello', {
        vars: {
          audioFile: '/path/to/audio.mp3',
          includeCharacterAlignments: true,
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.metadata?.characterCount).toBe(2);
      expect((provider as any).client.upload).toHaveBeenCalledWith(
        '/audio-alignment',
        expect.any(Buffer),
        expect.any(String),
        expect.objectContaining({
          include_character_alignments: true,
        }),
      );
    });

    it('should get transcript from prompt when not in vars', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [{ word: 'Test', start: 0.0, end: 0.5 }],
        duration_seconds: 0.5,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('Test transcript', {
        vars: { audioFile: '/path/to/audio.mp3' },
      });

      expect(response.error).toBeUndefined();
      expect((provider as any).client.upload).toHaveBeenCalledWith(
        '/audio-alignment',
        expect.any(Buffer),
        expect.any(String),
        expect.objectContaining({
          transcript: 'Test transcript',
        }),
      );
    });

    it('should handle file read errors', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const response = await provider.callApi('transcript', {
        vars: { audioFile: '/path/to/missing.mp3' },
      });

      expect(response.error).toContain('Failed to align audio');
    });

    it('should handle API errors', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockRejectedValue(new Error('API Error'));

      const response = await provider.callApi('transcript', {
        vars: { audioFile: '/path/to/audio.mp3' },
      });

      expect(response.error).toContain('Failed to align audio');
    });
  });

  describe('subtitle formatting', () => {
    it('should format SRT timestamps correctly', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      // Test various timestamps
      expect((provider as any).formatSRTTimestamp(0)).toBe('00:00:00,000');
      expect((provider as any).formatSRTTimestamp(1.5)).toBe('00:00:01,500');
      expect((provider as any).formatSRTTimestamp(65.123)).toBe('00:01:05,123');
      expect((provider as any).formatSRTTimestamp(3665.789)).toBe('01:01:05,789');
    });

    it('should group words into subtitle chunks', async () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      const mockAudioBuffer = Buffer.from('audio-data');
      const mockAlignmentResponse = {
        word_alignments: [
          { word: 'This', start: 0.0, end: 0.2 },
          { word: 'is', start: 0.3, end: 0.4 },
          { word: 'a', start: 0.5, end: 0.6 },
          { word: 'test', start: 0.7, end: 1.0 },
        ],
        duration_seconds: 1.0,
      };

      (fs.readFile as jest.Mock).mockResolvedValue(mockAudioBuffer);
      (provider as any).client.upload = jest.fn().mockResolvedValue(mockAlignmentResponse);

      const response = await provider.callApi('This is a test', {
        vars: { audioFile: '/path/to/audio.mp3', format: 'srt' },
      });

      expect(response.output).toContain('This is a test');
      expect(response.output).toMatch(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/);
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY;

      expect(() => new ElevenLabsAlignmentProvider('elevenlabs:alignment')).toThrow(
        /ELEVENLABS_API_KEY/i,
      );
    });

    it('should handle invalid configuration gracefully', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        config: {
          timeout: -1, // Invalid timeout
        },
      });

      expect(provider).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default timeout if not specified', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment');

      expect(provider.config.timeout).toBe(120000);
    });

    it('should use custom timeout if specified', () => {
      const provider = new ElevenLabsAlignmentProvider('elevenlabs:alignment', {
        config: { timeout: 180000 },
      });

      expect(provider.config.timeout).toBe(180000);
    });
  });
});
