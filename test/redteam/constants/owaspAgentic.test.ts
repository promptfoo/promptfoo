import { describe, expect, it } from 'vitest';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  OWASP_AGENTIC_NAMES,
  OWASP_AGENTIC_TOP_10_MAPPING,
} from '../../../src/redteam/constants/frameworks';
import { ALL_PLUGINS } from '../../../src/redteam/constants/plugins';

describe('OWASP Top 10 for Agentic Applications (ASI01-ASI10)', () => {
  describe('OWASP_AGENTIC_NAMES', () => {
    it('should contain all 10 risk categories', () => {
      expect(OWASP_AGENTIC_NAMES).toHaveLength(10);
    });

    it('should have correct risk names in order (ASI01-ASI10)', () => {
      const expectedNames = [
        'ASI01: Agent Goal Hijack',
        'ASI02: Tool Misuse and Exploitation',
        'ASI03: Identity and Privilege Abuse',
        'ASI04: Agentic Supply Chain Vulnerabilities',
        'ASI05: Unexpected Code Execution',
        'ASI06: Memory and Context Poisoning',
        'ASI07: Insecure Inter-Agent Communication',
        'ASI08: Cascading Failures',
        'ASI09: Human Agent Trust Exploitation',
        'ASI10: Rogue Agents',
      ];

      expect(OWASP_AGENTIC_NAMES).toEqual(expectedNames);
    });

    it('should have sequential numbering from ASI01 to ASI10', () => {
      OWASP_AGENTIC_NAMES.forEach((name, index) => {
        const expectedPrefix = `ASI${String(index + 1).padStart(2, '0')}:`;
        expect(name.startsWith(expectedPrefix)).toBe(true);
      });
    });
  });

  describe('OWASP_AGENTIC_TOP_10_MAPPING', () => {
    it('should have mappings for all 10 risks (asi01-asi10)', () => {
      const expectedKeys = Array.from(
        { length: 10 },
        (_, i) => `owasp:agentic:asi${String(i + 1).padStart(2, '0')}`,
      );

      expectedKeys.forEach((key) => {
        expect(OWASP_AGENTIC_TOP_10_MAPPING).toHaveProperty(key);
      });
    });

    it('should have exactly 10 risk mappings', () => {
      expect(Object.keys(OWASP_AGENTIC_TOP_10_MAPPING)).toHaveLength(10);
    });

    it('each mapping should have plugins and strategies arrays', () => {
      Object.entries(OWASP_AGENTIC_TOP_10_MAPPING).forEach(([, mapping]) => {
        expect(Array.isArray(mapping.plugins)).toBe(true);
        expect(Array.isArray(mapping.strategies)).toBe(true);
        expect(mapping.plugins.length).toBeGreaterThan(0);
      });
    });

    it('all mapped plugins should be valid plugin IDs', () => {
      const allPluginIds = new Set<string>(ALL_PLUGINS);

      Object.entries(OWASP_AGENTIC_TOP_10_MAPPING).forEach(([, mapping]) => {
        mapping.plugins.forEach((pluginId) => {
          expect(allPluginIds.has(pluginId)).toBe(true);
        });
      });
    });

    describe('specific risk mappings', () => {
      it('ASI01 (Agent Goal Hijack) should map to hijacking and system-prompt-override', () => {
        const asi01Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi01'].plugins;
        expect(asi01Plugins).toContain('hijacking');
        expect(asi01Plugins).toContain('system-prompt-override');
        expect(asi01Plugins).toContain('indirect-prompt-injection');
      });

      it('ASI02 (Tool Misuse and Exploitation) should map to tool-related plugins', () => {
        const asi02Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi02'].plugins;
        expect(asi02Plugins).toContain('excessive-agency');
        expect(asi02Plugins).toContain('mcp');
        expect(asi02Plugins).toContain('tool-discovery');
      });

      it('ASI03 (Identity and Privilege Abuse) should map to authorization plugins', () => {
        const asi03Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi03'].plugins;
        expect(asi03Plugins).toContain('rbac');
        expect(asi03Plugins).toContain('bfla');
        expect(asi03Plugins).toContain('bola');
      });

      it('ASI05 (Unexpected Code Execution) should map to injection plugins', () => {
        const asi05Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi05'].plugins;
        expect(asi05Plugins).toContain('shell-injection');
        expect(asi05Plugins).toContain('sql-injection');
        expect(asi05Plugins).toContain('ssrf');
      });

      it('ASI06 (Memory and Context Poisoning) should map to memory-related plugins', () => {
        const asi06Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi06'].plugins;
        expect(asi06Plugins).toContain('agentic:memory-poisoning');
        expect(asi06Plugins).toContain('cross-session-leak');
      });

      it('ASI10 (Rogue Agents) should map to agency and access control plugins', () => {
        const asi10Plugins = OWASP_AGENTIC_TOP_10_MAPPING['owasp:agentic:asi10'].plugins;
        expect(asi10Plugins).toContain('excessive-agency');
        expect(asi10Plugins).toContain('hijacking');
        expect(asi10Plugins).toContain('rbac');
      });
    });
  });

  describe('ALIASED_PLUGINS integration', () => {
    it('should include owasp:agentic as an aliased plugin', () => {
      expect(ALIASED_PLUGINS).toContain('owasp:agentic');
    });

    it('should include all individual risk keys (owasp:agentic:asi01-asi10) as aliased plugins', () => {
      const riskKeys = Array.from(
        { length: 10 },
        (_, i) => `owasp:agentic:asi${String(i + 1).padStart(2, '0')}`,
      );

      riskKeys.forEach((key) => {
        expect(ALIASED_PLUGINS).toContain(key);
      });
    });
  });

  describe('ALIASED_PLUGIN_MAPPINGS integration', () => {
    it('should map owasp:agentic to OWASP_AGENTIC_TOP_10_MAPPING', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['owasp:agentic']).toBe(OWASP_AGENTIC_TOP_10_MAPPING);
    });

    it('owasp:agentic should expand to all 10 risk mappings', () => {
      const mapping = ALIASED_PLUGIN_MAPPINGS['owasp:agentic'];
      expect(Object.keys(mapping)).toHaveLength(10);
    });
  });
});
