// These are exposed on the frontend under the framework compliance section
export const FRAMEWORK_COMPLIANCE_IDS = [
  'mitre:atlas',
  'nist:ai:measure',
  'owasp:api',
  'owasp:llm',
  'owasp:agentic',
  'eu:ai-act',
  'iso:42001',
  'gdpr',
] as const;
export type FrameworkComplianceId = (typeof FRAMEWORK_COMPLIANCE_IDS)[number];

export const DEFAULT_STRATEGIES = ['basic', 'jailbreak:meta', 'jailbreak:composite'] as const;
export type DefaultStrategy = (typeof DEFAULT_STRATEGIES)[number];
export const DEFAULT_STRATEGIES_SET: ReadonlySet<string> = new Set(DEFAULT_STRATEGIES);

export const DEFAULT_MULTI_TURN_MAX_TURNS = 5;

export const MULTI_TURN_STRATEGIES = [
  'crescendo',
  'goat',
  'jailbreak:hydra',
  'custom',
  'mischievous-user',
] as const;

export type MultiTurnStrategy = (typeof MULTI_TURN_STRATEGIES)[number];
export const MULTI_TURN_STRATEGY_SET: ReadonlySet<string> = new Set(MULTI_TURN_STRATEGIES);

export const isMultiTurnStrategy = (
  strategyId: string | undefined,
): strategyId is MultiTurnStrategy => {
  return strategyId ? MULTI_TURN_STRATEGY_SET.has(strategyId) : false;
};

// Helper function to check if a strategy is a custom variant
export const isCustomStrategy = (strategyId: string): boolean => {
  return strategyId === 'custom' || strategyId.startsWith('custom:');
};

export const MULTI_MODAL_STRATEGIES = ['audio', 'image', 'video'] as const;
export type MultiModalStrategy = (typeof MULTI_MODAL_STRATEGIES)[number];
export const MULTI_MODAL_STRATEGIES_SET: ReadonlySet<string> = new Set(MULTI_MODAL_STRATEGIES);

export const AGENTIC_STRATEGIES = [
  'crescendo',
  'goat',
  'indirect-web-pwn',
  'mcp-shadow',
  'custom',
  'jailbreak',
  'jailbreak:hydra',
  'jailbreak:meta',
  'jailbreak:tree',
  'mischievous-user',
] as const;
export type AgenticStrategy = (typeof AGENTIC_STRATEGIES)[number];
export const AGENTIC_STRATEGIES_SET: ReadonlySet<string> = new Set(AGENTIC_STRATEGIES);

export const DATASET_PLUGINS = [
  'beavertails',
  'cyberseceval',
  'donotanswer',
  'harmbench',
  'toxic-chat',
  'aegis',
  'pliny',
  'unsafebench',
  'vlguard',
  'xstest',
] as const;
export type DatasetPlugin = (typeof DATASET_PLUGINS)[number];

export const ADDITIONAL_STRATEGIES = [
  'audio',
  'authoritative-markup-injection',
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
  'indirect-web-pwn',
  'jailbreak:hydra',
  'jailbreak',
  'jailbreak:likert',
  'jailbreak:meta',
  'jailbreak:tree',
  'jailbreak-templates',
  'layer',
  'leetspeak',
  'math-prompt',
  'mcp-shadow',
  'mischievous-user',
  'morse',
  'multilingual', // Deprecated: Use top-level language config instead
  'piglatin',
  'prompt-injection', // Deprecated: Use 'jailbreak-templates' instead
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
  ...AGENTIC_STRATEGIES,
] as const;
export const ALL_STRATEGIES = Array.from(new Set(_ALL_STRATEGIES)).sort();
export type Strategy = (typeof ALL_STRATEGIES)[number];

export const CONFIGURABLE_STRATEGIES = [
  'layer',
  'best-of-n',
  'goat',
  'crescendo',
  'indirect-web-pwn',
  'mcp-shadow',
  'jailbreak',
  'jailbreak:hydra',
  'jailbreak:meta',
  'jailbreak:tree',
  'gcg',
  'citation',
  'custom',
  'mischievous-user',
] as const;

export type ConfigurableStrategy = (typeof CONFIGURABLE_STRATEGIES)[number];
export const CONFIGURABLE_STRATEGIES_SET: ReadonlySet<string> = new Set(CONFIGURABLE_STRATEGIES);

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

// Strategies that require remote generation to function
// These strategies will be disabled in the UI when PROMPTFOO_DISABLE_REMOTE_GENERATION is set
export const STRATEGIES_REQUIRING_REMOTE = [
  'audio',
  'citation',
  'gcg',
  'goat',
  'indirect-web-pwn',
  'jailbreak:composite',
  'jailbreak:hydra',
  'jailbreak:likert',
  'jailbreak:meta',
  'mcp-shadow',
] as const;

export type StrategyRequiringRemote = (typeof STRATEGIES_REQUIRING_REMOTE)[number];
export const STRATEGIES_REQUIRING_REMOTE_SET: ReadonlySet<string> = new Set(
  STRATEGIES_REQUIRING_REMOTE,
);
