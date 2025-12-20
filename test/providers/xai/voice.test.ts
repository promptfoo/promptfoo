import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateXAIVoiceCost,
  createXAIVoiceProvider,
  XAI_VOICE_COST_PER_MINUTE,
  XAI_VOICE_DEFAULTS,
  XAI_VOICE_WS_URL,
  XAIVoiceProvider,
} from '../../../src/providers/xai/voice';

vi.mock('../../../src/logger');

describe('XAI Voice Provider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // Provider creation and configuration
  // ============================================================================

  describe('Provider creation and configuration', () => {
    it('creates a provider with correct id', () => {
      const provider = new XAIVoiceProvider('grok-3');
      expect(provider.id()).toBe('xai:voice:grok-3');
    });

    it('returns readable toString() description', () => {
      const provider = new XAIVoiceProvider('grok-3');
      expect(provider.toString()).toBe('[xAI Voice Provider grok-3]');
    });

    it('uses default model when none specified via factory', () => {
      const provider = createXAIVoiceProvider('xai:voice:');
      expect(provider.id()).toBe('xai:voice:grok-3');
    });

    it('parses model name correctly from provider path', () => {
      const provider = createXAIVoiceProvider('xai:voice:grok-4-fast');
      expect(provider.id()).toBe('xai:voice:grok-4-fast');
    });

    it('stores configuration correctly', () => {
      const config = {
        voice: 'Rex' as const,
        instructions: 'Be helpful',
        websocketTimeout: 60000,
      };
      const provider = new XAIVoiceProvider('grok-3', { config });
      expect(provider.config.voice).toBe('Rex');
      expect(provider.config.instructions).toBe('Be helpful');
      expect(provider.config.websocketTimeout).toBe(60000);
    });

    it('stores model name correctly', () => {
      const provider = new XAIVoiceProvider('grok-4-fast');
      expect(provider.modelName).toBe('grok-4-fast');
    });
  });

  // ============================================================================
  // Constants and defaults
  // ============================================================================

  describe('Constants and defaults', () => {
    it('has correct WebSocket URL', () => {
      expect(XAI_VOICE_WS_URL).toBe('wss://api.x.ai/v1/realtime');
    });

    it('has correct cost per minute', () => {
      expect(XAI_VOICE_COST_PER_MINUTE).toBe(0.05);
    });

    it('has correct default voice', () => {
      expect(XAI_VOICE_DEFAULTS.voice).toBe('Ara');
    });

    it('has correct default sample rate', () => {
      expect(XAI_VOICE_DEFAULTS.sampleRate).toBe(24000);
    });

    it('has correct default audio format', () => {
      expect(XAI_VOICE_DEFAULTS.audioFormat).toBe('audio/pcm');
    });

    it('has correct default websocket timeout', () => {
      expect(XAI_VOICE_DEFAULTS.websocketTimeout).toBe(30000);
    });
  });

  // ============================================================================
  // Cost calculation
  // ============================================================================

  describe('Cost calculation', () => {
    it('calculates cost correctly for 1 minute', () => {
      const cost = calculateXAIVoiceCost(60000);
      expect(cost).toBe(0.05);
    });

    it('calculates cost correctly for 2 minutes', () => {
      const cost = calculateXAIVoiceCost(120000);
      expect(cost).toBe(0.1);
    });

    it('calculates cost correctly for 30 seconds', () => {
      const cost = calculateXAIVoiceCost(30000);
      expect(cost).toBe(0.025);
    });

    it('calculates cost correctly for 0 duration', () => {
      const cost = calculateXAIVoiceCost(0);
      expect(cost).toBe(0);
    });

    it('calculates cost correctly for fractional minutes', () => {
      const cost = calculateXAIVoiceCost(90000);
      expect(cost).toBeCloseTo(0.075, 4);
    });

    it('calculates cost correctly for 10 minutes', () => {
      const cost = calculateXAIVoiceCost(600000);
      expect(cost).toBe(0.5);
    });
  });

  // ============================================================================
  // API key handling
  // ============================================================================

  describe('API key handling', () => {
    it('returns error when API key is not set', async () => {
      const originalKey = process.env.XAI_API_KEY;
      delete process.env.XAI_API_KEY;

      try {
        const provider = new XAIVoiceProvider('grok-3');
        const result = await provider.callApi('Hello');

        expect(result.error).toBe(
          'XAI_API_KEY is not set. Set the environment variable or add apiKey to the provider config.',
        );
      } finally {
        if (originalKey) {
          process.env.XAI_API_KEY = originalKey;
        }
      }
    });

    it('accepts API key from config', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: { apiKey: mockApiKey },
      });
      expect(provider.config.apiKey).toBe(mockApiKey);
    });
  });

  // ============================================================================
  // Configuration options
  // ============================================================================

  describe('Configuration options', () => {
    it('accepts all valid voices', () => {
      const voices = ['Ara', 'Rex', 'Sal', 'Eve', 'Leo'] as const;
      for (const voice of voices) {
        const provider = new XAIVoiceProvider('grok-3', { config: { voice } });
        expect(provider.config.voice).toBe(voice);
      }
    });

    it('accepts turn detection configuration', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: { turn_detection: { type: 'server_vad' } },
      });
      expect(provider.config.turn_detection).toEqual({ type: 'server_vad' });
    });

    it('accepts null turn detection for manual mode', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: { turn_detection: null },
      });
      expect(provider.config.turn_detection).toBeNull();
    });

    it('accepts audio format configuration', () => {
      const audioConfig = {
        input: { format: { type: 'audio/pcm' as const, rate: 16000 as const } },
        output: { format: { type: 'audio/pcm' as const, rate: 16000 as const } },
      };
      const provider = new XAIVoiceProvider('grok-3', {
        config: { audio: audioConfig },
      });
      expect(provider.config.audio?.input?.format.rate).toBe(16000);
      expect(provider.config.audio?.output?.format.rate).toBe(16000);
    });

    it('accepts modalities configuration', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: { modalities: ['text'] },
      });
      expect(provider.config.modalities).toEqual(['text']);
    });

    it('accepts instructions configuration', () => {
      const instructions = 'You are a helpful voice assistant';
      const provider = new XAIVoiceProvider('grok-3', {
        config: { instructions },
      });
      expect(provider.config.instructions).toBe(instructions);
    });

    it('accepts websocket timeout configuration', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: { websocketTimeout: 60000 },
      });
      expect(provider.config.websocketTimeout).toBe(60000);
    });
  });

  // ============================================================================
  // Tools configuration
  // ============================================================================

  describe('Tools configuration', () => {
    it('accepts web search tool', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          tools: [{ type: 'web_search' }],
        },
      });
      expect(provider.config.tools).toHaveLength(1);
      expect(provider.config.tools?.[0].type).toBe('web_search');
    });

    it('accepts x search tool with handles', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          tools: [{ type: 'x_search', allowed_x_handles: ['elonmusk', 'xai'] }],
        },
      });
      const tool = provider.config.tools?.[0];
      expect(tool?.type).toBe('x_search');
      if (tool?.type === 'x_search') {
        expect(tool.allowed_x_handles).toEqual(['elonmusk', 'xai']);
      }
    });

    it('accepts file search tool', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          tools: [{ type: 'file_search', vector_store_ids: ['vs-123'], max_num_results: 10 }],
        },
      });
      const tool = provider.config.tools?.[0];
      expect(tool?.type).toBe('file_search');
      if (tool?.type === 'file_search') {
        expect(tool.vector_store_ids).toEqual(['vs-123']);
        expect(tool.max_num_results).toBe(10);
      }
    });

    it('accepts function tool', () => {
      const functionTool = {
        type: 'function' as const,
        name: 'get_weather',
        description: 'Get weather for a location',
        parameters: {
          type: 'object' as const,
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      };
      const provider = new XAIVoiceProvider('grok-3', {
        config: { tools: [functionTool] },
      });
      expect(provider.config.tools?.[0]).toEqual(functionTool);
    });

    it('accepts multiple tools', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          tools: [{ type: 'web_search' }, { type: 'x_search' }],
        },
      });
      expect(provider.config.tools).toHaveLength(2);
    });
  });

  // ============================================================================
  // Factory function
  // ============================================================================

  describe('createXAIVoiceProvider factory function', () => {
    it('creates provider instance', () => {
      const provider = createXAIVoiceProvider('xai:voice:grok-3');
      expect(provider).toBeInstanceOf(XAIVoiceProvider);
    });

    it('uses default model when not specified', () => {
      const provider = createXAIVoiceProvider('xai:voice:');
      expect(provider.id()).toBe('xai:voice:grok-3');
    });

    it('passes through options correctly', () => {
      const options = {
        config: { voice: 'Eve' as const, instructions: 'Be friendly' },
      };
      const provider = createXAIVoiceProvider('xai:voice:grok-3', options);
      expect((provider as XAIVoiceProvider).config.voice).toBe('Eve');
      expect((provider as XAIVoiceProvider).config.instructions).toBe('Be friendly');
    });

    it('handles complex model names with colons', () => {
      const provider = createXAIVoiceProvider('xai:voice:grok-3:fast');
      expect(provider.id()).toBe('xai:voice:grok-3:fast');
    });

    it('handles model names with hyphens', () => {
      const provider = createXAIVoiceProvider('xai:voice:grok-4-1-fast');
      expect(provider.id()).toBe('xai:voice:grok-4-1-fast');
    });
  });

  // ============================================================================
  // Provider interface
  // ============================================================================

  describe('Provider interface', () => {
    it('implements id() method', () => {
      const provider = new XAIVoiceProvider('grok-3');
      expect(typeof provider.id).toBe('function');
      expect(provider.id()).toBe('xai:voice:grok-3');
    });

    it('implements toString() method', () => {
      const provider = new XAIVoiceProvider('grok-3');
      expect(typeof provider.toString).toBe('function');
      expect(provider.toString()).toBe('[xAI Voice Provider grok-3]');
    });

    it('implements callApi() method', () => {
      const provider = new XAIVoiceProvider('grok-3');
      expect(typeof provider.callApi).toBe('function');
    });
  });
});
