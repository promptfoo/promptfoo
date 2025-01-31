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
  STRATEGY_EXEMPT_PLUGINS,
  DEFAULT_PLUGINS,
  ALL_PLUGINS,
  FRAMEWORK_NAMES,
  Severity,
  severityDisplayNames,
  categoryDescriptions,
  PLUGIN_PRESET_DESCRIPTIONS,
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
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toContain('S13');
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).not.toContain('S7');
  });

  it('COLLECTIONS should contain expected values', () => {
    expect(COLLECTIONS).toEqual(['default', 'harmful', 'pii']);
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

  it('HARM_PLUGINS should combine plugins from multiple sources', () => {
    expect(HARM_PLUGINS['harmful:misinformation-disinformation']).toBeDefined();
    expect(HARM_PLUGINS['harmful:specialized-advice']).toBeDefined();
    expect(HARM_PLUGINS['harmful:hate']).toBeDefined();
    expect(HARM_PLUGINS['harmful:privacy']).toBeDefined();
  });

  it('PII_PLUGINS should contain expected plugins', () => {
    expect(PII_PLUGINS).toEqual(['pii:api-db', 'pii:direct', 'pii:session', 'pii:social']);
  });

  it('BASE_PLUGINS should contain expected plugins', () => {
    expect(BASE_PLUGINS).toContain('contracts');
    expect(BASE_PLUGINS).toContain('politics');
  });

  it('ADDITIONAL_PLUGINS should contain expected plugins', () => {
    expect(ADDITIONAL_PLUGINS).toContain('ascii-smuggling');
    expect(ADDITIONAL_PLUGINS).toContain('sql-injection');
  });

  it('CONFIG_REQUIRED_PLUGINS should contain expected plugins', () => {
    expect(CONFIG_REQUIRED_PLUGINS).toEqual(['intent', 'policy']);
  });

  it('STRATEGY_EXEMPT_PLUGINS should contain expected plugins', () => {
    expect(STRATEGY_EXEMPT_PLUGINS).toEqual(['pliny', 'system-prompt-override']);
  });

  it('DEFAULT_PLUGINS should contain expected plugins', () => {
    expect(DEFAULT_PLUGINS.has('contracts')).toBeTruthy();
    expect(DEFAULT_PLUGINS.has('pii:api-db')).toBeTruthy();
  });

  it('ALL_PLUGINS should contain all plugins', () => {
    expect(ALL_PLUGINS).toContain('contracts');
    expect(ALL_PLUGINS).toContain('sql-injection');
    expect(ALL_PLUGINS).toContain('intent');
  });

  it('FRAMEWORK_NAMES should contain expected frameworks', () => {
    expect(FRAMEWORK_NAMES['mitre:atlas']).toBe('MITRE ATLAS');
    expect(FRAMEWORK_NAMES['owasp:llm']).toBe('OWASP LLM Top 10');
  });

  it('severityDisplayNames should contain all severity levels', () => {
    expect(severityDisplayNames[Severity.Critical]).toBe('Critical');
    expect(severityDisplayNames[Severity.High]).toBe('High');
    expect(severityDisplayNames[Severity.Medium]).toBe('Medium');
    expect(severityDisplayNames[Severity.Low]).toBe('Low');
  });

  it('categoryDescriptions should contain expected categories', () => {
    expect(categoryDescriptions['Security & Access Control']).toBeDefined();
    expect(categoryDescriptions['Compliance & Legal']).toBeDefined();
  });

  it('PLUGIN_PRESET_DESCRIPTIONS should contain expected presets', () => {
    expect(PLUGIN_PRESET_DESCRIPTIONS.RAG).toBeDefined();
    expect(PLUGIN_PRESET_DESCRIPTIONS.NIST).toBeDefined();
    expect(PLUGIN_PRESET_DESCRIPTIONS['OWASP LLM']).toBeDefined();
  });
});
