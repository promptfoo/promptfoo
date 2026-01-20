import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuiverAiProvider, QuiverAiChatProvider } from '../../src/providers/quiverai';

describe('QuiverAI Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QUIVERAI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.QUIVERAI_API_KEY;
    vi.resetAllMocks();
  });

  describe('QuiverAiChatProvider', () => {
    it('should initialize with correct model name', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.modelName).toBe('arrow-0.5');
    });

    it('should return correct provider id', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should return correct string representation', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.toString()).toBe('[QuiverAI Provider arrow-0.5]');
    });

    it('should use correct API base URL', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {});
      expect(provider.getApiUrlDefault()).toBe('https://api.quiver.ai/v1');
    });

    it('should use custom apiBaseUrl when provided', () => {
      const provider = new QuiverAiChatProvider('arrow-0.5', {
        config: {
          apiBaseUrl: 'https://custom.api.quiver.ai/v1',
        },
      });
      expect(provider.config.apiBaseUrl).toBe('https://custom.api.quiver.ai/v1');
    });
  });

  describe('createQuiverAiProvider', () => {
    it('should create chat provider for quiverai:model format', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-0.5');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should create chat provider for quiverai:chat:model format', () => {
      const provider = createQuiverAiProvider('quiverai:chat:arrow-0.5');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should use default model when not specified', () => {
      const provider = createQuiverAiProvider('quiverai:');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5');
    });

    it('should support preview model', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-0.5-preview');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:arrow-0.5-preview');
    });

    it('should pass config to chat provider', () => {
      const provider = createQuiverAiProvider('quiverai:arrow-0.5', {
        config: {
          temperature: 0.5,
        },
      }) as QuiverAiChatProvider;

      expect(provider.config.temperature).toBe(0.5);
    });

    it('should pass env overrides to chat provider', () => {
      const provider = createQuiverAiProvider(
        'quiverai:arrow-0.5',
        {},
        { QUIVERAI_API_KEY: 'override-key' },
      ) as QuiverAiChatProvider;

      expect(provider.env?.QUIVERAI_API_KEY).toBe('override-key');
    });

    it('should handle model names with colons', () => {
      const provider = createQuiverAiProvider('quiverai:chat:some:model:name');
      expect(provider).toBeInstanceOf(QuiverAiChatProvider);
      expect(provider.id()).toBe('quiverai:some:model:name');
    });
  });
});
