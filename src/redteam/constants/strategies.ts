// These are exposed on the frontend under the framework compliance section
export const FRAMEWORK_COMPLIANCE_IDS = [
  'mitre:atlas',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
  'eu:ai-act',
] as const;
export type FrameworkComplianceId = (typeof FRAMEWORK_COMPLIANCE_IDS)[number];

// Strategy Groups
export const ENCODING_STRATEGIES = [
  'base64',
  'hex',
  'rot13',
  'homoglyph',
  'leetspeak',
  'camelcase',
  'morse',
  'piglatin',
  'emoji',
] as const;
export type EncodingStrategy = (typeof ENCODING_STRATEGIES)[number];

export const MULTI_MODAL_STRATEGIES = ['audio', 'image', 'video'] as const;
export type MultiModalStrategy = (typeof MULTI_MODAL_STRATEGIES)[number];

export const SINGLE_TURN_AGENTIC_STRATEGIES = [
  'jailbreak',
  'jailbreak:composite',
  'jailbreak:likert',
  'jailbreak:tree',
  'best-of-n',
  'citation',
  'gcg',
  'math-prompt',
  'pandamonium',
] as const;
export type SingleTurnAgenticStrategy = (typeof SINGLE_TURN_AGENTIC_STRATEGIES)[number];

export const MULTI_TURN_AGENTIC_STRATEGIES = ['crescendo', 'goat', 'custom'] as const;
export type MultiTurnAgenticStrategy = (typeof MULTI_TURN_AGENTIC_STRATEGIES)[number];

export const INJECTION_STRATEGIES = ['prompt-injection'] as const;
export type InjectionStrategy = (typeof INJECTION_STRATEGIES)[number];

export const UTILITY_STRATEGIES = ['basic', 'multilingual', 'retry'] as const;
export type UtilityStrategy = (typeof UTILITY_STRATEGIES)[number];

// Legacy groupings for backward compatibility
export const DEFAULT_STRATEGIES = ['basic', 'jailbreak', 'jailbreak:composite'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];

// Renamed from MULTI_TURN_STRATEGIES for clarity
export const MULTI_TURN_STRATEGIES = MULTI_TURN_AGENTIC_STRATEGIES;

// Helper function to check if a strategy is a custom variant
export const isCustomStrategy = (strategyId: string): boolean => {
  return strategyId === 'custom' || strategyId.startsWith('custom:');
};
export type MultiTurnStrategy = (typeof MULTI_TURN_STRATEGIES)[number];

// Combined agentic strategies (both single and multi-turn)
export const AGENTIC_STRATEGIES = [
  ...SINGLE_TURN_AGENTIC_STRATEGIES,
  ...MULTI_TURN_AGENTIC_STRATEGIES,
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

// All individual strategies
export const ADDITIONAL_STRATEGIES = [
  ...ENCODING_STRATEGIES,
  ...MULTI_MODAL_STRATEGIES,
  ...SINGLE_TURN_AGENTIC_STRATEGIES,
  ...MULTI_TURN_AGENTIC_STRATEGIES,
  ...INJECTION_STRATEGIES,
  ...UTILITY_STRATEGIES.filter((s) => s !== 'basic'), // Exclude 'basic' as it's in DEFAULT_STRATEGIES
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

// Strategy group metadata for UI and documentation
export const STRATEGY_GROUP_METADATA = {
  encoding: {
    name: 'Encoding Strategies',
    description: 'Simple text transformations to bypass content filters',
    strategies: ENCODING_STRATEGIES,
  },
  multiModal: {
    name: 'Multi-Modal Strategies',
    description: 'Test handling of non-text content including audio, video, and images',
    strategies: MULTI_MODAL_STRATEGIES,
  },
  singleTurnAgentic: {
    name: 'Single-Turn Agentic Strategies',
    description:
      'AI-powered strategies that dynamically adapt their attack patterns in a single interaction',
    strategies: SINGLE_TURN_AGENTIC_STRATEGIES,
  },
  multiTurnAgentic: {
    name: 'Multi-Turn Agentic Strategies',
    description: 'AI-powered strategies that evolve across multiple conversation turns',
    strategies: MULTI_TURN_AGENTIC_STRATEGIES,
  },
  injection: {
    name: 'Injection Strategies',
    description: 'Direct manipulation techniques to inject malicious content',
    strategies: INJECTION_STRATEGIES,
  },
  utility: {
    name: 'Utility Strategies',
    description: 'Meta-strategies for control and testing enhancement',
    strategies: UTILITY_STRATEGIES,
  },
} as const;
