// These are exposed on the frontend under the framework compliance section
export const FRAMEWORK_COMPLIANCE_IDS = [
  'mitre:atlas',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
  'eu:ai-act',
  'iso:42001',
] as const;
export type FrameworkComplianceId = (typeof FRAMEWORK_COMPLIANCE_IDS)[number];

export const DEFAULT_STRATEGIES = ['basic', 'jailbreak', 'jailbreak:composite'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

export const MULTI_TURN_STRATEGIES = ['crescendo', 'goat', 'custom', 'mischievous-user'] as const;

// Helper function to check if a strategy is a custom variant
export const isCustomStrategy = (strategyId: string): boolean => {
  return strategyId === 'custom' || strategyId.startsWith('custom:');
};
export type MultiTurnStrategy = (typeof MULTI_TURN_STRATEGIES)[number];

export const MULTI_MODAL_STRATEGIES = ['audio', 'image', 'video'] as const;
export type MultiModalStrategy = (typeof MULTI_MODAL_STRATEGIES)[number];

export const AGENTIC_STRATEGIES = [
  'crescendo',
  'goat',
  'custom',
  'jailbreak',
  'jailbreak:tree',
  'mischievous-user',
] as const;
export type AgenticStrategy = (typeof AGENTIC_STRATEGIES)[number];

export const DATASET_PLUGINS = [
  'beavertails',
  'cyberseceval',
  'donotanswer',
  'harmbench',
  'toxic-chat',
  'aegis',
  'pliny',
  'unsafebench',
  'xstest',
] as const;
export type DatasetPlugin = (typeof DATASET_PLUGINS)[number];

export const ADDITIONAL_STRATEGIES = [
  'layer',
  'audio',
  'base64',
  'best-of-n',
  'camelcase',
  'citation',
  'crescendo',
  'custom',
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
  'mischievous-user',
  'morse',
  'multilingual',
  'piglatin',
  'prompt-injection',
  'retry',
  'rot13',
  'video',
] as const;
export type AdditionalStrategy = (typeof ADDITIONAL_STRATEGIES)[number];

export const STRATEGY_COLLECTIONS = ['other-encodings'] as const;
export type StrategyCollection = (typeof STRATEGY_COLLECTIONS)[number];

export const STRATEGY_COLLECTION_MAPPINGS: Record<StrategyCollection, string[]> = {
  'other-encodings': ['camelcase', 'morse', 'piglatin', 'emoji'],
};

const _ALL_STRATEGIES = [
  'default',
  ...DEFAULT_STRATEGIES,
  ...ADDITIONAL_STRATEGIES,
  ...STRATEGY_COLLECTIONS,
] as const;
export const ALL_STRATEGIES = Array.from(new Set(_ALL_STRATEGIES)).sort();
export type Strategy = (typeof ALL_STRATEGIES)[number];

export const CONFIGURABLE_STRATEGIES = [
  'layer',
  'multilingual',
  'best-of-n',
  'goat',
  'crescendo',
  'jailbreak',
  'jailbreak:tree',
  'gcg',
  'citation',
  'custom',
  'mischievous-user',
] as const;

export type ConfigurableStrategy = (typeof CONFIGURABLE_STRATEGIES)[number];

/**
 * Set of strategy IDs that represent encoding transformations where originalText should be shown
 */
export const ENCODING_STRATEGIES = new Set([
  'base64',
  'hex',
  'rot13',
  'leetspeak',
  'homoglyph',
  'morse',
  'atbash',
  'piglatin',
  'camelcase',
  'emoji',
  'reverse',
  'binary',
  'octal',
  'audio',
  'image',
  'video',
]);

/**
 * Determines if a strategy represents an encoding where we should show the original text
 */
export function isEncodingStrategy(strategyId: string | undefined): boolean {
  return strategyId ? ENCODING_STRATEGIES.has(strategyId) : false;
}

/**
 * Default 'n' fan out for strategies that can add additional test cases during generation
 */
const DEFAULT_N_FAN_OUT_BY_STRATEGY = {
  'jailbreak:composite': 5,
  gcg: 1,
} as const;

for (const strategyId in DEFAULT_N_FAN_OUT_BY_STRATEGY) {
  if (!ALL_STRATEGIES.includes(strategyId as Strategy)) {
    throw new Error(`Default fan out strategy ${strategyId} is not in ALL_STRATEGIES`);
  }
}

type FanOutStrategy = keyof typeof DEFAULT_N_FAN_OUT_BY_STRATEGY;

export function getDefaultNFanout(strategyId: FanOutStrategy): number {
  return DEFAULT_N_FAN_OUT_BY_STRATEGY[strategyId] ?? 1;
}

export function isFanoutStrategy(strategyId: string): strategyId is FanOutStrategy {
  return strategyId in DEFAULT_N_FAN_OUT_BY_STRATEGY;
}
