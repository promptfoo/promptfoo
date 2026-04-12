import { describe, expect, it } from 'vitest';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  MITRE_ATLAS_LEGACY_MAPPING,
  MITRE_ATLAS_MAPPING,
} from '../../../src/redteam/constants/frameworks';
import { ALL_PLUGINS, COLLECTIONS } from '../../../src/redteam/constants/plugins';
import { ALL_STRATEGIES } from '../../../src/redteam/constants/strategies';

describe('MITRE ATLAS framework mapping', () => {
  const currentAtlasTacticAliases = [
    'mitre:atlas:reconnaissance',
    'mitre:atlas:resource-development',
    'mitre:atlas:initial-access',
    'mitre:atlas:ai-model-access',
    'mitre:atlas:execution',
    'mitre:atlas:persistence',
    'mitre:atlas:privilege-escalation',
    'mitre:atlas:defense-evasion',
    'mitre:atlas:credential-access',
    'mitre:atlas:discovery',
    'mitre:atlas:lateral-movement',
    'mitre:atlas:collection',
    'mitre:atlas:ai-attack-staging',
    'mitre:atlas:command-and-control',
    'mitre:atlas:exfiltration',
    'mitre:atlas:impact',
  ];

  it('maps the current ATLAS tactic aliases', () => {
    expect(Object.keys(MITRE_ATLAS_MAPPING).sort()).toEqual([...currentAtlasTacticAliases].sort());
  });

  it('keeps the legacy ML Attack Staging alias outside the full preset', () => {
    expect(MITRE_ATLAS_MAPPING).not.toHaveProperty('mitre:atlas:ml-attack-staging');
    expect(MITRE_ATLAS_LEGACY_MAPPING['mitre:atlas:ml-attack-staging']).toBe(
      MITRE_ATLAS_MAPPING['mitre:atlas:ai-attack-staging'],
    );
  });

  it('makes empty tactic coverage explicit', () => {
    const emptyTacticAliases = Object.entries(MITRE_ATLAS_MAPPING)
      .filter(([, { plugins, strategies }]) => plugins.length === 0 && strategies.length === 0)
      .map(([alias]) => alias);

    expect(emptyTacticAliases).toEqual(['mitre:atlas:ai-model-access']);
  });

  it('registers MITRE aliases for validator expansion', () => {
    expect(ALIASED_PLUGINS).toContain('mitre:atlas');
    expect(ALIASED_PLUGINS).toContain('mitre:atlas:ml-attack-staging');
    currentAtlasTacticAliases.forEach((key) => {
      expect(ALIASED_PLUGINS).toContain(key);
    });

    expect(ALIASED_PLUGIN_MAPPINGS['mitre:atlas']).toBe(MITRE_ATLAS_MAPPING);
    expect(ALIASED_PLUGIN_MAPPINGS['mitre:atlas:ml-attack-staging']).toBe(
      MITRE_ATLAS_LEGACY_MAPPING,
    );
  });

  it('uses valid plugin and strategy identifiers', () => {
    const validPlugins = new Set<string>([...ALL_PLUGINS, ...COLLECTIONS]);
    const validStrategies = new Set<string>(ALL_STRATEGIES);

    [...Object.values(MITRE_ATLAS_MAPPING), ...Object.values(MITRE_ATLAS_LEGACY_MAPPING)].forEach(
      ({ plugins, strategies }) => {
        plugins.forEach((plugin) => expect(validPlugins.has(plugin)).toBe(true));
        strategies.forEach((strategy) => expect(validStrategies.has(strategy)).toBe(true));
      },
    );
  });

  it('covers newly-added agentic ATLAS tactics with existing promptfoo checks', () => {
    expect(MITRE_ATLAS_MAPPING['mitre:atlas:persistence'].plugins).toContain(
      'agentic:memory-poisoning',
    );
    expect(MITRE_ATLAS_MAPPING['mitre:atlas:credential-access'].plugins).toContain(
      'tool-discovery',
    );
    expect(MITRE_ATLAS_MAPPING['mitre:atlas:command-and-control'].plugins).toContain('mcp');
    expect(MITRE_ATLAS_MAPPING['mitre:atlas:impact'].plugins).toContain('reasoning-dos');
  });
});
