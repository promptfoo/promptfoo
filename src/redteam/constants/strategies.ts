// These are exposed on the frontend under the framework compliance section
export const FRAMEWORK_COMPLIANCE_IDS = [
  'mitre:atlas',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
  'eu:ai-act',
] as const;
export type FrameworkComplianceId = (typeof FRAMEWORK_COMPLIANCE_IDS)[number];

export const DEFAULT_STRATEGIES = ['basic', 'jailbreak', 'jailbreak:composite'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

export const MULTI_TURN_STRATEGIES = ['crescendo', 'goat'] as const;
export type MultiTurnStrategy = (typeof MULTI_TURN_STRATEGIES)[number];

export const AGENTIC_STRATEGIES = [
  'crescendo',
  'goat',
  'jailbreak',
  'jailbreak:tree',
  'pandamonium',
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
