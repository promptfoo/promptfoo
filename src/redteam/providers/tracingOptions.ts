import cliState from '../../cliState';

import type { TraceProviderConfig } from '../../tracing/providers/types';
import type { AtomicTestCase } from '../../types/index';

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
  rootTracingConfig?: { provider?: TraceProviderConfig; queryDelay?: number },
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
  };
}

export function resolveTracingOptions({
  strategyId,
  test,
  config,
}: {
  strategyId: string;
  test?: AtomicTestCase;
  config?: Record<string, unknown>;
}): RedteamTracingOptions {
  // Read redteam-specific tracing config
  const redteamConfig = cliState.config?.redteam as Record<string, unknown> | undefined;
  const globalConfig = (redteamConfig?.tracing as RawTracingConfig | undefined) ?? undefined;
  const testConfig = (test?.metadata?.tracing as RawTracingConfig | undefined) ?? undefined;
  const metadataStrategyConfig = (
    test?.metadata?.strategyConfig as Record<string, unknown> | undefined
  )?.tracing as RawTracingConfig | undefined;
  const providerStrategyConfig = (config?.tracing as RawTracingConfig | undefined) ?? undefined;

  const globalStrategyOverride =
    strategyId && globalConfig?.strategies ? globalConfig.strategies[strategyId] : undefined;
  const testStrategyOverride =
    strategyId && testConfig?.strategies ? testConfig.strategies[strategyId] : undefined;
  const metadataStrategyOverride =
    strategyId && metadataStrategyConfig?.strategies
      ? metadataStrategyConfig.strategies[strategyId]
      : undefined;
  const providerStrategyOverride =
    strategyId && providerStrategyConfig?.strategies
      ? providerStrategyConfig.strategies[strategyId]
      : undefined;

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
  const rootTracingConfig = cliState.config?.tracing as
    | { provider?: TraceProviderConfig; queryDelay?: number }
    | undefined;

  return normalizeTracingOptions(merged, rootTracingConfig);
}
