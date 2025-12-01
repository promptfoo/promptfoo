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
    expect(AGENTIC_PLUGINS).toContain('mcp');
    expect(AGENTIC_PLUGINS).toContain('excessive-agency');
    expect(AGENTIC_PLUGINS).toContain('rbac');
    expect(AGENTIC_PLUGINS).toContain('shell-injection');
    expect(AGENTIC_PLUGINS).toContain('sql-injection');
    expect(AGENTIC_PLUGINS).toContain('debug-access');
    expect(AGENTIC_PLUGINS).toContain('indirect-prompt-injection');
    expect(AGENTIC_PLUGINS).toContain('cross-session-leak');
    expect(AGENTIC_PLUGINS).toContain('tool-discovery');
    expect(AGENTIC_PLUGINS).toContain('ascii-smuggling');
    expect(AGENTIC_PLUGINS.length).toBe(10);
  });

  it('DEFAULT_PLUGINS should contain expected plugins', () => {
    expect(DEFAULT_PLUGINS).toContain('contracts');
    expect(DEFAULT_PLUGINS).toContain('excessive-agency');
    expect(DEFAULT_PLUGINS).toContain('hallucination');
    expect(DEFAULT_PLUGINS).toContain('harmful:child-exploitation');
    expect(DEFAULT_PLUGINS).toContain('pii:direct');
  });

  it('ALL_PLUGINS should contain all unique plugins', () => {
    const expectedPlugins = new Set([
      ...BASE_PLUGINS,
      ...Object.keys(HARM_PLUGINS),
      ...PII_PLUGINS,
      ...ADDITIONAL_PLUGINS,
    ]);
    expect(new Set(ALL_PLUGINS)).toEqual(expectedPlugins);
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

    it('should have legal risks', () => {
      expect(riskCategories.Legal).toBeDefined();
      expect(riskCategories.Legal).toContain('harmful:intellectual-property');
      expect(riskCategories.Legal).toContain('contracts');
    });

    it('should have security risks', () => {
      expect(riskCategories.Security).toBeDefined();
      expect(riskCategories.Security).toContain('prompt-extraction');
      expect(riskCategories.Security).toContain('hijacking');
    });

    it('should have harm risks', () => {
      expect(riskCategories.Harm).toBeDefined();
      expect(riskCategories.Harm).toContain('harmful:harassment-bullying');
      expect(riskCategories.Harm).toContain('harmful:hate');
    });

    it('should have accuracy risks', () => {
      expect(riskCategories.Accuracy).toBeDefined();
      expect(riskCategories.Accuracy).toContain('hallucination');
    });

    it('should have PII risks', () => {
      expect(riskCategories.PII).toBeDefined();
      expect(riskCategories.PII).toContain('pii:direct');
      expect(riskCategories.PII).toContain('pii:api-db');
    });

    it('should have fairness risks', () => {
      expect(riskCategories.Fairness).toBeDefined();
      expect(riskCategories.Fairness).toContain('harmful:graphic-content');
      expect(riskCategories.Fairness).toContain('harmful:radicalization');
    });
  });
});
