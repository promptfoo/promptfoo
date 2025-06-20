import {
  FRAMEWORK_COMPLIANCE_IDS,
  DEFAULT_STRATEGIES,
  MULTI_TURN_STRATEGIES,
  AGENTIC_STRATEGIES,
  DATASET_PLUGINS,
  ADDITIONAL_STRATEGIES,
  STRATEGY_COLLECTIONS,
  STRATEGY_COLLECTION_MAPPINGS,
  ALL_STRATEGIES,
} from '../../../src/redteam/constants/strategies';

describe('strategies constants', () => {
  it('should have correct framework compliance IDs', () => {
    expect(FRAMEWORK_COMPLIANCE_IDS).toEqual([
      'mitre:atlas',
      'nist:ai:measure',
      'owasp:api',
      'owasp:llm',
      'eu:ai-act',
    ]);
  });

  it('should have correct default strategies', () => {
    expect(DEFAULT_STRATEGIES).toEqual(['basic', 'jailbreak', 'jailbreak:composite']);
  });

  it('should have correct multi-turn strategies', () => {
    expect(MULTI_TURN_STRATEGIES).toEqual(['crescendo', 'goat']);
  });

  it('should have correct agentic strategies', () => {
    expect(AGENTIC_STRATEGIES).toEqual([
      'crescendo',
      'goat',
      'jailbreak',
      'jailbreak:tree',
      'pandamonium',
    ]);
  });

  it('should have correct dataset plugins', () => {
    expect(DATASET_PLUGINS).toEqual([
      'beavertails',
      'cyberseceval',
      'donotanswer',
      'harmbench',
      'toxic-chat',
      'aegis',
      'pliny',
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
      'gcg',
      'goat',
      'hex',
      'homoglyph',
      'image',
      'emoji',
      'jailbreak:likert',
      'jailbreak:tree',
      'leetspeak',
      'math-prompt',
      'morse',
      'multilingual',
      'pandamonium',
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
      'other-encodings': ['camelcase', 'morse', 'piglatin', 'emoji'],
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
});
