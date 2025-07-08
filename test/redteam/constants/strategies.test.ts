import {
  ADDITIONAL_STRATEGIES,
  AGENTIC_STRATEGIES,
  ALL_STRATEGIES,
  DATASET_PLUGINS,
  DEFAULT_STRATEGIES,
  FRAMEWORK_COMPLIANCE_IDS,
  MULTI_TURN_STRATEGIES,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  isCustomStrategy,
} from '../../../src/redteam/constants/strategies';

describe('strategies constants', () => {
  it('should have correct framework compliance IDs', () => {
    expect(FRAMEWORK_COMPLIANCE_IDS).toEqual([
      'eu:ai-act',
      'mitre:atlas',
      'nist:ai:measure',
      'owasp:api',
      'owasp:llm',
    ]);
  });

  it('should have correct default strategies', () => {
    expect(DEFAULT_STRATEGIES).toEqual(['basic', 'jailbreak', 'jailbreak:composite']);
  });

  it('should have correct multi-turn strategies', () => {
    expect(MULTI_TURN_STRATEGIES).toEqual(['crescendo', 'custom', 'goat', 'persona']);
  });

  it('should have correct agentic strategies', () => {
    expect(AGENTIC_STRATEGIES).toEqual([
      'crescendo',
      'custom',
      'goat',
      'jailbreak',
      'jailbreak:tree',
      'pandamonium',
      'persona',
    ]);
  });

  it('should have correct dataset plugins', () => {
    expect(DATASET_PLUGINS).toEqual([
      'aegis',
      'beavertails',
      'cyberseceval',
      'donotanswer',
      'harmbench',
      'pliny',
      'toxic-chat',
      'unsafebench',
      'xstest',
    ]);
  });

  it('should have correct additional strategies', () => {
    expect(ADDITIONAL_STRATEGIES).toEqual([
      'audio',
      'base64',
      'best-of-n',
      'camelcase',
      'citation',
      'crescendo',
      'custom',
      'emoji',
      'gcg',
      'goat',
      'hex',
      'homoglyph',
      'image',
      'jailbreak:likert',
      'jailbreak:tree',
      'leetspeak',
      'math-prompt',
      'morse',
      'multilingual',
      'pandamonium',
      'persona',
      'piglatin',
      'prompt-injection',
      'retry',
      'rot13',
      'video',
    ]);
  });

  it('should have correct strategy collections', () => {
    expect(STRATEGY_COLLECTIONS).toEqual(['other-encodings']);
  });

  it('should have correct strategy collection mappings', () => {
    expect(STRATEGY_COLLECTION_MAPPINGS).toEqual({
      'other-encodings': ['camelcase', 'emoji', 'morse', 'piglatin'],
    });
  });

  it('should have all strategies sorted', () => {
    const expectedStrategies = [
      'default',
      'basic',
      'jailbreak',
      'jailbreak:composite',
      ...ADDITIONAL_STRATEGIES,
      ...STRATEGY_COLLECTIONS,
    ].sort();

    expect(ALL_STRATEGIES).toEqual(expectedStrategies);
  });

  it('should correctly identify custom strategies', () => {
    expect(isCustomStrategy('custom')).toBe(true);
    expect(isCustomStrategy('custom:test')).toBe(true);
    expect(isCustomStrategy('other')).toBe(false);
  });
});
