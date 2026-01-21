import { describe, expect, it } from 'vitest';
import { filterProviderConfigs, filterProviders } from '../../../src/commands/eval/filterProviders';

import type { ApiProvider, TestSuiteConfig } from '../../../src/types/index';
import type { ProviderOptions, ProviderOptionsMap } from '../../../src/types/providers';

describe('filterProviders', () => {
  const mockProviders: ApiProvider[] = [
    {
      id: () => 'openai:gpt-4',
      label: 'GPT-4',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'openai:gpt-3.5-turbo',
      label: 'GPT-3.5',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'anthropic:claude-2',
      label: 'Claude',
      callApi: async () => ({ output: '' }),
    },
    {
      id: () => 'custom:provider',
      callApi: async () => ({ output: '' }),
      // No label
    },
  ];

  it('should return all providers if no filter is provided', () => {
    const result = filterProviders(mockProviders);
    expect(result).toEqual(mockProviders);
  });

  it('should filter providers by ID', () => {
    const result = filterProviders(mockProviders, 'openai');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id())).toEqual(['openai:gpt-4', 'openai:gpt-3.5-turbo']);
  });

  it('should filter providers by label', () => {
    const result = filterProviders(mockProviders, 'GPT');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label)).toEqual(['GPT-4', 'GPT-3.5']);
  });

  it('should handle providers without labels', () => {
    const result = filterProviders(mockProviders, 'custom');
    expect(result).toHaveLength(1);
    expect(result[0].id()).toBe('custom:provider');
  });

  it('should handle regex patterns', () => {
    const result = filterProviders(mockProviders, '(gpt|claude)');
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id())).toEqual([
      'openai:gpt-4',
      'openai:gpt-3.5-turbo',
      'anthropic:claude-2',
    ]);
  });

  it('should return empty array if no providers match filter', () => {
    const result = filterProviders(mockProviders, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should handle case sensitivity', () => {
    const result = filterProviders(mockProviders, 'GPT');
    expect(result).toHaveLength(2);
  });
});

describe('filterProviderConfigs', () => {
  describe('string providers', () => {
    it('should return the string if it matches the filter', () => {
      const result = filterProviderConfigs('openai:gpt-4', 'openai');
      expect(result).toBe('openai:gpt-4');
    });

    it('should return empty array if string does not match', () => {
      const result = filterProviderConfigs('openai:gpt-4', 'anthropic');
      expect(result).toEqual([]);
    });

    it('should handle regex patterns for strings', () => {
      const result = filterProviderConfigs('openai:gpt-4', 'gpt-[0-9]');
      expect(result).toBe('openai:gpt-4');
    });
  });

  describe('function providers', () => {
    it('should filter function provider by label', () => {
      const fn = Object.assign(async () => ({ output: '' }), { label: 'MyFunction' });
      const result = filterProviderConfigs(fn, 'MyFunction');
      expect(result).toBe(fn);
    });

    it('should filter function provider without label by default id', () => {
      const fn = async () => ({ output: '' });
      const result = filterProviderConfigs(fn, 'custom-function');
      expect(result).toBe(fn);
    });

    it('should return empty array if function label does not match', () => {
      const fn = Object.assign(async () => ({ output: '' }), { label: 'MyFunction' });
      const result = filterProviderConfigs(fn, 'OtherFunction');
      expect(result).toEqual([]);
    });
  });

  describe('array of providers', () => {
    it('should return all providers if no filter is provided', () => {
      const providers = ['openai:gpt-4', 'anthropic:claude-2'];
      const result = filterProviderConfigs(providers);
      expect(result).toEqual(providers);
    });

    it('should filter string providers in array', () => {
      const providers = ['openai:gpt-4', 'openai:gpt-3.5-turbo', 'anthropic:claude-2'];
      const result = filterProviderConfigs(providers, 'openai');
      expect(result).toEqual(['openai:gpt-4', 'openai:gpt-3.5-turbo']);
    });

    it('should filter ProviderOptions by id', () => {
      const providers: ProviderOptions[] = [
        { id: 'openai:gpt-4', label: 'GPT-4' },
        { id: 'anthropic:claude-2', label: 'Claude' },
      ];
      const result = filterProviderConfigs(providers, 'openai');
      expect(result).toHaveLength(1);
      expect((result as ProviderOptions[])[0].id).toBe('openai:gpt-4');
    });

    it('should filter ProviderOptions by label', () => {
      const providers: ProviderOptions[] = [
        { id: 'openai:gpt-4', label: 'Dev' },
        { id: 'openai:gpt-4', label: 'Stage' },
        { id: 'openai:gpt-4', label: 'Prod' },
      ];
      const result = filterProviderConfigs(providers, 'Dev');
      expect(result).toHaveLength(1);
      expect((result as ProviderOptions[])[0].label).toBe('Dev');
    });

    it('should filter ProviderOptionsMap by key (provider id)', () => {
      const providers: ProviderOptionsMap[] = [
        { 'openai:gpt-4': { label: 'Dev' } },
        { 'anthropic:claude-2': { label: 'Stage' } },
      ];
      const result = filterProviderConfigs(providers, 'openai');
      expect(result).toHaveLength(1);
    });

    it('should filter ProviderOptionsMap by nested label', () => {
      const providers: ProviderOptionsMap[] = [
        { 'openai:gpt-4': { label: 'Dev' } },
        { 'openai:gpt-4': { label: 'Stage' } },
      ];
      const result = filterProviderConfigs(providers, 'Stage');
      expect(result).toHaveLength(1);
      expect((result as ProviderOptionsMap[])[0]['openai:gpt-4'].label).toBe('Stage');
    });

    it('should handle mixed array of provider types', () => {
      const fn = Object.assign(async () => ({ output: '' }), { label: 'CustomDev' });
      const providers: TestSuiteConfig['providers'] = [
        'openai:gpt-4',
        { id: 'anthropic:claude-2', label: 'ClaudeDev' },
        { 'google:gemini': { label: 'GeminiDev' } } as ProviderOptionsMap,
        fn,
      ];
      const result = filterProviderConfigs(providers, 'Dev');
      expect(result).toHaveLength(3);
    });

    it('should return empty array if no providers match', () => {
      const providers = ['openai:gpt-4', 'anthropic:claude-2'];
      const result = filterProviderConfigs(providers, 'nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('regex patterns', () => {
    it('should support complex regex patterns', () => {
      const providers: ProviderOptions[] = [
        { id: 'openai:gpt-4', label: 'Dev-US' },
        { id: 'openai:gpt-4', label: 'Dev-EU' },
        { id: 'openai:gpt-4', label: 'Prod-US' },
      ];
      const result = filterProviderConfigs(providers, 'Dev-.*');
      expect(result).toHaveLength(2);
    });

    it('should match either id or label with regex', () => {
      const providers: ProviderOptions[] = [
        { id: 'openai:gpt-4', label: 'Production' },
        { id: 'anthropic:claude-sonnet', label: 'Dev' },
      ];
      const result = filterProviderConfigs(providers, '(gpt|sonnet)');
      expect(result).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty array', () => {
      const result = filterProviderConfigs([], 'anything');
      expect(result).toEqual([]);
    });

    it('should handle provider without label filtering by id only', () => {
      const providers: ProviderOptions[] = [{ id: 'openai:gpt-4' }];
      const result = filterProviderConfigs(providers, 'gpt-4');
      expect(result).toHaveLength(1);
    });

    it('should handle ProviderOptionsMap with overridden id', () => {
      const providers: ProviderOptionsMap[] = [
        { 'file://custom.js': { id: 'my-custom-id', label: 'Dev' } },
      ];
      // Should match the overridden id, not the key
      const result = filterProviderConfigs(providers, 'my-custom-id');
      expect(result).toHaveLength(1);
    });

    it('should filter HTTP providers with config by label (bug report case)', () => {
      const providers: ProviderOptions[] = [
        {
          id: 'https',
          label: 'direct-haiku-4.5',
          config: {
            url: 'http://localhost:3333/assistant',
            method: 'POST',
            headers: {
              Accept: '{{acceptHeader}}',
              'Content-Type': 'application/json',
              'X-Assistant-Model': 'anthropic:claude-haiku-4-5-20251001',
              'X-Conversation-ID': '{{conversationId}}',
              'X-System-ID': '{{systemId}}',
            },
            body: {
              prompt: '{{prompt}}',
            },
          },
        },
        {
          id: 'https',
          label: 'haiku-4.5',
          config: {
            url: 'http://localhost:3333/assistant',
            method: 'POST',
            headers: {
              Accept: '{{acceptHeader}}',
              'Content-Type': 'application/json',
              'X-Assistant-Model': 'openrouter:haiku-4.5',
              'X-Conversation-ID': '{{conversationId}}',
              'X-System-ID': '{{systemId}}',
            },
            body: {
              prompt: '{{prompt}}',
            },
            transformResponse: 'json',
          },
        },
      ];
      const result = filterProviderConfigs(providers, 'direct-haiku-4.5');
      expect(result).toHaveLength(1);
      expect((result as ProviderOptions[])[0].label).toBe('direct-haiku-4.5');
    });

    it('should handle provider with null or empty id', () => {
      const providers: Array<Partial<ProviderOptions>> = [
        { id: null as any, label: 'Provider1', config: {} },
        { id: '', label: 'Provider2', config: {} },
        { id: undefined, label: 'Provider3', config: {} },
      ];
      const result = filterProviderConfigs(providers as any, 'Provider2');
      expect(result).toHaveLength(1);
      expect((result as Array<Partial<ProviderOptions>>)[0].label).toBe('Provider2');
    });
  });
});
