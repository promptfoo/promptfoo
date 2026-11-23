import cliState from '../../cliState';
import { isApiProvider, isProviderOptions } from '../../types/providers';
import { getAttackProviderFullId } from '../shared/attackProviders';

import type { ApiProvider, AtomicTestCase, UnifiedConfig } from '../../types/index';

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

// Generated tests use public strategy names while providers use their runtime IDs.
function tracingStrategyId(id: string): string {
  const shortId = id.replace(/^promptfoo:redteam:/, '');
  if (shortId === 'iterative-meta') {
    return 'iterative:meta';
  }
  return shortId === 'jailbreak' || shortId.startsWith('jailbreak:')
    ? getAttackProviderFullId(shortId).replace(/^promptfoo:redteam:/, '')
    : shortId;
}

function strategyOverride(config: RawTracingConfig | undefined, ids: Set<string>) {
  const overrides = Object.entries(config?.strategies ?? {})
    .filter(([key]) => ids.has(tracingStrategyId(key)))
    .map(([, value]) => value);
  const merged = mergeTracingConfig(...overrides);
  // Conflicting aliases at the same configuration level must respect an opt-out.
  for (const key of ['enabled', 'includeInAttack', 'includeInGrading'] as const) {
    if (overrides.some((override) => override?.[key] === false)) {
      merged[key] = false;
    }
  }
  return merged;
}

function normalizeTracingOptions(
  config: RawTracingConfig,
  rootTracingConfig?: {
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
  provider: fallbackProvider,
}: {
  strategyId?: string;
  test?: AtomicTestCase;
  config?: Record<string, unknown>;
  provider?: ApiProvider;
}): RedteamTracingOptions {
  // Read redteam-specific tracing config
  const redteamConfig = cliState.config?.redteam as Record<string, unknown> | undefined;
  const globalConfig = (redteamConfig?.tracing as RawTracingConfig | undefined) ?? undefined;
  const testConfig = (test?.metadata?.tracing as RawTracingConfig | undefined) ?? undefined;
  const metadataStrategyConfig = (
    test?.metadata?.strategyConfig as Record<string, unknown> | undefined
  )?.tracing as RawTracingConfig | undefined;
  const provider = test?.provider ?? fallbackProvider;
  const providerId = isApiProvider(provider)
    ? provider.id()
    : isProviderOptions(provider)
      ? provider.id
      : provider;
  const providerStrategy =
    typeof providerId === 'string' && providerId.startsWith('promptfoo:redteam:')
      ? providerId
      : undefined;
  const providerStrategyConfig = (config?.tracing ??
    (providerStrategy && typeof provider === 'object' ? provider.config?.tracing : undefined)) as
    | RawTracingConfig
    | undefined;
  const ids = new Set(
    [strategyId, test?.metadata?.strategyId, providerStrategy]
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map(tracingStrategyId),
  );
  const configs = [globalConfig, testConfig, metadataStrategyConfig, providerStrategyConfig];
  const merged = mergeTracingConfig(
    ...configs,
    ...configs.map((config) => strategyOverride(config, ids)),
  );

  // Read provider and queryDelay from root tracing config (not redteam config)
  const rootTracingConfig = (cliState.requestTracingConfig ?? cliState.config?.tracing) as
    | {
        provider?: TraceProviderConfig;
        queryDelay?: number;
        otlp?: { http?: { redactAttributes?: string[] } };
      }
    | undefined;

  return normalizeTracingOptions(merged, rootTracingConfig);
}
