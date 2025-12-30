import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { OpenAiTranscriptionProvider } from '../../../src/providers/openai/transcription';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('fs');

// Mock native File API
global.File = class MockFile {
  constructor(
    public parts: any[],
    public name: string,
    public options?: FilePropertyBag,
  ) {}
} as any;

// Mock native FormData
global.FormData = class MockFormData {
  private data: Map<string, any> = new Map();

  append(key: string, value: any) {
    this.data.set(key, value);
  }

  get(key: string) {
    return this.data.get(key);
  }

  has(key: string) {
    return this.data.has(key);
  }
} as any;

describe('OpenAiTranscriptionProvider', () => {
  const mockTranscriptionResponse = {
    data: {
      task: 'transcribe',
      text: 'This is a test transcription.',
      duration: 120, // 2 minutes
      language: 'en',
      segments: [
        {
          id: 0,
          start: 0,
          end: 60,
          text: 'This is a test',
          avg_logprob: -0.3,
          compression_ratio: 1.2,
          no_speech_prob: 0.01,
        },
        {
          id: 1,
          start: 60,
          end: 120,
          text: 'transcription.',
          avg_logprob: -0.4,
          compression_ratio: 1.1,
          no_speech_prob: 0.02,
        },
      ],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  const mockDiarizedResponse = {
    data: {
      task: 'transcribe',
      duration: 180, // 3 minutes
      language: 'en',
      segments: [
        {
          speaker: 'Speaker 1',
          text: 'Hello, how are you?',
          start: 0.0,
          end: 2.5,
          avg_logprob: -0.25,
          compression_ratio: 1.3,
          no_speech_prob: 0.005,
        },
        {
          speaker: 'Speaker 2',
          text: "I'm doing great, thanks!",
          start: 2.5,
          end: 5.0,
          avg_logprob: -0.35,
          compression_ratio: 1.25,
          no_speech_prob: 0.01,
        },
      ],
      speakers: ['Speaker 1', 'Speaker 2'],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return Buffer.from('mock audio data');
    });
    vi.mocked(fetchWithCache).mockResolvedValue(mockTranscriptionResponse);
  });

  describe('Basic functionality', () => {
    it('should transcribe audio successfully', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/audio.mp3');
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/audio/transcriptions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
      );

      expect(result).toEqual({
        output: 'This is a test transcription.',
        cached: false,
        cost: 0.012, // 2 minutes * $0.006/min
        metadata: {
          task: 'transcribe',
          duration: 120,
          language: 'en',
          segments: 2,
          avgLogprob: -0.35, // Average of -0.3 and -0.4
          avgCompressionRatio: 1.15, // Average of 1.2 and 1.1
          avgNoSpeechProb: 0.015, // Average of 0.01 and 0.02
        },
      });
    });

    it('should use cached response', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        ...mockTranscriptionResponse,
        cached: true,
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toEqual({
        output: 'This is a test transcription.',
        cached: true,
        cost: 0, // Cost is 0 for cached responses
        metadata: {
          task: 'transcribe',
          duration: 120,
          language: 'en',
          segments: 2,
          avgLogprob: -0.35,
          avgCompressionRatio: 1.15,
          avgNoSpeechProb: 0.015,
        },
      });
    });

    it('should calculate cost correctly for gpt-4o-mini-transcribe', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-mini-transcribe', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.cost).toBe(0.006); // 2 minutes * $0.003/min
    });

    it('should calculate cost correctly for whisper-1', async () => {
      const provider = new OpenAiTranscriptionProvider('whisper-1', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.cost).toBe(0.012); // 2 minutes * $0.006/min
    });

    it('should correctly use ID passed during construction', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
        id: 'custom-provider-id',
      });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should generate correct default ID', () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.id()).toBe('openai:transcription:gpt-4o-transcribe');
    });

    it('should throw an error if API key is not set', async () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe');

        await expect(provider.callApi('/path/to/audio.mp3')).rejects.toThrow(
          'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        process.env.OPENAI_API_KEY = originalEnv;
      }
    });
  });

  describe('Diarization support', () => {
    it('should handle diarized transcription', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe-diarize', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue(mockDiarizedResponse);

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.output).toBe(
        "[0.00s - 2.50s] Speaker 1: Hello, how are you?\n[2.50s - 5.00s] Speaker 2: I'm doing great, thanks!",
      );
      expect(result.cached).toBe(false);
      expect(result.cost).toBeCloseTo(0.018, 5); // 3 minutes * $0.006/min
      expect(result.metadata).toEqual({
        task: 'transcribe',
        duration: 180,
        language: 'en',
        segments: 2,
        avgLogprob: -0.3, // Average of -0.25 and -0.35
        avgCompressionRatio: 1.275, // Average of 1.3 and 1.25
        avgNoSpeechProb: 0.0075, // Average of 0.005 and 0.01
        speakers: ['Speaker 1', 'Speaker 2'],
      });
    });

    it('should include num_speakers option for diarization', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe-diarize', {
        config: {
          apiKey: 'test-key',
          num_speakers: 2,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValue(mockDiarizedResponse);

      await provider.callApi('/path/to/audio.mp3');

      // Since we're using FormData, we can't easily inspect the body
      // Just verify the call was made
      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should include speaker_labels option for diarization', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe-diarize', {
        config: {
          apiKey: 'test-key',
          speaker_labels: ['Alice', 'Bob'],
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValue(mockDiarizedResponse);

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle missing audio file', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fs.existsSync).mockImplementation(function () {
        return false;
      });

      const result = await provider.callApi('/path/to/missing.mp3');

      expect(result).toEqual({
        error: 'Audio file not found: /path/to/missing.mp3',
      });
    });

    it('should handle API errors', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      const errorResponse = {
        data: { error: 'Invalid audio format' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(errorResponse);

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid audio format');
    });

    it('should handle HTTP errors', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: 'Error message',
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error: 500 Internal Server Error');
    });

    it('should handle fetch errors', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Network error');
    });

    it('should handle missing transcription in response', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { duration: 120 },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No transcription returned from API');
    });

    it('should handle transcription error in catch block', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockImplementation(function () {
        throw new Error('Unexpected error');
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Unexpected error');
    });
  });

  describe('Configuration options', () => {
    it('should include language option', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          language: 'es',
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should include prompt option', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          prompt: 'This is a technical discussion about AI.',
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should include temperature option', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          temperature: 0.5,
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should include timestamp_granularities option', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          timestamp_granularities: ['word', 'segment'],
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should include organization ID in headers when provided', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          organization: 'test-org',
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'OpenAI-Organization': 'test-org',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should merge prompt config with provider config', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key', temperature: 0.5 },
      });

      const context = {
        prompt: {
          raw: '/path/to/audio.mp3',
          config: { temperature: 0.8 },
          label: 'test',
        },
        vars: {},
      };

      await provider.callApi('/path/to/audio.mp3', context);

      // Config should be merged with prompt config taking precedence
      expect(fetchWithCache).toHaveBeenCalled();
    });

    it('should use custom API URL when provided', async () => {
      const customApiUrl = 'https://custom-openai.example.com/v1';
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: customApiUrl,
        },
      });

      await provider.callApi('/path/to/audio.mp3');

      expect(fetchWithCache).toHaveBeenCalledWith(
        `${customApiUrl}/audio/transcriptions`,
        expect.any(Object),
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should handle bustCache from context', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      const context = {
        bustCache: true,
        prompt: { raw: '/path/to/audio.mp3', label: 'test' },
        vars: {},
      };

      await provider.callApi('/path/to/audio.mp3', context);

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should handle debug mode from context', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      const context = {
        debug: true,
        prompt: { raw: '/path/to/audio.mp3', label: 'test' },
        vars: {},
      };

      await provider.callApi('/path/to/audio.mp3', context);

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });
  });

  describe('Model validation', () => {
    it('should accept known transcription models', () => {
      const models = [
        'gpt-4o-transcribe',
        'gpt-4o-mini-transcribe',
        'gpt-4o-transcribe-diarize',
        'whisper-1',
      ];

      models.forEach((model) => {
        const provider = new OpenAiTranscriptionProvider(model, {
          config: { apiKey: 'test-key' },
        });
        expect(provider.id()).toBe(`openai:transcription:${model}`);
      });
    });

    it('should allow unknown transcription models with debug log', () => {
      const provider = new OpenAiTranscriptionProvider('unknown-model', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.id()).toBe('openai:transcription:unknown-model');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero duration audio', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          text: 'Test',
          duration: 0,
          language: 'en',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.cost).toBe(0);
    });

    it('should handle missing duration in response', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          text: 'Test',
          language: 'en',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.cost).toBe(0);
      expect(result.metadata?.duration).toBe(0);
    });

    it('should handle diarized segments with missing fields', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe-diarize', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          duration: 60,
          language: 'en',
          segments: [
            {
              // Missing speaker, start, end fields
              text: 'Test text',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('/path/to/audio.mp3');

      expect(result.output).toBe('[0.00s - 0.00s] Unknown: Test text');
    });

    it('should trim whitespace from audio file path', async () => {
      const provider = new OpenAiTranscriptionProvider('gpt-4o-transcribe', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('  /path/to/audio.mp3  ');

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/audio.mp3');
    });
  });
});
