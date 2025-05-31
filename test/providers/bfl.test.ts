import { BlackForestLabsProvider, createBlackForestLabsProvider } from '../../src/providers/bfl';

jest.mock('../../src/logger');

describe('BlackForestLabsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a provider with default config', () => {
      const provider = new BlackForestLabsProvider('flux-pro-1.1');
      expect(provider.modelName).toBe('flux-pro-1.1');
      expect(provider.config).toEqual({});
    });

    it('should create a provider with custom config', () => {
      const config = { seed: 42, output_format: 'jpeg' as const };
      const provider = new BlackForestLabsProvider('flux-kontext-pro', { config });
      expect(provider.modelName).toBe('flux-kontext-pro');
      expect(provider.config).toEqual(config);
    });
  });

  describe('id', () => {
    it('should return correct provider id', () => {
      const provider = new BlackForestLabsProvider('flux-pro-1.1');
      expect(provider.id()).toBe('bfl:flux-pro-1.1');
    });
  });

  describe('toString', () => {
    it('should return correct string representation', () => {
      const provider = new BlackForestLabsProvider('flux-kontext-pro');
      expect(provider.toString()).toBe('[Black Forest Labs Provider flux-kontext-pro]');
    });
  });

  describe('getApiKey', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return API key from config', () => {
      const provider = new BlackForestLabsProvider('flux-pro-1.1', {
        config: { apiKey: 'config-key' },
      });
      expect(provider.getApiKey()).toBe('config-key');
    });

    it('should return API key from environment variable', () => {
      process.env.BFL_API_KEY = 'env-key';
      const provider = new BlackForestLabsProvider('flux-pro-1.1');
      expect(provider.getApiKey()).toBe('env-key');
    });

    it('should prioritize config over environment', () => {
      process.env.BFL_API_KEY = 'env-key';
      const provider = new BlackForestLabsProvider('flux-pro-1.1', {
        config: { apiKey: 'config-key' },
      });
      expect(provider.getApiKey()).toBe('config-key');
    });
  });

  describe('getEndpoint', () => {
    it('should return correct endpoint for different models', () => {
      const testCases = [
        { model: 'flux-kontext-pro', expected: '/flux-kontext-pro' },
        { model: 'flux-kontext-max', expected: '/flux-kontext-max' },
        { model: 'flux-pro-1.1', expected: '/flux-pro-1.1' },
        { model: 'flux-pro', expected: '/flux-pro' },
        { model: 'flux-dev', expected: '/flux-dev' },
        { model: 'flux-fill-pro', expected: '/flux-fill-pro' },
        { model: 'flux-canny-pro', expected: '/flux-canny-pro' },
        { model: 'flux-depth-pro', expected: '/flux-depth-pro' },
      ];

      testCases.forEach(({ model, expected }) => {
        const provider = new BlackForestLabsProvider(model as any);
        expect((provider as any).getEndpoint()).toBe(expected);
      });
    });

    it('should return default endpoint for unknown model', () => {
      const provider = new BlackForestLabsProvider('unknown-model' as any);
      expect((provider as any).getEndpoint()).toBe('/flux-pro-1.1');
    });
  });

  describe('calculateCost', () => {
    it('should return correct cost for different models', () => {
      const testCases = [
        { model: 'flux-kontext-pro', expected: 0.05 },
        { model: 'flux-kontext-max', expected: 0.08 },
        { model: 'flux-pro-1.1', expected: 0.04 },
        { model: 'flux-pro', expected: 0.04 },
        { model: 'flux-dev', expected: 0.02 },
        { model: 'flux-fill-pro', expected: 0.04 },
        { model: 'flux-canny-pro', expected: 0.04 },
        { model: 'flux-depth-pro', expected: 0.04 },
      ];

      testCases.forEach(({ model, expected }) => {
        const provider = new BlackForestLabsProvider(model as any);
        expect((provider as any).calculateCost()).toBe(expected);
      });
    });

    it('should return default cost for unknown model', () => {
      const provider = new BlackForestLabsProvider('unknown-model' as any);
      expect((provider as any).calculateCost()).toBe(0.04);
    });
  });

  describe('callApi', () => {
    it('should throw error when API key is not set', async () => {
      const provider = new BlackForestLabsProvider('flux-pro-1.1');
      
      await expect(provider.callApi('test prompt')).rejects.toThrow(
        'Black Forest Labs API key is not set'
      );
    });
  });
});

describe('createBlackForestLabsProvider', () => {
  it('should create provider with correct model name', () => {
    const provider = createBlackForestLabsProvider('bfl:flux-pro-1.1');
    expect(provider.id()).toBe('bfl:flux-pro-1.1');
  });

  it('should create provider with config', () => {
    const config = { seed: 42 };
    const provider = createBlackForestLabsProvider('bfl:flux-kontext-pro', { config });
    expect((provider as BlackForestLabsProvider).config).toEqual(config);
  });

  it('should throw error for invalid provider path', () => {
    expect(() => createBlackForestLabsProvider('bfl')).toThrow(
      'Invalid BFL provider path: bfl. Use format: bfl:<model-name>'
    );
  });

  it('should handle complex model names', () => {
    const provider = createBlackForestLabsProvider('bfl:flux-pro-1.1');
    expect((provider as BlackForestLabsProvider).modelName).toBe('flux-pro-1.1');
  });
}); 