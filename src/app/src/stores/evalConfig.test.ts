import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, useStore } from './evalConfig';

describe('evalConfig store', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store state before each test
    useStore.getState().reset();
  });

  describe('config management', () => {
    it('should initialize with default config', () => {
      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should update config with updateConfig', () => {
      const updates = {
        description: 'Test Description',
        providers: [{ id: 'openai:gpt-4' }],
      };

      useStore.getState().updateConfig(updates);

      const { config } = useStore.getState();
      expect(config.description).toBe('Test Description');
      expect(config.providers).toEqual([{ id: 'openai:gpt-4' }]);
      // Other fields should remain as defaults
      expect(config.prompts).toEqual([]);
    });

    it('should replace entire config with setConfig', () => {
      const newConfig = {
        description: 'New Config',
        providers: [{ id: 'anthropic:claude' }],
        prompts: ['Test prompt'],
      };

      useStore.getState().setConfig(newConfig);

      const { config } = useStore.getState();
      expect(config).toEqual(newConfig);
      // Note: fields not in newConfig are undefined, not defaults
      expect(config.env).toBeUndefined();
    });

    it('should reset to default config', () => {
      // First, modify the config
      useStore.getState().updateConfig({
        description: 'Modified',
        providers: [{ id: 'test' }],
      });

      // Then reset
      useStore.getState().reset();

      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('does not persist sensitive environment values used for the current evaluation', () => {
      useStore.getState().updateConfig({
        description: 'Session config',
        env: {
          OPENAI_API_KEY: 'session-only-key',
          OPENAI_API_HOST: 'https://api.example.com',
          AWS_BEDROCK_REGION: 'us-east-1',
        },
      });

      expect(useStore.getState().config.env).toEqual({
        OPENAI_API_KEY: 'session-only-key',
        OPENAI_API_HOST: 'https://api.example.com',
        AWS_BEDROCK_REGION: 'us-east-1',
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.description).toBe('Session config');
      // Sensitive keys (API keys/secrets/tokens) are stripped; non-sensitive
      // configuration values like hostnames and region names are preserved.
      expect(persistedState.state.config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
        AWS_BEDROCK_REGION: 'us-east-1',
      });
    });

    it('does not persist inline provider API keys used for the current evaluation', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'openai:gpt-4o',
            config: {
              apiKey: 'inline-session-key',
              headers: { Authorization: 'Bearer temporary-token', 'x-request-id': 'visible-id' },
              temperature: 0.2,
            },
          },
        ],
      });

      const currentProviders = useStore.getState().config.providers;
      expect(Array.isArray(currentProviders)).toBe(true);
      if (!Array.isArray(currentProviders)) {
        throw new Error('Expected providers to be stored as an array');
      }
      expect((currentProviders[0] as { config: { apiKey?: string } }).config.apiKey).toBe(
        'inline-session-key',
      );

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        headers: { 'x-request-id': 'visible-id' },
        temperature: 0.2,
      });
    });

    it('removes sensitive environment values from previously persisted browser state on rehydrate', async () => {
      localStorage.setItem(
        'promptfoo',
        JSON.stringify({
          state: {
            config: {
              description: 'Previously saved config',
              env: {
                OPENAI_API_KEY: 'old-persisted-key',
                OPENAI_API_HOST: 'https://api.example.com',
              },
              providers: [
                {
                  id: 'openai:gpt-4o',
                  config: {
                    apiKey: 'old-inline-key',
                    headers: { Authorization: 'Bearer old-token' },
                    temperature: 0.4,
                  },
                },
              ],
            },
          },
          version: 0,
        }),
      );

      await useStore.persist.rehydrate();

      expect(useStore.getState().config.description).toBe('Previously saved config');
      expect(useStore.getState().config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
      });
      const rehydratedProviders = useStore.getState().config.providers;
      expect(Array.isArray(rehydratedProviders)).toBe(true);
      if (!Array.isArray(rehydratedProviders)) {
        throw new Error('Expected providers to rehydrate as an array');
      }
      expect((rehydratedProviders[0] as { config: Record<string, unknown> }).config).toEqual({
        headers: {},
        temperature: 0.4,
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
      });
      expect(persistedState.state.config.providers[0].config).toEqual({
        headers: {},
        temperature: 0.4,
      });
      expect(JSON.stringify(persistedState)).not.toContain('old-persisted-key');
      expect(JSON.stringify(persistedState)).not.toContain('old-inline-key');
      expect(JSON.stringify(persistedState)).not.toContain('Bearer old-token');
    });

    it('strips credentials regardless of casing convention', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'http',
            config: {
              bearerToken: 'a',
              access_token: 'b',
              refreshToken: 'c',
              privateKey: 'd',
              pfxPassword: 'e',
              keystorePassphrase: 'f',
              'x-api-key': 'g',
              signature: 'h',
              cookie: 'i',
              endpoint: 'https://example.com',
              timeoutMs: 5000,
            } as any,
          },
        ],
        env: {
          BEARER_TOKEN: 'a',
          ACCESS_TOKEN: 'b',
          REFRESH_TOKEN: 'c',
          AWS_SECRET_ACCESS_KEY: 'd',
          GITHUB_TOKEN: 'e',
          DATABASE_PASSWORD: 'f',
          API_BASE_URL: 'https://api.example.com',
          MAX_RETRIES: '3',
        } as any,
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        endpoint: 'https://example.com',
        timeoutMs: 5000,
      });
      expect(persistedState.state.config.env).toEqual({
        API_BASE_URL: 'https://api.example.com',
        MAX_RETRIES: '3',
      });
    });
  });

  describe('defaultTest handling', () => {
    it('should accept string defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should accept object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
        options: { provider: 'openai:gpt-4' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle undefined defaultTest', () => {
      // Set to undefined explicitly
      useStore.getState().updateConfig({ defaultTest: undefined as any });

      // When set to undefined, it becomes undefined
      expect(useStore.getState().config.defaultTest).toBeUndefined();
    });

    it('should update from object to string defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });
      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);

      const stringDefaultTest = 'file://new/path/defaultTest.yaml';
      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should update from string to object defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });
      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);

      const objectDefaultTest = {
        assert: [{ type: 'contains' as const, value: 'new' }],
        metadata: { suite: 'test' },
      };
      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });
  });

  describe('getTestSuite', () => {
    it('should return config with string defaultTest', () => {
      const stringDefaultTest = 'file://shared/defaultTest.yaml';

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: stringDefaultTest,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toBe(stringDefaultTest);
      expect(config.description).toBe('Test config');
    });

    it('should return config with object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: objectDefaultTest as any,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle complex prompts configuration', () => {
      // Test string prompts
      useStore.getState().updateConfig({ prompts: ['Test prompt'] });
      expect(useStore.getState().config.prompts).toEqual(['Test prompt']);

      // Test array of prompts
      const multiplePrompts = ['Prompt 1', 'Prompt 2'];
      useStore.getState().updateConfig({ prompts: multiplePrompts });
      expect(useStore.getState().config.prompts).toEqual(multiplePrompts);
    });

    it('should include new fields like derivedMetrics automatically', () => {
      const derivedMetrics = [
        { name: 'precision', value: 'tp / (tp + fp)' },
        { name: 'recall', value: 'tp / (tp + fn)' },
      ];

      useStore.getState().updateConfig({ derivedMetrics });

      const testSuite = useStore.getState().getTestSuite();
      expect(testSuite.derivedMetrics).toEqual(derivedMetrics);
    });
  });
});
