import {
  ADDITIONAL_PLUGINS,
  ADDITIONAL_STRATEGIES,
  AGENTIC_EXEMPT_PLUGINS,
  AGENTIC_PLUGINS,
  ALL_PLUGINS,
  ALL_STRATEGIES,
  BASE_PLUGINS,
  COLLECTIONS,
  CONFIG_REQUIRED_PLUGINS,
  categoryAliases,
  categoryDescriptions,
  DATASET_EXEMPT_PLUGINS,
  DATASET_PLUGINS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  displayNameOverrides,
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  PII_PLUGINS,
  pluginDescriptions,
  REDTEAM_MODEL,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  riskCategories,
  riskCategorySeverityMap,
  Severity,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  STRATEGY_EXEMPT_PLUGINS,
  severityDisplayNames,
  strategyDescriptions,
  strategyDisplayNames,
  subCategoryDescriptions,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('DEFAULT_NUM_TESTS_PER_PLUGIN should be defined', () => {
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBeDefined();
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBe(5);
  });

  it('REDTEAM_MODEL should be defined', () => {
    expect(REDTEAM_MODEL).toBeDefined();
    expect(REDTEAM_MODEL).toBe('openai:chat:gpt-4.1-2025-04-14');
  });

  it('LLAMA_GUARD_REPLICATE_PROVIDER should be defined', () => {
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBeDefined();
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBe(
      'replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8',
    );
  });

  it('LLAMA_GUARD_ENABLED_CATEGORIES should contain expected categories', () => {
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toContain('S1');
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toContain('S2');
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).not.toContain('S7');
  });

  it('COLLECTIONS should contain expected values', () => {
    expect(COLLECTIONS).toEqual([
      'default',
      'foundation',
      'harmful',
      'pii',
      'bias',
      'medical',
      'guardrails-eval',
    ]);
  });

  it('UNALIGNED_PROVIDER_HARM_PLUGINS should contain expected plugins', () => {
    expect(UNALIGNED_PROVIDER_HARM_PLUGINS['harmful:child-exploitation']).toBe(
      'Child Exploitation',
    );
    expect(UNALIGNED_PROVIDER_HARM_PLUGINS['harmful:hate']).toBe('Hate');
  });

  it('REDTEAM_PROVIDER_HARM_PLUGINS should contain expected plugins', () => {
    expect(REDTEAM_PROVIDER_HARM_PLUGINS['harmful:intellectual-property']).toBe(
      'Intellectual Property violation',
    );
    expect(REDTEAM_PROVIDER_HARM_PLUGINS['harmful:privacy']).toBe('Privacy violations');
  });

  it('HARM_PLUGINS should combine plugins from other harm plugin objects', () => {
    expect(HARM_PLUGINS).toMatchObject({
      ...UNALIGNED_PROVIDER_HARM_PLUGINS,
      ...REDTEAM_PROVIDER_HARM_PLUGINS,
      'harmful:misinformation-disinformation':
        'Misinformation & Disinformation - Harmful lies and propaganda',
      'harmful:specialized-advice': 'Specialized Advice - Financial',
    });
  });

  it('PII_PLUGINS should contain expected plugins', () => {
    expect(PII_PLUGINS).toEqual(['pii:api-db', 'pii:direct', 'pii:session', 'pii:social']);
  });

  it('BASE_PLUGINS should contain expected plugins', () => {
    expect(BASE_PLUGINS).toContain('contracts');
    expect(BASE_PLUGINS).toContain('excessive-agency');
    expect(BASE_PLUGINS).toContain('hallucination');
  });

  it('ADDITIONAL_PLUGINS should contain MCP plugin', () => {
    expect(ADDITIONAL_PLUGINS).toContain('mcp');
  });

  it('DEFAULT_PLUGINS should be a Set containing base plugins, harm plugins and PII plugins', () => {
    expect(DEFAULT_PLUGINS).toBeInstanceOf(Set);
    expect(DEFAULT_PLUGINS.has('contracts')).toBe(true);
    expect(DEFAULT_PLUGINS.has('pii:api-db')).toBe(true);
  });

  it('ALL_PLUGINS should contain all plugins sorted', () => {
    expect(ALL_PLUGINS).toEqual(
      [
        ...new Set([
          ...DEFAULT_PLUGINS,
          ...ADDITIONAL_PLUGINS,
          ...CONFIG_REQUIRED_PLUGINS,
          ...AGENTIC_PLUGINS,
        ]),
      ].sort(),
    );
  });

  it('DATASET_PLUGINS should contain expected plugins', () => {
    const expectedPlugins = [
      'beavertails',
      'cyberseceval',
      'donotanswer',
      'harmbench',
      'toxic-chat',
      'aegis',
      'pliny',
      'unsafebench',
      'xstest',
    ];

    expect(DATASET_PLUGINS).toEqual(expectedPlugins);
    expect(DATASET_PLUGINS).toHaveLength(9);

    expectedPlugins.forEach((plugin) => {
      expect(DATASET_PLUGINS).toContain(plugin);
    });
  });

  it('AGENTIC_EXEMPT_PLUGINS should contain expected plugins', () => {
    expect(AGENTIC_EXEMPT_PLUGINS).toEqual(['system-prompt-override', 'agentic:memory-poisoning']);
  });

  it('DATASET_EXEMPT_PLUGINS should contain expected plugins', () => {
    expect(DATASET_EXEMPT_PLUGINS).toEqual(['pliny', 'unsafebench']);
  });

  it('STRATEGY_EXEMPT_PLUGINS should combine agentic and dataset exempt plugins', () => {
    const expectedPlugins = [
      'system-prompt-override',
      'agentic:memory-poisoning',
      'pliny',
      'unsafebench',
    ];

    expect(STRATEGY_EXEMPT_PLUGINS).toEqual(expectedPlugins);
    expect(STRATEGY_EXEMPT_PLUGINS).toEqual([...AGENTIC_EXEMPT_PLUGINS, ...DATASET_EXEMPT_PLUGINS]);
  });

  it('Severity enum should have expected values', () => {
    expect(Severity.Critical).toBe('critical');
    expect(Severity.High).toBe('high');
    expect(Severity.Medium).toBe('medium');
    expect(Severity.Low).toBe('low');
  });

  it('severityDisplayNames should have display names for all severities', () => {
    expect(severityDisplayNames[Severity.Critical]).toBe('Critical');
    expect(severityDisplayNames[Severity.High]).toBe('High');
    expect(severityDisplayNames[Severity.Medium]).toBe('Medium');
    expect(severityDisplayNames[Severity.Low]).toBe('Low');
  });

  it('should have agentic:memory-poisoning in Security & Access Control category', () => {
    expect(riskCategories['Security & Access Control']).toBeDefined();
    expect(riskCategories['Security & Access Control']).toContain('agentic:memory-poisoning');
  });

  it('should have descriptions for all risk categories', () => {
    const categories = Object.keys(riskCategories) as (keyof typeof categoryDescriptions)[];
    categories.forEach((category) => {
      expect(categoryDescriptions[category]).toBeDefined();
      expect(typeof categoryDescriptions[category]).toBe('string');
    });
  });

  it('should have correct display name for MCP plugin', () => {
    expect(displayNameOverrides['mcp']).toBe('Model Context Protocol');
  });

  it('should have correct severity for MCP plugin', () => {
    expect(riskCategorySeverityMap['mcp']).toBe(Severity.High);
  });

  it('should have correct alias for MCP plugin', () => {
    expect(categoryAliases['mcp']).toBe('MCP');
  });

  it('should have correct plugin description for MCP plugin', () => {
    expect(pluginDescriptions['mcp']).toBe(
      'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
    );
  });

  it('should have correct subcategory description for MCP plugin', () => {
    expect(subCategoryDescriptions['mcp']).toBe(
      'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
    );
  });

  it('STRATEGY_COLLECTIONS should contain expected collections', () => {
    expect(STRATEGY_COLLECTIONS).toEqual(['other-encodings']);
  });

  it('STRATEGY_COLLECTION_MAPPINGS should have correct mappings', () => {
    expect(STRATEGY_COLLECTION_MAPPINGS['other-encodings']).toEqual([
      'camelcase',
      'morse',
      'piglatin',
      'emoji',
    ]);
  });

  it('ALL_STRATEGIES should include strategy collections', () => {
    expect(ALL_STRATEGIES).toContain('other-encodings');
  });

  it('strategy collections should have proper display names', () => {
    expect(strategyDisplayNames['other-encodings']).toBe('Collection of Text Encodings');
  });

  it('ADDITIONAL_STRATEGIES should include emoji strategy', () => {
    expect(ADDITIONAL_STRATEGIES).toContain('emoji');
  });

  it('should have correct display name for emoji strategy', () => {
    expect(strategyDisplayNames['emoji']).toBe('Emoji Smuggling');
  });

  it('should have correct strategy description for emoji strategy', () => {
    expect(strategyDescriptions['emoji']).toBe(
      'Tests detection and handling of UTF-8 payloads hidden inside emoji variation selectors',
    );
  });

  it('should include emoji in other-encodings strategy collection', () => {
    expect(STRATEGY_COLLECTION_MAPPINGS['other-encodings']).toContain('emoji');
  });

  it('should have correct subcategory description for emoji strategy', () => {
    expect(subCategoryDescriptions['emoji']).toBe(
      'Tests handling of text hidden using emoji variation selectors',
    );
  });
});
