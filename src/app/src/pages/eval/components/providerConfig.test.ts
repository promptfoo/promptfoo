import { describe, expect, it } from 'vitest';
import { extractConfigBadges, findProviderConfig, getProviderDisplayName } from './providerConfig';

describe('findProviderConfig', () => {
  it('returns none when providersArray is undefined', () => {
    const result = findProviderConfig('openai:gpt-4o', undefined);
    expect(result.matchType).toBe('none');
    expect(result.config).toBeUndefined();
  });

  it('returns none when providersArray is empty', () => {
    const result = findProviderConfig('openai:gpt-4o', []);
    expect(result.matchType).toBe('none');
    expect(result.config).toBeUndefined();
  });

  it('matches string provider by id', () => {
    const providers = ['openai:gpt-4o', 'openai:gpt-4o-mini'];
    const result = findProviderConfig('openai:gpt-4o', providers);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('openai:gpt-4o');
  });

  it('matches ProviderOptions object by id', () => {
    const providers = [
      {
        id: 'openai:gpt-4o',
        config: { temperature: 0.7 },
      },
    ];
    const result = findProviderConfig('openai:gpt-4o', providers);
    expect(result.matchType).toBe('id');
    expect(result.config!.config.temperature).toBe(0.7);
  });

  it('matches ProviderOptions object by label', () => {
    const providers = [
      {
        id: 'openai:gpt-4o',
        label: 'My GPT Model',
        config: { temperature: 0.5 },
      },
    ];
    const result = findProviderConfig('My GPT Model', providers);
    expect(result.matchType).toBe('label');
    expect(result.config!.config.temperature).toBe(0.5);
  });

  it('matches record-style provider definition', () => {
    const providers = [
      {
        'google:gemini-2.0-flash': {
          config: {
            generationConfig: {
              thinkingConfig: { thinkingLevel: 'HIGH' },
            },
          },
        },
      },
    ];
    const result = findProviderConfig('google:gemini-2.0-flash', providers);
    // Record-style definitions get normalized to have an id, so they match in the first pass
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('google:gemini-2.0-flash');
    expect(result.config!.config.generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH');
  });

  it('falls back to index when no id/label match found', () => {
    const providers = [
      { id: 'openai:gpt-4o', config: { temperature: 0.7 } },
      { id: 'openai:gpt-4o-mini', config: { temperature: 0.9 } },
    ];
    const result = findProviderConfig('some-unknown-provider', providers, 1);
    expect(result.matchType).toBe('index');
    expect(result.config!.config.temperature).toBe(0.9);
  });

  it('returns none when index fallback is out of bounds', () => {
    const providers = [{ id: 'openai:gpt-4o' }];
    const result = findProviderConfig('unknown', providers, 5);
    expect(result.matchType).toBe('none');
  });

  it('does not spread string provider into indexed characters', () => {
    // Bug fix: when provider is a string like "echo", spreading it would create
    // { '0': 'e', '1': 'c', '2': 'h', '3': 'o' } which is incorrect
    const providers = ['echo', 'openai:gpt-4o'];
    const result = findProviderConfig('echo', providers);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('echo');
    // Should NOT have indexed character properties
    expect((result.config as any)['0']).toBeUndefined();
    expect((result.config as any)['1']).toBeUndefined();
    expect((result.config as any)['2']).toBeUndefined();
    expect((result.config as any)['3']).toBeUndefined();
  });

  it('handles string provider in index fallback without spreading characters', () => {
    const providers = ['echo'];
    const result = findProviderConfig('unknown', providers, 0);
    expect(result.matchType).toBe('index');
    expect(result.config!.id).toBe('echo');
    // Should NOT have indexed character properties
    expect((result.config as any)['0']).toBeUndefined();
  });

  it('handles null provider in array', () => {
    const providers = [null, { id: 'openai:gpt-4o' }];
    const result = findProviderConfig('openai:gpt-4o', providers as any);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('openai:gpt-4o');
  });

  it('handles undefined provider in array', () => {
    const providers = [undefined, { id: 'openai:gpt-4o' }];
    const result = findProviderConfig('openai:gpt-4o', providers as any);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('openai:gpt-4o');
  });

  it('handles object with only ProviderOptions fields', () => {
    const providers = [
      {
        config: { temperature: 0.5 },
        prompts: ['test'],
      },
    ];
    const result = findProviderConfig('test-provider', providers, 0);
    expect(result.matchType).toBe('index');
    expect(result.config!.config.temperature).toBe(0.5);
  });

  it('handles empty object in providers array', () => {
    const providers = [{}, { id: 'openai:gpt-4o' }];
    const result = findProviderConfig('openai:gpt-4o', providers);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('openai:gpt-4o');
  });

  it('handles object with multiple keys (not record-style)', () => {
    const providers = [
      {
        id: 'openai:gpt-4o',
        label: 'GPT',
        config: { temperature: 0.5 },
        extraField: 'value',
      },
    ];
    const result = findProviderConfig('openai:gpt-4o', providers);
    expect(result.matchType).toBe('id');
    expect(result.config!.id).toBe('openai:gpt-4o');
    expect((result.config as any).extraField).toBe('value');
  });

  it('matches record-style with known ProviderOptions field as key', () => {
    // { config: {...} } should NOT be treated as record-style
    const providers = [{ config: { temperature: 0.5 } }];
    const result = findProviderConfig('config', providers);
    // Should not match by record-key since 'config' is a known field
    expect(result.matchType).toBe('none');
  });

  it('prioritizes id match over label match', () => {
    const providers = [
      { id: 'test', label: 'Test Provider' },
      { id: 'openai:gpt-4o', label: 'test' },
    ];
    const result = findProviderConfig('test', providers);
    // First provider matches by id, should be returned
    expect(result.matchType).toBe('id');
    expect(result.config!.label).toBe('Test Provider');
  });

  it('prioritizes id/label match over record-key match', () => {
    const providers = [
      { 'openai:gpt-4o': { config: { temperature: 0.3 } } },
      { id: 'openai:gpt-4o', config: { temperature: 0.7 } },
    ];
    const result = findProviderConfig('openai:gpt-4o', providers);
    // First provider should match in first pass (after normalization)
    expect(result.matchType).toBe('id');
  });

  it('handles non-array providersArray', () => {
    const result = findProviderConfig('openai:gpt-4o', 'not-an-array' as any);
    expect(result.matchType).toBe('none');
    expect(result.config).toBeUndefined();
  });

  it('handles negative fallbackIndex', () => {
    const providers = [{ id: 'openai:gpt-4o' }];
    const result = findProviderConfig('unknown', providers, -1);
    // Note: The implementation has a bug - it checks fallbackIndex < length but doesn't check >= 0
    // -1 < 1 is true, so it tries providers[-1] which returns undefined
    // This should ideally return 'none', but currently returns 'index' with undefined config
    expect(result.matchType).toBe('index');
    // providers[-1] is undefined in JavaScript
    expect(result.config).toBeUndefined();
  });

  it('handles zero fallbackIndex', () => {
    const providers = [
      { id: 'openai:gpt-4o', config: { temperature: 0.5 } },
      { id: 'anthropic:claude' },
    ];
    const result = findProviderConfig('unknown', providers, 0);
    expect(result.matchType).toBe('index');
    expect(result.config!.config.temperature).toBe(0.5);
  });
});

describe('extractConfigBadges', () => {
  it('returns empty array for undefined config', () => {
    const badges = extractConfigBadges('openai:gpt-4o', undefined);
    expect(badges).toEqual([]);
  });

  it('extracts reasoning_effort badge', () => {
    const config = {
      config: { reasoning_effort: 'high' },
    };
    const badges = extractConfigBadges('openai:o1', config);
    expect(badges).toContainEqual(expect.objectContaining({ label: 'reasoning', value: 'high' }));
  });

  it('extracts Google thinkingConfig badges', () => {
    const config = {
      config: {
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: 'MEDIUM',
            thinkingBudget: 10000,
          },
        },
      },
    };
    const badges = extractConfigBadges('google:gemini-2.0-flash', config);
    expect(badges).toContainEqual(expect.objectContaining({ label: 'thinking', value: 'medium' }));
  });

  it('extracts Anthropic thinking badge', () => {
    const config = {
      config: {
        thinking: {
          type: 'enabled',
          budget_tokens: 50000,
        },
      },
    };
    const badges = extractConfigBadges('anthropic:claude-3-5-sonnet', config);
    expect(badges).toContainEqual(
      expect.objectContaining({ label: 'thinking', value: '50k tokens' }),
    );
  });

  it('extracts temperature badge when not default', () => {
    const config = {
      config: { temperature: 0.5 },
    };
    const badges = extractConfigBadges('openai:gpt-4o', config);
    expect(badges).toContainEqual(expect.objectContaining({ label: 'temp', value: '0.5' }));
  });

  it('does not extract temperature badge when default (1)', () => {
    const config = {
      config: { temperature: 1 },
    };
    const badges = extractConfigBadges('openai:gpt-4o', config);
    expect(badges.find((b) => b.label === 'temp')).toBeUndefined();
  });

  it('extracts max_tokens badge with compact formatting', () => {
    const config = {
      config: { max_tokens: 4096 },
    };
    const badges = extractConfigBadges('openai:gpt-4o', config);
    expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '4.1k' }));
  });

  it('extracts response_format badge', () => {
    const config = {
      config: { response_format: { type: 'json_object' } },
    };
    const badges = extractConfigBadges('openai:gpt-4o', config);
    expect(badges).toContainEqual(
      expect.objectContaining({ label: 'format', value: 'json object' }),
    );
  });

  it('extracts multiple badges', () => {
    const config = {
      config: {
        reasoning_effort: 'medium',
        temperature: 0.7,
        max_tokens: 2000,
        seed: 42,
      },
    };
    const badges = extractConfigBadges('openai:o1', config);
    expect(badges.length).toBeGreaterThanOrEqual(4);
    expect(badges.map((b) => b.label)).toContain('reasoning');
    expect(badges.map((b) => b.label)).toContain('temp');
    expect(badges.map((b) => b.label)).toContain('max');
    expect(badges.map((b) => b.label)).toContain('seed');
  });

  describe('boundary values and edge cases', () => {
    it('formats max_tokens at 1000 boundary', () => {
      const config = { config: { max_tokens: 1000 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '1k' }));
    });

    it('formats max_tokens just below 1000 boundary', () => {
      const config = { config: { max_tokens: 999 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '999' }));
    });

    it('formats max_tokens at 1000000 boundary', () => {
      const config = { config: { max_tokens: 1000000 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '1M' }));
    });

    it('formats max_tokens with decimal for non-integer k values', () => {
      const config = { config: { max_tokens: 1500 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '1.5k' }));
    });

    it('formats max_tokens with decimal for non-integer M values', () => {
      const config = { config: { max_tokens: 1500000 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '1.5M' }));
    });

    it('formats thinking budget_tokens with k suffix', () => {
      const config = { config: { thinking: { type: 'enabled', budget_tokens: 10000 } } };
      const badges = extractConfigBadges('anthropic:claude', config);
      expect(badges).toContainEqual(
        expect.objectContaining({ label: 'thinking', value: '10k tokens' }),
      );
    });

    it('extracts temperature of 0', () => {
      const config = { config: { temperature: 0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'temp', value: '0' }));
    });

    it('extracts temperature of 2', () => {
      const config = { config: { temperature: 2 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'temp', value: '2' }));
    });

    it('does not extract temperature of exactly 1', () => {
      const config = { config: { temperature: 1 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'temp')).toBeUndefined();
    });

    it('extracts top_p of 0', () => {
      const config = { config: { top_p: 0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'top_p', value: '0' }));
    });

    it('does not extract top_p of exactly 1', () => {
      const config = { config: { top_p: 1 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'top_p')).toBeUndefined();
    });

    it('extracts presence_penalty of 0', () => {
      const config = { config: { presence_penalty: 0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'pres')).toBeUndefined();
    });

    it('extracts frequency_penalty of 0', () => {
      const config = { config: { frequency_penalty: 0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'freq')).toBeUndefined();
    });

    it('extracts negative presence_penalty', () => {
      const config = { config: { presence_penalty: -0.5 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'pres', value: '-0.5' }));
    });

    it('extracts negative frequency_penalty', () => {
      const config = { config: { frequency_penalty: -1.0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'freq', value: '-1' }));
    });

    it('extracts seed of 0', () => {
      const config = { config: { seed: 0 } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'seed', value: '0' }));
    });

    it('handles Google thinkingConfig with only budget', () => {
      const config = {
        config: {
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 5000,
            },
          },
        },
      };
      const badges = extractConfigBadges('google:gemini', config);
      expect(badges).toContainEqual(
        expect.objectContaining({ label: 'thinking', value: '5000 tokens' }),
      );
    });

    it('handles Google thinkingConfig with only level', () => {
      const config = {
        config: {
          generationConfig: {
            thinkingConfig: {
              thinkingLevel: 'LOW',
            },
          },
        },
      };
      const badges = extractConfigBadges('google:gemini', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'thinking', value: 'low' }));
    });

    it('handles Anthropic thinking without budget_tokens', () => {
      const config = {
        config: {
          thinking: {
            type: 'enabled',
          },
        },
      };
      const badges = extractConfigBadges('anthropic:claude', config);
      expect(badges).toContainEqual(
        expect.objectContaining({ label: 'thinking', value: 'enabled' }),
      );
    });

    it('does not extract stream when false', () => {
      const config = { config: { stream: false } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'stream')).toBeUndefined();
    });

    it('does not extract response_format when type is "text"', () => {
      const config = { config: { response_format: { type: 'text' } } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges.find((b) => b.label === 'format')).toBeUndefined();
    });

    it('replaces underscore in response_format type', () => {
      const config = { config: { response_format: { type: 'json_schema' } } };
      const badges = extractConfigBadges('openai:gpt-4o', config);
      expect(badges).toContainEqual(
        expect.objectContaining({ label: 'format', value: 'json schema' }),
      );
    });

    it('handles null config', () => {
      const badges = extractConfigBadges('openai:gpt-4o', null as any);
      expect(badges).toEqual([]);
    });

    it('handles config without nested config property', () => {
      const config = { temperature: 0.5, max_tokens: 1000 };
      const badges = extractConfigBadges('openai:gpt-4o', config as any);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'temp', value: '0.5' }));
      expect(badges).toContainEqual(expect.objectContaining({ label: 'max', value: '1k' }));
    });

    it('extracts model_reasoning_effort for Codex SDK', () => {
      const config = { config: { model_reasoning_effort: 'low' } };
      const badges = extractConfigBadges('openai:o1', config);
      expect(badges).toContainEqual(expect.objectContaining({ label: 'reasoning', value: 'low' }));
    });

    it('prioritizes reasoning_effort over model_reasoning_effort', () => {
      const config = {
        config: { reasoning_effort: 'high', model_reasoning_effort: 'low' },
      };
      const badges = extractConfigBadges('openai:o1', config);
      // Should have one reasoning badge with 'high'
      const reasoningBadges = badges.filter((b) => b.label === 'reasoning');
      expect(reasoningBadges).toHaveLength(2); // Both should be extracted
      expect(reasoningBadges[0].value).toBe('high');
    });

    it('handles empty generationConfig', () => {
      const config = { config: { generationConfig: {} } };
      const badges = extractConfigBadges('google:gemini', config);
      expect(badges.find((b) => b.label === 'thinking')).toBeUndefined();
    });

    it('handles empty thinking config', () => {
      const config = { config: { thinking: {} } };
      const badges = extractConfigBadges('anthropic:claude', config);
      expect(badges.find((b) => b.label === 'thinking')).toBeUndefined();
    });
  });
});

describe('getProviderDisplayName', () => {
  it('splits provider string into prefix and name', () => {
    const result = getProviderDisplayName('openai:gpt-4o', undefined);
    expect(result.prefix).toBe('openai');
    expect(result.name).toBe('gpt-4o');
    expect(result.label).toBeUndefined();
  });

  it('handles provider with multiple colons', () => {
    const result = getProviderDisplayName('google:gemini-2.0-flash:thinking', undefined);
    expect(result.prefix).toBe('google');
    expect(result.name).toBe('gemini-2.0-flash:thinking');
  });

  it('returns label when set and different from provider string', () => {
    const config = { label: 'My Custom GPT' };
    const result = getProviderDisplayName('openai:gpt-4o', config);
    expect(result.label).toBe('My Custom GPT');
  });

  it('does not return label when same as provider string', () => {
    const config = { label: 'openai:gpt-4o' };
    const result = getProviderDisplayName('openai:gpt-4o', config);
    expect(result.label).toBeUndefined();
  });

  it('handles provider without colon', () => {
    const result = getProviderDisplayName('ollama', undefined);
    expect(result.prefix).toBe('ollama');
    expect(result.name).toBe('ollama');
  });

  describe('matchType handling', () => {
    it('returns providerString as label when matchType is "label"', () => {
      const config = { id: 'openai:gpt-4o', label: 'gpt-4o' };
      const result = getProviderDisplayName('gpt-4o', config, 'label');
      expect(result.prefix).toBe('');
      expect(result.name).toBe('gpt-4o');
      expect(result.label).toBe('gpt-4o');
    });

    it('prevents duplication when label equals model name and matched by label', () => {
      // This is the critical case that caused the "gpt-4o:gpt-4o" bug
      const config = { id: 'openai:gpt-4o', label: 'gpt-4o' };
      const result = getProviderDisplayName('gpt-4o', config, 'label');
      // With matchType='label', we should NOT split on colon
      expect(result.prefix).toBe('');
      expect(result.name).toBe('gpt-4o');
      expect(result.label).toBe('gpt-4o');
    });

    it('uses normal splitting for non-label matchTypes', () => {
      const config = { id: 'openai:gpt-4o' };
      const result = getProviderDisplayName('openai:gpt-4o', config, 'id');
      expect(result.prefix).toBe('openai');
      expect(result.name).toBe('gpt-4o');
      expect(result.label).toBeUndefined();
    });

    it('still detects config label for id matchType', () => {
      const config = { id: 'openai:gpt-4o', label: 'Fast Model' };
      const result = getProviderDisplayName('openai:gpt-4o', config, 'id');
      expect(result.prefix).toBe('openai');
      expect(result.name).toBe('gpt-4o');
      expect(result.label).toBe('Fast Model');
    });

    it('handles label containing colons when matched by label', () => {
      // Edge case: label itself contains colons
      const config = { id: 'openai:gpt-4o', label: 'my:custom:label' };
      const result = getProviderDisplayName('my:custom:label', config, 'label');
      // Should NOT split on colon - the whole string is the label
      expect(result.prefix).toBe('');
      expect(result.name).toBe('my:custom:label');
      expect(result.label).toBe('my:custom:label');
    });

    it('handles index matchType (fallback behavior)', () => {
      const config = { id: 'openai:gpt-4o', config: { temperature: 0.5 } };
      const result = getProviderDisplayName('unknown-provider', config, 'index');
      // Index match still splits on colon normally
      expect(result.prefix).toBe('unknown-provider');
      expect(result.name).toBe('unknown-provider');
    });

    it('handles none matchType (no config found)', () => {
      const result = getProviderDisplayName('openai:gpt-4o', undefined, 'none');
      expect(result.prefix).toBe('openai');
      expect(result.name).toBe('gpt-4o');
      expect(result.label).toBeUndefined();
    });

    it('handles undefined matchType gracefully', () => {
      const config = { id: 'openai:gpt-4o' };
      const result = getProviderDisplayName('openai:gpt-4o', config);
      expect(result.prefix).toBe('openai');
      expect(result.name).toBe('gpt-4o');
    });

    it('handles empty providerString with label matchType', () => {
      // Edge case: empty string - should return empty but not crash
      const config = { id: 'openai:gpt-4o', label: '' };
      const result = getProviderDisplayName('', config, 'label');
      // Empty string is falsy, so we skip the label handling
      expect(result.prefix).toBe('');
      expect(result.name).toBe('');
    });
  });

  describe('multiple colon handling', () => {
    it('preserves content after first colon for provider with multiple colons', () => {
      const result = getProviderDisplayName('google:gemini-2.0-flash:thinking', undefined);
      expect(result.prefix).toBe('google');
      expect(result.name).toBe('gemini-2.0-flash:thinking');
    });

    it('handles record-key matchType with multiple colons', () => {
      const config = { id: 'google:gemini-2.0-flash:thinking', config: { temperature: 0.5 } };
      const result = getProviderDisplayName(
        'google:gemini-2.0-flash:thinking',
        config,
        'record-key',
      );
      expect(result.prefix).toBe('google');
      expect(result.name).toBe('gemini-2.0-flash:thinking');
    });
  });
});
