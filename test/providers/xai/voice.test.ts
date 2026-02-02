import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateXAIVoiceCost,
  createXAIVoiceProvider,
  XAI_VOICE_COST_PER_MINUTE,
  XAI_VOICE_DEFAULT_API_URL,
  XAI_VOICE_DEFAULT_WS_URL,
  XAI_VOICE_DEFAULTS,
  type XAIFunctionCallOutput,
  XAIVoiceProvider,
} from '../../../src/providers/xai/voice';

vi.mock('../../../src/logger');

describe('XAI Voice Provider', () => {
  const mockApiKey = 'test-api-key';

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
    it('has correct default WebSocket URL', () => {
      expect(XAI_VOICE_DEFAULT_WS_URL).toBe('wss://api.x.ai/v1/realtime');
    });

    it('has correct default API URL', () => {
      expect(XAI_VOICE_DEFAULT_API_URL).toBe('https://api.x.ai/v1');
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

  // ============================================================================
  // Custom endpoint configuration (apiBaseUrl, apiHost)
  // ============================================================================

  describe('Custom endpoint configuration', () => {
    // Helper class to access protected methods for testing
    class TestableXAIVoiceProvider extends XAIVoiceProvider {
      public getApiUrl(): string {
        return super.getApiUrl();
      }
      public getWebSocketUrl(): string {
        return super.getWebSocketUrl();
      }
    }

    let originalEnvValue: string | undefined;

    beforeEach(() => {
      originalEnvValue = process.env.XAI_API_BASE_URL;
      delete process.env.XAI_API_BASE_URL;
    });

    afterEach(() => {
      if (originalEnvValue !== undefined) {
        process.env.XAI_API_BASE_URL = originalEnvValue;
      } else {
        delete process.env.XAI_API_BASE_URL;
      }
    });

    it('uses default URL when no custom URL is provided', () => {
      const provider = new TestableXAIVoiceProvider('grok-3');
      expect(provider.getApiUrl()).toBe('https://api.x.ai/v1');
      expect(provider.getWebSocketUrl()).toBe('wss://api.x.ai/v1/realtime');
    });

    it('uses apiBaseUrl when provided', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'https://my-proxy.com/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://my-proxy.com/v1');
      expect(provider.getWebSocketUrl()).toBe('wss://my-proxy.com/v1/realtime');
    });

    it('uses apiHost when provided', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiHost: 'my-proxy.com' },
      });
      expect(provider.getApiUrl()).toBe('https://my-proxy.com/v1');
      expect(provider.getWebSocketUrl()).toBe('wss://my-proxy.com/v1/realtime');
    });

    it('apiHost takes priority over apiBaseUrl', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: {
          apiHost: 'priority-host.com',
          apiBaseUrl: 'https://fallback.com/v1',
        },
      });
      expect(provider.getApiUrl()).toBe('https://priority-host.com/v1');
    });

    it('converts https to wss', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'https://secure.example.com/v1' },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://secure.example.com/v1/realtime');
    });

    it('converts http to ws', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'http://localhost:8080/v1' },
      });
      expect(provider.getWebSocketUrl()).toBe('ws://localhost:8080/v1/realtime');
    });

    it('strips trailing slashes from URL', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'https://my-proxy.com/v1/' },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://my-proxy.com/v1/realtime');
    });

    it('strips multiple trailing slashes from URL', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'https://my-proxy.com/v1///' },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://my-proxy.com/v1/realtime');
    });

    it('uses XAI_API_BASE_URL environment variable', () => {
      process.env.XAI_API_BASE_URL = 'https://env-proxy.com/v1';
      const provider = new TestableXAIVoiceProvider('grok-3');
      expect(provider.getApiUrl()).toBe('https://env-proxy.com/v1');
      expect(provider.getWebSocketUrl()).toBe('wss://env-proxy.com/v1/realtime');
    });

    it('config apiBaseUrl takes priority over environment variable', () => {
      process.env.XAI_API_BASE_URL = 'https://env-proxy.com/v1';
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { apiBaseUrl: 'https://config-proxy.com/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://config-proxy.com/v1');
    });

    it('uses env overrides when provided', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        env: { XAI_API_BASE_URL: 'https://override-proxy.com/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://override-proxy.com/v1');
      expect(provider.getWebSocketUrl()).toBe('wss://override-proxy.com/v1/realtime');
    });

    it('env overrides take priority over environment variable', () => {
      process.env.XAI_API_BASE_URL = 'https://env-proxy.com/v1';
      const provider = new TestableXAIVoiceProvider('grok-3', {
        env: { XAI_API_BASE_URL: 'https://override-proxy.com/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://override-proxy.com/v1');
    });

    it('accepts apiBaseUrl and apiHost in config', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          apiBaseUrl: 'https://custom.example.com/v1',
          apiHost: 'host.example.com',
        },
      });
      expect(provider.config.apiBaseUrl).toBe('https://custom.example.com/v1');
      expect(provider.config.apiHost).toBe('host.example.com');
    });

    it('uses websocketUrl exactly as provided', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { websocketUrl: 'wss://custom.example.com/path?token=xyz&session=abc' },
      });
      expect(provider.getWebSocketUrl()).toBe(
        'wss://custom.example.com/path?token=xyz&session=abc',
      );
    });

    it('websocketUrl takes priority over apiBaseUrl', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: {
          websocketUrl: 'wss://override.example.com/custom',
          apiBaseUrl: 'https://fallback.com/v1',
        },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://override.example.com/custom');
    });

    it('websocketUrl takes priority over apiHost', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: {
          websocketUrl: 'wss://override.example.com/custom',
          apiHost: 'fallback.com',
        },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://override.example.com/custom');
    });

    it('preserves query parameters in websocketUrl', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { websocketUrl: 'wss://mock.local:8080/ws?auth=token123&debug=true' },
      });
      expect(provider.getWebSocketUrl()).toBe('wss://mock.local:8080/ws?auth=token123&debug=true');
    });

    it('allows ws:// protocol in websocketUrl', () => {
      const provider = new TestableXAIVoiceProvider('grok-3', {
        config: { websocketUrl: 'ws://localhost:3000/realtime' },
      });
      expect(provider.getWebSocketUrl()).toBe('ws://localhost:3000/realtime');
    });

    it('accepts websocketUrl in config', () => {
      const provider = new XAIVoiceProvider('grok-3', {
        config: {
          websocketUrl: 'wss://custom.example.com/path',
        },
      });
      expect(provider.config.websocketUrl).toBe('wss://custom.example.com/path');
    });
  });

  // ============================================================================
  // Function call output interface
  // ============================================================================

  describe('Function call output interface', () => {
    it('XAIFunctionCallOutput has correct structure', () => {
      const output: XAIFunctionCallOutput = {
        name: 'set_volume',
        arguments: { level: 50 },
        result: 'success',
      };
      expect(output.name).toBe('set_volume');
      expect(output.arguments).toEqual({ level: 50 });
      expect(output.result).toBe('success');
    });

    it('XAIFunctionCallOutput allows optional result', () => {
      const output: XAIFunctionCallOutput = {
        name: 'get_weather',
        arguments: { location: 'San Francisco' },
      };
      expect(output.name).toBe('get_weather');
      expect(output.arguments).toEqual({ location: 'San Francisco' });
      expect(output.result).toBeUndefined();
    });

    it('XAIFunctionCallOutput supports complex arguments', () => {
      const output: XAIFunctionCallOutput = {
        name: 'search',
        arguments: {
          query: 'test',
          filters: { category: 'news', limit: 10 },
          options: ['featured', 'recent'],
        },
        result: JSON.stringify({ results: [] }),
      };
      expect(output.arguments.query).toBe('test');
      expect((output.arguments.filters as Record<string, unknown>).category).toBe('news');
      expect(output.arguments.options).toEqual(['featured', 'recent']);
    });

    it('accepts functionCallHandler in config', () => {
      const handler = async (_name: string, _args: string) => {
        return JSON.stringify({ success: true });
      };
      const provider = new XAIVoiceProvider('grok-3', {
        config: { functionCallHandler: handler },
      });
      expect(provider.config.functionCallHandler).toBe(handler);
    });
  });
});
