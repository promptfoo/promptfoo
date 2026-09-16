import cliState from '../../cliState';
import { getAttackProviderFullId } from '../shared/attackProviders';

import type { AtomicTestCase, RedteamFileConfig, UnifiedConfig } from '../../types/index';

type TraceProviderConfig = NonNullable<NonNullable<UnifiedConfig['tracing']>['provider']>;

export interface RedteamTracingOptions {
  enabled: boolean;
  includeInAttack: boolean;
  includeInGrading: boolean;
  includeInternalSpans: boolean;
  maxSpans?: number;
  maxDepth?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  spanFilter?: string[];
  sanitizeAttributes: boolean;
  /** External trace provider configuration (read from root tracing config) */
  provider?: TraceProviderConfig;
  /** Delay in ms before querying external provider (read from root tracing config) */
  queryDelay?: number;
  /** Evaluation-level attributes that must be redacted before span persistence. */
  redactAttributes?: string[];
}

export type RawTracingConfig = Partial<
  Pick<
    RedteamTracingOptions,
    | 'enabled'
    | 'includeInAttack'
    | 'includeInGrading'
    | 'includeInternalSpans'
    | 'maxSpans'
    | 'maxDepth'
    | 'maxRetries'
    | 'retryDelayMs'
    | 'spanFilter'
    | 'sanitizeAttributes'
  >
> & {
  strategies?: Record<string, RawTracingConfig>;
};

const DEFAULT_QUERY_DELAY = 3000;

const DEFAULT_TRACING_OPTIONS: Omit<RedteamTracingOptions, 'provider' | 'queryDelay'> = {
  enabled: false,
  includeInAttack: true,
  includeInGrading: true,
  includeInternalSpans: false,
  maxSpans: 50,
  maxDepth: 5,
  maxRetries: 3,
  retryDelayMs: 500,
  spanFilter: undefined,
  sanitizeAttributes: true,
};

function mergeTracingConfig(...configs: Array<RawTracingConfig | undefined>): RawTracingConfig {
  return configs.reduce<RawTracingConfig>(
    (acc, config) => (config ? { ...acc, ...config } : acc),
    {},
  );
}

function normalizeTracingOptions(
  config: RawTracingConfig,
  rootTracingConfig?: {
    enabled?: boolean;
    provider?: TraceProviderConfig;
    queryDelay?: number;
    otlp?: { http?: { redactAttributes?: string[] } };
  },
): RedteamTracingOptions {
  const merged = { ...DEFAULT_TRACING_OPTIONS, ...config };

  return {
    enabled: Boolean(merged.enabled),
    includeInAttack: merged.includeInAttack ?? DEFAULT_TRACING_OPTIONS.includeInAttack ?? true,
    includeInGrading: merged.includeInGrading ?? DEFAULT_TRACING_OPTIONS.includeInGrading ?? true,
    includeInternalSpans:
      merged.includeInternalSpans ?? DEFAULT_TRACING_OPTIONS.includeInternalSpans ?? false,
    maxSpans: merged.maxSpans ?? DEFAULT_TRACING_OPTIONS.maxSpans,
    maxDepth: merged.maxDepth ?? DEFAULT_TRACING_OPTIONS.maxDepth,
    maxRetries: merged.maxRetries ?? DEFAULT_TRACING_OPTIONS.maxRetries,
    retryDelayMs: merged.retryDelayMs ?? DEFAULT_TRACING_OPTIONS.retryDelayMs,
    spanFilter: merged.spanFilter,
    sanitizeAttributes: merged.sanitizeAttributes ?? DEFAULT_TRACING_OPTIONS.sanitizeAttributes,
    // Read provider and queryDelay from root tracing config
    provider: rootTracingConfig?.provider,
    queryDelay: rootTracingConfig?.queryDelay ?? DEFAULT_QUERY_DELAY,
    redactAttributes: rootTracingConfig?.otlp?.http?.redactAttributes,
  };
}

export function resolveTracingOptions({
  strategyId,
  test,
  config,
  redteamConfig,
}: {
  strategyId: string;
  test?: AtomicTestCase;
  config?: Record<string, unknown>;
  redteamConfig?: RedteamFileConfig;
}): RedteamTracingOptions {
  const strategyAlias: Record<string, string> = {
    iterative: 'jailbreak',
    'iterative:meta': 'jailbreak:meta',
    'iterative-meta': 'jailbreak:meta',
    'jailbreak:meta': 'iterative-meta',
    hydra: 'jailbreak:hydra',
    goblin: 'jailbreak:goblin',
  };
  const providerStrategyId = getAttackProviderFullId(strategyId).replace('promptfoo:redteam:', '');
  const strategyIds = [
    strategyId,
    providerStrategyId,
    providerStrategyId.replace(/^iterative/, 'jailbreak'),
    strategyAlias[strategyId],
  ].filter((id): id is string => Boolean(id));
  // Read redteam-specific tracing config
  const activeRedteamConfig = redteamConfig ?? cliState.config?.redteam;
  const globalConfig = (activeRedteamConfig?.tracing as RawTracingConfig | undefined) ?? undefined;
  const testConfig = (test?.metadata?.tracing as RawTracingConfig | undefined) ?? undefined;
  const metadataStrategyConfig = (
    test?.metadata?.strategyConfig as Record<string, unknown> | undefined
  )?.tracing as RawTracingConfig | undefined;
  const providerStrategyConfig = (config?.tracing as RawTracingConfig | undefined) ?? undefined;

  const findOverride = (tracing?: RawTracingConfig) =>
    strategyIds.map((id) => tracing?.strategies?.[id]).find(Boolean);
  const globalStrategyOverride = findOverride(globalConfig);
  const testStrategyOverride = findOverride(testConfig);
  const metadataStrategyOverride = findOverride(metadataStrategyConfig);
  const providerStrategyOverride = findOverride(providerStrategyConfig);

  const merged = mergeTracingConfig(
    globalConfig,
    testConfig,
    metadataStrategyConfig,
    providerStrategyConfig,
    globalStrategyOverride,
    testStrategyOverride,
    metadataStrategyOverride,
    providerStrategyOverride,
  );

  // Read provider and queryDelay from root tracing config (not redteam config)
  const rootTracingConfig = (cliState.requestTracingConfig ?? cliState.config?.tracing) as
    | {
        enabled?: boolean;
        provider?: TraceProviderConfig;
        queryDelay?: number;
        otlp?: { http?: { redactAttributes?: string[] } };
      }
    | undefined;

  const codingAgentRootTracing =
    String(test?.metadata?.pluginId ?? '').includes('coding-agent') &&
    rootTracingConfig?.enabled === true &&
    merged.enabled === undefined
      ? { enabled: true }
      : {};

  return normalizeTracingOptions({ ...codingAgentRootTracing, ...merged }, rootTracingConfig);
}

export function resolveTestTracingOptions(
  test: AtomicTestCase,
  redteamConfig?: RedteamFileConfig,
): RedteamTracingOptions {
  return resolveTracingOptions({
    strategyId: getAttackProviderFullId(test.metadata?.strategyId ?? '').replace(
      'promptfoo:redteam:',
      '',
    ),
    test,
    redteamConfig,
  });
}
