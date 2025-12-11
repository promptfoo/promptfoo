import { describe, expect, it } from 'vitest';
import {
  OWASP_AGENTIC_NAMES,
  OWASP_AGENTIC_REDTEAM_MAPPING,
  ALIASED_PLUGINS,
  ALIASED_PLUGIN_MAPPINGS,
} from '../../../src/redteam/constants/frameworks';
import { ALL_PLUGINS } from '../../../src/redteam/constants/plugins';

describe('OWASP Agentic AI Framework (T1-T15)', () => {
  describe('OWASP_AGENTIC_NAMES', () => {
    it('should contain all 15 threat categories', () => {
      expect(OWASP_AGENTIC_NAMES).toHaveLength(15);
    });

    it('should have correct threat names in order (T1-T15)', () => {
      const expectedNames = [
        'T1: Memory Poisoning',
        'T2: Tool Misuse',
        'T3: Privilege Compromise',
        'T4: Resource Overload',
        'T5: Cascading Hallucination Attacks',
        'T6: Intent Breaking & Goal Manipulation',
        'T7: Misaligned & Deceptive Behaviors',
        'T8: Repudiation & Untraceability',
        'T9: Identity Spoofing & Impersonation',
        'T10: Overwhelming Human in the Loop',
        'T11: Unexpected RCE and Code Attacks',
        'T12: Agent Communication Poisoning',
        'T13: Rogue Agents in Multi-Agent Systems',
        'T14: Human Attacks on Multi-Agent Systems',
        'T15: Human Manipulation',
      ];

      expect(OWASP_AGENTIC_NAMES).toEqual(expectedNames);
    });

    it('should have sequential numbering from T1 to T15', () => {
      OWASP_AGENTIC_NAMES.forEach((name, index) => {
        const expectedPrefix = `T${index + 1}:`;
        expect(name.startsWith(expectedPrefix)).toBe(true);
      });
    });
  });

  describe('OWASP_AGENTIC_REDTEAM_MAPPING', () => {
    it('should have mappings for all 15 threats (t01-t15)', () => {
      const expectedKeys = Array.from(
        { length: 15 },
        (_, i) => `owasp:agentic:t${String(i + 1).padStart(2, '0')}`,
      );

      expectedKeys.forEach((key) => {
        expect(OWASP_AGENTIC_REDTEAM_MAPPING).toHaveProperty(key);
      });
    });

    it('should have exactly 15 threat mappings', () => {
      expect(Object.keys(OWASP_AGENTIC_REDTEAM_MAPPING)).toHaveLength(15);
    });

    it('each mapping should have plugins and strategies arrays', () => {
      Object.entries(OWASP_AGENTIC_REDTEAM_MAPPING).forEach(([, mapping]) => {
        expect(Array.isArray(mapping.plugins)).toBe(true);
        expect(Array.isArray(mapping.strategies)).toBe(true);
        expect(mapping.plugins.length).toBeGreaterThan(0);
      });
    });

    it('all mapped plugins should be valid plugin IDs', () => {
      const allPluginIds = new Set<string>(ALL_PLUGINS);

      Object.entries(OWASP_AGENTIC_REDTEAM_MAPPING).forEach(([, mapping]) => {
        mapping.plugins.forEach((pluginId) => {
          expect(allPluginIds.has(pluginId)).toBe(true);
        });
      });
    });

    describe('specific threat mappings', () => {
      it('T1 (Memory Poisoning) should map to agentic:memory-poisoning', () => {
        expect(OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t01'].plugins).toContain(
          'agentic:memory-poisoning',
        );
      });

      it('T2 (Tool Misuse) should map to tool-related plugins', () => {
        const t2Plugins = OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t02'].plugins;
        expect(t2Plugins).toContain('excessive-agency');
        expect(t2Plugins).toContain('mcp');
        expect(t2Plugins).toContain('tool-discovery');
      });

      it('T3 (Privilege Compromise) should map to authorization plugins', () => {
        const t3Plugins = OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t03'].plugins;
        expect(t3Plugins).toContain('rbac');
        expect(t3Plugins).toContain('bfla');
        expect(t3Plugins).toContain('bola');
      });

      it('T4 (Resource Overload) should map to DoS-related plugins', () => {
        const t4Plugins = OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t04'].plugins;
        expect(t4Plugins).toContain('reasoning-dos');
      });

      it('T11 (Unexpected RCE) should map to injection plugins', () => {
        const t11Plugins = OWASP_AGENTIC_REDTEAM_MAPPING['owasp:agentic:t11'].plugins;
        expect(t11Plugins).toContain('shell-injection');
        expect(t11Plugins).toContain('sql-injection');
        expect(t11Plugins).toContain('ssrf');
      });
    });
  });

  describe('ALIASED_PLUGINS integration', () => {
    it('should include owasp:agentic as an aliased plugin', () => {
      expect(ALIASED_PLUGINS).toContain('owasp:agentic');
    });

    it('should include owasp:agentic:redteam as an aliased plugin', () => {
      expect(ALIASED_PLUGINS).toContain('owasp:agentic:redteam');
    });

    it('should include all individual threat keys (owasp:agentic:t01-t15) as aliased plugins', () => {
      const threatKeys = Array.from(
        { length: 15 },
        (_, i) => `owasp:agentic:t${String(i + 1).padStart(2, '0')}`,
      );

      threatKeys.forEach((key) => {
        expect(ALIASED_PLUGINS).toContain(key);
      });
    });
  });

  describe('ALIASED_PLUGIN_MAPPINGS integration', () => {
    it('should map owasp:agentic to OWASP_AGENTIC_REDTEAM_MAPPING', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['owasp:agentic']).toBe(OWASP_AGENTIC_REDTEAM_MAPPING);
    });

    it('should map owasp:agentic:redteam to OWASP_AGENTIC_REDTEAM_MAPPING', () => {
      expect(ALIASED_PLUGIN_MAPPINGS['owasp:agentic:redteam']).toBe(OWASP_AGENTIC_REDTEAM_MAPPING);
    });

    it('owasp:agentic should expand to all 15 threat mappings', () => {
      const mapping = ALIASED_PLUGIN_MAPPINGS['owasp:agentic'];
      expect(Object.keys(mapping)).toHaveLength(15);
    });
  });

  describe('unique plugins count', () => {
    it('should have 25 unique plugins across all threat mappings', () => {
      const allPlugins = new Set<string>();

      Object.values(OWASP_AGENTIC_REDTEAM_MAPPING).forEach((mapping) => {
        mapping.plugins.forEach((plugin) => allPlugins.add(plugin));
      });

      expect(allPlugins.size).toBe(25);
    });

    it('should include the expected unique plugins', () => {
      const allPlugins = new Set<string>();

      Object.values(OWASP_AGENTIC_REDTEAM_MAPPING).forEach((mapping) => {
        mapping.plugins.forEach((plugin) => allPlugins.add(plugin));
      });

      const expectedPlugins = [
        'agentic:memory-poisoning',
        'bfla',
        'bola',
        'contracts',
        'cross-session-leak',
        'debug-access',
        'divergent-repetition',
        'excessive-agency',
        'goal-misalignment',
        'hallucination',
        'harmful:cybercrime:malicious-code',
        'harmful:misinformation-disinformation',
        'hijacking',
        'imitation',
        'indirect-prompt-injection',
        'mcp',
        'overreliance',
        'pii:session',
        'rbac',
        'reasoning-dos',
        'shell-injection',
        'sql-injection',
        'ssrf',
        'system-prompt-override',
        'tool-discovery',
      ];

      expectedPlugins.forEach((plugin) => {
        expect(allPlugins.has(plugin)).toBe(true);
      });
    });
  });
});
