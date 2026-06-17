import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENAI_ORIGINATOR,
  OPENAI_ORIGINATOR_HEADER,
  OpenAiGenericProvider,
} from '../../../src/providers/openai/index';
import { mockProcessEnv } from '../../util/utils';

describe('OpenAI Provider', () => {
  describe('OpenAiGenericProvider', () => {
    const provider = new OpenAiGenericProvider('test-model', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
      },
    });

    beforeEach(() => {
      mockProcessEnv({}, { clear: true });
    });

    it('should generate correct API URL', () => {
      expect(provider.getApiUrl()).toBe('https://api.openai.com/v1');
    });

    it('should use custom API host', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiHost: 'custom.openai.com' },
      });
      expect(customProvider.getApiUrl()).toBe('https://custom.openai.com/v1');
    });

    it('should use custom API base URL', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiBaseUrl: 'https://custom.api.com/openai' },
      });
      expect(customProvider.getApiUrl()).toBe('https://custom.api.com/openai');
    });

    it('should prefer an explicit API base URL over OpenAI environment overrides', () => {
      mockProcessEnv({
        OPENAI_API_HOST: 'proxy.openai.example.com',
        OPENAI_API_BASE_URL: 'https://base.openai.example.com/v1',
      });
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiBaseUrl: 'https://custom.api.com/v1' },
      });

      expect(customProvider.getApiUrl()).toBe('https://custom.api.com/v1');
    });

    it('should get organization', () => {
      expect(provider.getOrganization()).toBe('test-org');
    });

    it('should get organization from env', () => {
      mockProcessEnv({ OPENAI_ORGANIZATION: 'env-org' });
      const envProvider = new OpenAiGenericProvider('test-model');
      expect(envProvider.getOrganization()).toBe('env-org');
    });

    it('should include the default originator header and allow explicit overrides', () => {
      expect(provider.getOpenAiRequestHeaders()).toEqual({
        [OPENAI_ORIGINATOR_HEADER]: DEFAULT_OPENAI_ORIGINATOR,
        'OpenAI-Organization': 'test-org',
      });

      expect(
        provider.getOpenAiRequestHeaders({
          [OPENAI_ORIGINATOR_HEADER]: 'custom-originator',
        }),
      ).toMatchObject({
        [OPENAI_ORIGINATOR_HEADER]: 'custom-originator',
      });
    });

    // These two cases assert the FULL header object with toEqual on purpose: the bug
    // being guarded is a *duplicate* case-variant header sneaking into the output, so
    // the test must fail if any extra key (e.g. a second canonical-case header) appears.
    // toMatchObject would allow such an extra key through and miss the regression.
    it('should treat originator overrides case-insensitively', () => {
      expect(
        provider.getOpenAiRequestHeaders({
          'x-openai-originator': 'custom-originator',
        }),
      ).toEqual({
        'x-openai-originator': 'custom-originator',
        'OpenAI-Organization': 'test-org',
      });
    });

    it('should treat organization header overrides case-insensitively', () => {
      expect(
        provider.getOpenAiRequestHeaders({
          'openai-organization': 'custom-org',
        }),
      ).toEqual({
        'X-OpenAI-Originator': 'promptfoo',
        'openai-organization': 'custom-org',
      });
    });

    it('should not attribute compatible endpoints unless explicitly configured', () => {
      mockProcessEnv({ OPENAI_ORGANIZATION: 'openai-org' });
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiBaseUrl: 'https://custom.api.com/openai' },
      });

      expect(customProvider.getOpenAiRequestHeaders()).not.toHaveProperty(OPENAI_ORIGINATOR_HEADER);
      expect(customProvider.getOpenAiRequestHeaders()).not.toHaveProperty('OpenAI-Organization');
      expect(
        customProvider.getOpenAiRequestHeaders({
          [OPENAI_ORIGINATOR_HEADER]: 'custom-originator',
        }),
      ).toMatchObject({
        [OPENAI_ORIGINATOR_HEADER]: 'custom-originator',
      });
    });

    it('should get API key', () => {
      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should get API key from env', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'env-key' });
      const envProvider = new OpenAiGenericProvider('test-model');
      expect(envProvider.getApiKey()).toBe('env-key');
    });

    it('should get API key from custom env var', () => {
      mockProcessEnv({ CUSTOM_API_KEY: 'custom-key' });
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyEnvar: 'CUSTOM_API_KEY' },
      });
      expect(customProvider.getApiKey()).toBe('custom-key');
    });

    it('should not fall back to the OpenAI key when a custom env var is configured', () => {
      mockProcessEnv({ OPENAI_API_KEY: 'openai-key' });
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyEnvar: 'CUSTOM_API_KEY' },
      });

      expect(customProvider.getApiKey()).toBeUndefined();
    });

    it('should prefer provider env overrides for a custom API key variable', () => {
      mockProcessEnv({ FIREWORKS_API_KEY: 'process-key' });
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyEnvar: 'FIREWORKS_API_KEY' },
        env: { FIREWORKS_API_KEY: 'provider-key' },
      });

      expect(customProvider.getApiKey()).toBe('provider-key');
    });

    it('should generate correct ID', () => {
      expect(provider.id()).toBe('openai:test-model');
    });

    it('should generate custom ID with API host', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiHost: 'custom.openai.com' },
      });
      expect(customProvider.id()).toBe('test-model');
    });

    it('should have correct string representation', () => {
      expect(provider.toString()).toBe('[OpenAI Provider test-model]');
    });

    it('should require API key by default', () => {
      expect(provider.requiresApiKey()).toBe(true);
    });

    it('should allow disabling API key requirement', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyRequired: false },
      });
      expect(customProvider.requiresApiKey()).toBe(false);
    });

    it('should throw not implemented for callApi', async () => {
      await expect(provider.callApi('test prompt')).rejects.toThrow('Not implemented');
    });
  });
});
