import {
  FRAMEWORK_NAMES,
  OWASP_LLM_TOP_10_NAMES,
  OWASP_API_TOP_10_NAMES,
  OWASP_AGENTIC_NAMES,
  OWASP_LLM_TOP_10_MAPPING,
  OWASP_API_TOP_10_MAPPING,
  OWASP_AGENTIC_REDTEAM_MAPPING,
  OWASP_LLM_RED_TEAM_MAPPING,
  NIST_AI_RMF_MAPPING,
  MITRE_ATLAS_MAPPING,
  EU_AI_ACT_MAPPING,
  ALIASED_PLUGINS,
  ALIASED_PLUGIN_MAPPINGS,
} from '../../../src/redteam/constants/frameworks';
import { MEMORY_POISONING_PLUGIN_ID } from '../../../src/redteam/plugins/agentic/constants';

describe('Framework Constants', () => {
  describe('FRAMEWORK_NAMES', () => {
    it('should contain correct framework names', () => {
      expect(FRAMEWORK_NAMES['mitre:atlas']).toBe('MITRE ATLAS');
      expect(FRAMEWORK_NAMES['nist:ai:measure']).toBe('NIST AI RMF');
      expect(FRAMEWORK_NAMES['owasp:api']).toBe('OWASP API Top 10');
      expect(FRAMEWORK_NAMES['owasp:llm']).toBe('OWASP LLM Top 10');
      expect(FRAMEWORK_NAMES['owasp:agentic']).toBe('OWASP Agentic v1.0');
      expect(FRAMEWORK_NAMES['eu:ai-act']).toBe('EU AI Act');
    });
  });

  describe('OWASP_LLM_TOP_10_NAMES', () => {
    it('should contain 10 items', () => {
      expect(OWASP_LLM_TOP_10_NAMES).toHaveLength(10);
    });

    it('should contain expected names', () => {
      expect(OWASP_LLM_TOP_10_NAMES).toContain('Prompt Injection');
      expect(OWASP_LLM_TOP_10_NAMES).toContain('Sensitive Information Disclosure');
      expect(OWASP_LLM_TOP_10_NAMES).toContain('Unbounded Consumption');
    });
  });

  describe('OWASP_API_TOP_10_NAMES', () => {
    it('should contain 10 items', () => {
      expect(OWASP_API_TOP_10_NAMES).toHaveLength(10);
    });

    it('should contain expected names', () => {
      expect(OWASP_API_TOP_10_NAMES).toContain('Broken Object Level Authorization');
      expect(OWASP_API_TOP_10_NAMES).toContain('Broken Authentication');
      expect(OWASP_API_TOP_10_NAMES).toContain('Unsafe Consumption of APIs');
    });
  });

  describe('OWASP_AGENTIC_NAMES', () => {
    it('should contain expected names', () => {
      expect(OWASP_AGENTIC_NAMES).toContain('T1: Memory Poisoning');
    });
  });

  describe('OWASP_LLM_TOP_10_MAPPING', () => {
    it('should have correct mapping structure', () => {
      expect(OWASP_LLM_TOP_10_MAPPING['owasp:llm:01']).toBeDefined();
      expect(OWASP_LLM_TOP_10_MAPPING['owasp:llm:01'].plugins).toBeDefined();
      expect(OWASP_LLM_TOP_10_MAPPING['owasp:llm:01'].strategies).toBeDefined();
    });

    it('should contain expected plugins and strategies', () => {
      const mapping = OWASP_LLM_TOP_10_MAPPING['owasp:llm:01'];
      expect(mapping.plugins).toContain('ascii-smuggling');
      expect(mapping.strategies).toContain('jailbreak');
    });
  });

  describe('OWASP_AGENTIC_REDTEAM_MAPPING', () => {
    it('should have correct mapping for memory poisoning', () => {
      expect(OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t01'].plugins).toContain(
        MEMORY_POISONING_PLUGIN_ID,
      );
      expect(OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t01'].strategies).toHaveLength(0);
    });
  });

  describe('OWASP_LLM_RED_TEAM_MAPPING', () => {
    it('should contain all phases', () => {
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:model']).toBeDefined();
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:implementation']).toBeDefined();
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:system']).toBeDefined();
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:runtime']).toBeDefined();
    });

    it('should have correct strategies for each phase', () => {
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:model'].strategies).toContain(
        'jailbreak',
      );
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:implementation'].strategies).toContain(
        'prompt-injection',
      );
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:system'].strategies).toContain(
        'multilingual',
      );
      expect(OWASP_LLM_RED_TEAM_MAPPING['owasp:llm:redteam:runtime'].strategies).toContain(
        'crescendo',
      );
    });
  });

  describe('ALIASED_PLUGINS', () => {
    it('should contain expected plugin aliases', () => {
      expect(ALIASED_PLUGINS).toContain('mitre:atlas');
      expect(ALIASED_PLUGINS).toContain('nist:ai:measure');
      expect(ALIASED_PLUGINS).toContain('owasp:api');
      expect(ALIASED_PLUGINS).toContain('owasp:llm');
    });
  });

  describe('ALIASED_PLUGIN_MAPPINGS', () => {
    it('should have correct mappings', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['mitre:atlas']).toBe(MITRE_ATLAS_MAPPING);
      expect(ALIASED_PLUGIN_MAPPINGS['nist:ai:measure']).toBe(NIST_AI_RMF_MAPPING);
      expect(ALIASED_PLUGIN_MAPPINGS['owasp:api']).toBe(OWASP_API_TOP_10_MAPPING);
      expect(ALIASED_PLUGIN_MAPPINGS['owasp:llm']).toBe(OWASP_LLM_TOP_10_MAPPING);
      expect(ALIASED_PLUGIN_MAPPINGS['eu:ai-act']).toBe(EU_AI_ACT_MAPPING);
    });

    it('should have correct structure for special mappings', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['toxicity'].toxicity.plugins).toBeDefined();
      expect(ALIASED_PLUGIN_MAPPINGS['bias'].bias.plugins).toBeDefined();
      expect(ALIASED_PLUGIN_MAPPINGS['misinformation'].misinformation.plugins).toBeDefined();
      expect(ALIASED_PLUGIN_MAPPINGS['illegal-activity']['illegal-activity'].plugins).toBeDefined();
    });
  });
});
