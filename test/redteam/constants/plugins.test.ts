import {
  ADDITIONAL_PLUGINS,
  AGENTIC_EXEMPT_PLUGINS,
  AGENTIC_PLUGINS,
  ALL_PLUGINS,
  BASE_PLUGINS,
  COLLECTIONS,
  CONFIG_REQUIRED_PLUGINS,
  DATASET_EXEMPT_PLUGINS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  FOUNDATION_PLUGINS,
  GUARDRAILS_EVALUATION_PLUGINS,
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
  PII_PLUGINS,
  REDTEAM_MODEL,
  REDTEAM_PROVIDER_HARM_PLUGINS,
  STRATEGY_EXEMPT_PLUGINS,
  UNALIGNED_PROVIDER_HARM_PLUGINS,
} from '../../../src/redteam/constants/plugins';
import { MEMORY_POISONING_PLUGIN_ID } from '../../../src/redteam/plugins/agentic/constants';

describe('plugins constants', () => {
  it('should define DEFAULT_NUM_TESTS_PER_PLUGIN', () => {
    expect(DEFAULT_NUM_TESTS_PER_PLUGIN).toBe(5);
  });

  it('should define REDTEAM_MODEL', () => {
    expect(REDTEAM_MODEL).toBe('openai:chat:gpt-4.1-2025-04-14');
  });

  it('should define LLAMA_GUARD_REPLICATE_PROVIDER', () => {
    expect(LLAMA_GUARD_REPLICATE_PROVIDER).toBe(
      'replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8',
    );
  });

  it('should define LLAMA_GUARD_ENABLED_CATEGORIES', () => {
    expect(LLAMA_GUARD_ENABLED_CATEGORIES).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S8',
      'S9',
      'S10',
      'S11',
      'S12',
      'S13',
    ]);
  });

  it('should define FOUNDATION_PLUGINS array', () => {
    expect(Array.isArray(FOUNDATION_PLUGINS)).toBe(true);
    expect(FOUNDATION_PLUGINS.length).toBeGreaterThan(0);
  });

  it('should define GUARDRAILS_EVALUATION_PLUGINS array', () => {
    expect(Array.isArray(GUARDRAILS_EVALUATION_PLUGINS)).toBe(true);
    expect(GUARDRAILS_EVALUATION_PLUGINS.length).toBeGreaterThan(0);
  });

  it('should define AGENTIC_PLUGINS with memory poisoning plugin', () => {
    expect(AGENTIC_PLUGINS).toEqual([MEMORY_POISONING_PLUGIN_ID]);
  });

  it('should define COLLECTIONS array', () => {
    expect(COLLECTIONS).toEqual([
      'default',
      'foundation',
      'harmful',
      'pii',
      'bias',
      'guardrails-eval',
    ]);
  });

  it('should define UNALIGNED_PROVIDER_HARM_PLUGINS object', () => {
    expect(typeof UNALIGNED_PROVIDER_HARM_PLUGINS).toBe('object');
    expect(Object.keys(UNALIGNED_PROVIDER_HARM_PLUGINS).length).toBeGreaterThan(0);
  });

  it('should define REDTEAM_PROVIDER_HARM_PLUGINS object', () => {
    expect(REDTEAM_PROVIDER_HARM_PLUGINS).toEqual({
      'harmful:intellectual-property': 'Intellectual Property violation',
      'harmful:privacy': 'Privacy violations',
    });
  });

  it('should define HARM_PLUGINS object', () => {
    expect(typeof HARM_PLUGINS).toBe('object');
    expect(Object.keys(HARM_PLUGINS).length).toBeGreaterThan(0);
  });

  it('should define PII_PLUGINS array', () => {
    expect(PII_PLUGINS).toEqual(['pii:api-db', 'pii:direct', 'pii:session', 'pii:social']);
  });

  it('should define BASE_PLUGINS array', () => {
    expect(BASE_PLUGINS).toEqual([
      'contracts',
      'excessive-agency',
      'hallucination',
      'hijacking',
      'politics',
    ]);
  });

  it('should define ADDITIONAL_PLUGINS array', () => {
    expect(Array.isArray(ADDITIONAL_PLUGINS)).toBe(true);
    expect(ADDITIONAL_PLUGINS.length).toBeGreaterThan(0);
  });

  it('should define CONFIG_REQUIRED_PLUGINS array', () => {
    expect(CONFIG_REQUIRED_PLUGINS).toEqual(['intent', 'policy']);
  });

  it('should define AGENTIC_EXEMPT_PLUGINS array', () => {
    expect(AGENTIC_EXEMPT_PLUGINS).toEqual(['system-prompt-override', MEMORY_POISONING_PLUGIN_ID]);
  });

  it('should define DATASET_EXEMPT_PLUGINS array', () => {
    expect(DATASET_EXEMPT_PLUGINS).toEqual(['pliny', 'unsafebench']);
  });

  it('should define STRATEGY_EXEMPT_PLUGINS array', () => {
    expect(STRATEGY_EXEMPT_PLUGINS).toEqual([...AGENTIC_EXEMPT_PLUGINS, ...DATASET_EXEMPT_PLUGINS]);
  });

  it('should define DEFAULT_PLUGINS set', () => {
    expect(DEFAULT_PLUGINS instanceof Set).toBe(true);
    expect(DEFAULT_PLUGINS.size).toBeGreaterThan(0);
  });

  it('should define ALL_PLUGINS array', () => {
    expect(Array.isArray(ALL_PLUGINS)).toBe(true);
    expect(ALL_PLUGINS.length).toBeGreaterThan(0);
  });

  it('should have ALL_PLUGINS as sorted array', () => {
    const sorted = [...ALL_PLUGINS].sort();
    expect(ALL_PLUGINS).toEqual(sorted);
  });

  it('should have unique values in ALL_PLUGINS', () => {
    const uniquePlugins = new Set(ALL_PLUGINS);
    expect(uniquePlugins.size).toBe(ALL_PLUGINS.length);
  });
});
