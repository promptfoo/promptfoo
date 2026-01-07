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
  /** External trace provider configuration (Tempo, Jaeger, etc.) */
  provider?: TraceProviderConfig;
  /** Delay in ms before querying external provider (allows spans to arrive). Default: 3000 */
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
    | 'provider'
    | 'queryDelay'
  >
> & {
  strategies?: Record<string, RawTracingConfig>;
};

const DEFAULT_TRACING_OPTIONS: RedteamTracingOptions = {
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
  provider: undefined,
  queryDelay: 3000,
};

function mergeTracingConfig(...configs: Array<RawTracingConfig | undefined>): RawTracingConfig {
  return configs.reduce<RawTracingConfig>(
    (acc, config) => (config ? { ...acc, ...config } : acc),
    {},
  );
}

function normalizeTracingOptions(config: RawTracingConfig): RedteamTracingOptions {
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
    provider: merged.provider,
    queryDelay: merged.queryDelay ?? DEFAULT_TRACING_OPTIONS.queryDelay,
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
  // Read from root-level tracing config
  const globalConfig = (cliState.config?.tracing as RawTracingConfig | undefined) ?? undefined;
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

  return normalizeTracingOptions(merged);
}
