import { describe, expect, it } from 'vitest';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';

import type { ApiProvider } from '../../src/types/providers';

function createMockProvider(id: string, config: Record<string, any> = {}): ApiProvider {
  return {
    id: () => id,
    config,
    callApi: async () => ({ output: 'mock' }),
  } as ApiProvider;
}

describe('getRateLimitKey', () => {
  describe('Basic provider ID', () => {
    it('should return provider ID when no config', () => {
      const provider = createMockProvider('openai:gpt-4');

      const key = getRateLimitKey(provider);

      expect(key).toBe('openai:gpt-4');
    });

    it('should return provider ID when config is empty', () => {
      const provider = createMockProvider('openai:gpt-4', {});

      const key = getRateLimitKey(provider);

      expect(key).toBe('openai:gpt-4');
    });

    it('should return provider ID when config has irrelevant fields', () => {
      const provider = createMockProvider('openai:gpt-4', {
        temperature: 0.7,
        maxTokens: 1000,
      });

      const key = getRateLimitKey(provider);

      expect(key).toBe('openai:gpt-4');
    });
  });

  describe('API key hashing', () => {
    it('should include hashed API key in key', () => {
      const provider = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-test-key-12345',
      });

      const key = getRateLimitKey(provider);

      expect(key).toMatch(/^openai:gpt-4\[.{12}\]$/);
    });

    it('should generate different keys for different API keys', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-key-1',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-key-2',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
    });

    it('should generate same key for same API key', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-same-key',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-same-key',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).toBe(key2);
    });

    it('should not expose API key in the output', () => {
      const apiKey = 'sk-super-secret-key-abc123xyz';
      const provider = createMockProvider('openai:gpt-4', { apiKey });

      const key = getRateLimitKey(provider);

      expect(key).not.toContain('secret');
      expect(key).not.toContain('abc123');
      expect(key).not.toContain(apiKey);
    });
  });

  describe('API base URL handling', () => {
    it('should include apiBaseUrl in key', () => {
      const provider = createMockProvider('openai:gpt-4', {
        apiBaseUrl: 'https://custom.openai.azure.com',
      });

      const key = getRateLimitKey(provider);

      expect(key).toMatch(/^openai:gpt-4\[.{12}\]$/);
    });

    it('should generate different keys for different base URLs', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiBaseUrl: 'https://api.openai.com',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        apiBaseUrl: 'https://custom.azure.com',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Region handling', () => {
    it('should include region in key', () => {
      const provider = createMockProvider('anthropic:claude-3', {
        region: 'us-east-1',
      });

      const key = getRateLimitKey(provider);

      expect(key).toMatch(/^anthropic:claude-3\[.{12}\]$/);
    });

    it('should generate different keys for different regions', () => {
      const provider1 = createMockProvider('anthropic:claude-3', {
        region: 'us-east-1',
      });
      const provider2 = createMockProvider('anthropic:claude-3', {
        region: 'eu-west-1',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Organization handling', () => {
    it('should include organization in key', () => {
      const provider = createMockProvider('openai:gpt-4', {
        organization: 'org-123',
      });

      const key = getRateLimitKey(provider);

      expect(key).toMatch(/^openai:gpt-4\[.{12}\]$/);
    });

    it('should generate different keys for different organizations', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        organization: 'org-1',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        organization: 'org-2',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('Combined config handling', () => {
    it('should generate consistent key for same combined config', () => {
      const config = {
        apiKey: 'sk-key',
        apiBaseUrl: 'https://api.openai.com',
        region: 'us-east-1',
        organization: 'org-1',
      };
      const provider1 = createMockProvider('openai:gpt-4', config);
      const provider2 = createMockProvider('openai:gpt-4', config);

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different combined configs', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-key',
        organization: 'org-1',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-key',
        organization: 'org-2',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
    });

    it('should be stable regardless of config property order', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-key',
        region: 'us-east-1',
        organization: 'org-1',
      });
      const provider2 = createMockProvider('openai:gpt-4', {
        organization: 'org-1',
        apiKey: 'sk-key',
        region: 'us-east-1',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).toBe(key2);
    });
  });

  describe('Different provider IDs', () => {
    it('should generate different keys for different providers', () => {
      const provider1 = createMockProvider('openai:gpt-4', {
        apiKey: 'sk-same-key',
      });
      const provider2 = createMockProvider('anthropic:claude-3', {
        apiKey: 'sk-same-key',
      });

      const key1 = getRateLimitKey(provider1);
      const key2 = getRateLimitKey(provider2);

      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^openai:gpt-4/);
      expect(key2).toMatch(/^anthropic:claude-3/);
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined config', () => {
      const provider = {
        id: () => 'test-provider',
        callApi: async () => ({ output: 'mock' }),
      } as ApiProvider;

      const key = getRateLimitKey(provider);

      expect(key).toBe('test-provider');
    });

    it('should handle empty string values', () => {
      const provider = createMockProvider('openai:gpt-4', {
        apiKey: '',
      });

      const key = getRateLimitKey(provider);

      // Empty string is falsy so should not be included
      expect(key).toBe('openai:gpt-4');
    });

    it('should handle special characters in provider ID', () => {
      const provider = createMockProvider('custom:model/v1.2-beta', {
        apiKey: 'test-key',
      });

      const key = getRateLimitKey(provider);

      expect(key).toMatch(/^custom:model\/v1\.2-beta\[.{12}\]$/);
    });
  });
});
