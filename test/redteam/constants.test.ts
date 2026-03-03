import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_PLUGINS,
  AGENTIC_PLUGINS,
  ALL_PLUGINS,
  BASE_PLUGINS,
  COLLECTIONS,
  CONFIG_REQUIRED_PLUGINS,
  categoryDescriptions,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  PII_PLUGINS,
  REDTEAM_MODEL,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  riskCategories,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../src/redteam/constants';

describe('constants', () => {
  it('DEFAULT_NUM_TESTS_PER_PLUGIN should be defined', () => {
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBeDefined();
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBe(5);
  });

  it('REDTEAM_MODEL should be defined', () => {
    expect(REDTEAM_MODEL).toBeDefined();
    expect(REDTEAM_MODEL).toBe('openai:chat:gpt-5-2025-08-07');
  });

  it('LLAMA_GUARD_REPLICATE_PROVIDER should be defined', () => {
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBeDefined();
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBe('replicate:moderation:meta/llama-guard-4-12b');
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
      'pharmacy',
      'insurance',
      'financial',
      'ecommerce',
      'telecom',
      'realestate',
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

  it('AGENTIC_PLUGINS should contain expected plugins', () => {
    expect(AGENTIC_PLUGINS).toContain('agentic:memory-poisoning');
    expect(AGENTIC_PLUGINS.length).toBe(1);
  });

  it('DEFAULT_PLUGINS should contain expected plugins', () => {
    expect(DEFAULT_PLUGINS).toContain('contracts');
    expect(DEFAULT_PLUGINS).toContain('excessive-agency');
    expect(DEFAULT_PLUGINS).toContain('hallucination');
    expect(DEFAULT_PLUGINS).toContain('harmful:child-exploitation');
    expect(DEFAULT_PLUGINS).toContain('pii:direct');
  });

  it('ALL_PLUGINS should contain base and additional plugins', () => {
    // ALL_PLUGINS should contain all BASE_PLUGINS
    BASE_PLUGINS.forEach((plugin) => {
      expect(ALL_PLUGINS).toContain(plugin);
    });
    // ALL_PLUGINS should contain all PII_PLUGINS
    PII_PLUGINS.forEach((plugin) => {
      expect(ALL_PLUGINS).toContain(plugin);
    });
    // ALL_PLUGINS should contain all HARM_PLUGINS keys
    Object.keys(HARM_PLUGINS).forEach((plugin) => {
      expect(ALL_PLUGINS).toContain(plugin);
    });
    // ALL_PLUGINS should be an array with no duplicates
    expect(new Set(ALL_PLUGINS).size).toBe(ALL_PLUGINS.length);
  });

  it('CONFIG_REQUIRED_PLUGINS should have valid plugins', () => {
    expect(CONFIG_REQUIRED_PLUGINS).toContain('policy');
    expect(CONFIG_REQUIRED_PLUGINS).toContain('intent');
    expect(Array.isArray(CONFIG_REQUIRED_PLUGINS)).toBe(true);
  });

  describe('categoryDescriptions', () => {
    it('should have descriptions for all categories', () => {
      const expectedKeys = [
        'Security & Access Control',
        'Compliance & Legal',
        'Trust & Safety',
        'Brand',
        'Datasets',
        'Domain-Specific Risks',
      ];
      expectedKeys.forEach((key) => {
        expect(categoryDescriptions).toHaveProperty(key);
        expect(categoryDescriptions[key as keyof typeof categoryDescriptions]).toBeTruthy();
      });
    });
  });

  describe('riskCategories', () => {
    it('should have brand risks', () => {
      expect(riskCategories.Brand).toBeDefined();
      expect(riskCategories.Brand).toContain('competitors');
      expect(riskCategories.Brand).toContain('politics');
    });

    it('should have compliance & legal risks', () => {
      expect(riskCategories['Compliance & Legal']).toBeDefined();
      expect(riskCategories['Compliance & Legal']).toContain('harmful:intellectual-property');
      expect(riskCategories['Compliance & Legal']).toContain('contracts');
    });

    it('should have security & access control risks', () => {
      expect(riskCategories['Security & Access Control']).toBeDefined();
      expect(riskCategories['Security & Access Control']).toContain('hijacking');
    });

    it('should have trust & safety risks', () => {
      expect(riskCategories['Trust & Safety']).toBeDefined();
      expect(riskCategories['Trust & Safety']).toContain('harmful:harassment-bullying');
      expect(riskCategories['Trust & Safety']).toContain('harmful:hate');
    });

    it('should have domain-specific risks', () => {
      expect(riskCategories['Domain-Specific Risks']).toBeDefined();
    });

    it('should have datasets', () => {
      expect(riskCategories['Datasets']).toBeDefined();
    });
  });
});
