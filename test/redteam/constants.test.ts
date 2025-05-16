import {
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  REDTEAM_MODEL,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  COLLECTIONS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  BASE_PLUGINS,
  ADDITIONAL_PLUGINS,
  CONFIG_REQUIRED_PLUGINS,
  DEFAULT_PLUGINS,
  ALL_PLUGINS,
  DATASET_PLUGINS,
  Severity,
  severityDisplayNames,
  PLUGIN_PRESET_DESCRIPTIONS,
  AGENTIC_PLUGINS,
  riskCategories,
  categoryDescriptions,
  displayNameOverrides,
  riskCategorySeverityMap,
  categoryAliases,
  pluginDescriptions,
  subCategoryDescriptions,
  STRATEGY_EXEMPT_PLUGINS,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('DEFAULT_NUM_TESTS_PER_PLUGIN should be defined', () => {
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBeDefined();
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBe(5);
  });

  it('REDTEAM_MODEL should be defined', () => {
    expect(REDTEAM_MODEL).toBeDefined();
    expect(REDTEAM_MODEL).toBe('openai:chat:gpt-4o');
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
    expect(COLLECTIONS).toEqual(['default', 'foundation', 'harmful', 'pii']);
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

  it('ADDITIONAL_PLUGINS should contain expected plugins', () => {
    expect(ADDITIONAL_PLUGINS).toContain('mcp');
    expect(ADDITIONAL_PLUGINS).toContain('off-topic');
  });

  it('STRATEGY_EXEMPT_PLUGINS should contain expected plugins', () => {
    expect(STRATEGY_EXEMPT_PLUGINS).toContain('off-topic');
    expect(STRATEGY_EXEMPT_PLUGINS).toContain('pliny');
    expect(STRATEGY_EXEMPT_PLUGINS).toContain('system-prompt-override');
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
      'pliny',
      'unsafebench',
      'xstest',
    ];

    expect(DATASET_PLUGINS).toEqual(expectedPlugins);
    expect(DATASET_PLUGINS).toHaveLength(7);

    expectedPlugins.forEach((plugin) => {
      expect(DATASET_PLUGINS).toContain(plugin);
    });
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

  it('PLUGIN_PRESET_DESCRIPTIONS should contain expected descriptions', () => {
    expect(PLUGIN_PRESET_DESCRIPTIONS.RAG).toBe(
      'Recommended plugins plus additional tests for RAG specific scenarios like access control',
    );
    expect(PLUGIN_PRESET_DESCRIPTIONS.Recommended).toBe(
      'A broad set of plugins recommended by Promptfoo',
    );
    expect(PLUGIN_PRESET_DESCRIPTIONS['Minimal Test']).toBe(
      'Minimal set of plugins to validate your setup',
    );
    expect(PLUGIN_PRESET_DESCRIPTIONS['OWASP Agentic AI Top 10']).toBe(
      'OWASP Agentic AI Top 10 Threats and Mitigations',
    );
  });

  it('should have MEMORY_POISONING_PLUGIN_ID in Security & Access Control category', () => {
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

  it('should have correct display name for plugins', () => {
    expect(displayNameOverrides['mcp']).toBe('Model Context Protocol');
    expect(displayNameOverrides['off-topic']).toBe('Lead it off-topic');
  });

  it('should have correct severity for plugins', () => {
    expect(riskCategorySeverityMap['mcp']).toBe(Severity.Low);
    expect(riskCategorySeverityMap['off-topic']).toBe(Severity.Low);
  });

  it('should have correct alias for plugins', () => {
    expect(categoryAliases['mcp']).toBe('MCP');
    expect(categoryAliases['off-topic']).toBe('Off-topic');
  });

  it('should have correct plugin description for plugins', () => {
    expect(pluginDescriptions['mcp']).toBe(
      'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
    );
    expect(pluginDescriptions['off-topic']).toBe('Try to make it go off-topic');
  });

  it('should have correct subcategory description for plugins', () => {
    expect(subCategoryDescriptions['mcp']).toBe(
      'Tests for vulnerabilities to Model Context Protocol (MCP) attacks',
    );
    expect(subCategoryDescriptions['off-topic']).toBe('Off-topic conversation detection');
  });
});
