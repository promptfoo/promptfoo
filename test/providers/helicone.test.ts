import { HeliconeGatewayProvider } from '../../src/providers/helicone';

describe('HeliconeGatewayProvider', () => {
  describe('constructor and configuration', () => {
    it('should create a provider with default configuration', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o');

      expect(provider).toBeInstanceOf(HeliconeGatewayProvider);
      expect(provider.modelName).toBe('openai/gpt-4o');
    });

    it('should use model from config when provided', () => {
      const provider = new HeliconeGatewayProvider('default-model', {
        config: {
          model: 'anthropic/claude-3-5-sonnet',
        },
      });

      expect(provider.modelName).toBe('anthropic/claude-3-5-sonnet');
    });

    it('should generate correct ID without router', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o');
      expect(provider.id()).toBe('helicone-gateway:openai/gpt-4o');
    });

    it('should generate correct ID with router', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o', {
        config: {
          router: 'production',
        },
      });
      expect(provider.id()).toBe('helicone-gateway:production:openai/gpt-4o');
    });

    it('should generate correct toString output', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o');
      expect(provider.toString()).toContain('Helicone AI Gateway');
    });

    it('should use custom base URL in toString', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o', {
        config: {
          baseUrl: 'http://custom-gateway:9000',
        },
      });
      expect(provider.toString()).toContain('custom-gateway:9000');
    });

    it('should handle configuration inheritance', () => {
      const provider = new HeliconeGatewayProvider('openai/gpt-4o', {
        config: {
          baseUrl: 'http://localhost:9000',
          router: 'test',
          temperature: 0.8,
          max_tokens: 500,
        },
      });

      // Test that the provider was created successfully with config
      expect(provider).toBeInstanceOf(HeliconeGatewayProvider);
      expect(provider.id()).toBe('helicone-gateway:test:openai/gpt-4o');
    });
  });
});
