import type { CodexSecurityResult } from '../../contracts/codexSecurity';

type ArtifactKind = CodexSecurityResult['artifacts'][number]['kind'];

export interface CodexSecurityResultContext {
  source: { kind: 'sdk' | 'saved-report'; file?: string; sha256?: string };
  operation?: unknown;
  status?: unknown;
  error?: unknown;
  sdkVersion?: unknown;
  pluginVersion?: unknown;
  observedCost?: unknown;
  warnings?: unknown;
  artifactPaths?: Partial<Record<ArtifactKind, unknown>>;
}

const ARTIFACT_KINDS: ArtifactKind[] = [
  'scanDir',
  'outputDir',
  'reportPath',
  'manifestPath',
  'findingsPath',
  'coveragePath',
  'sarifPath',
  'artifactsDir',
];

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function count(value: unknown): number | null {
  const result = amount(value);
  return result !== null && Number.isSafeInteger(result) ? result : null;
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((item): item is string => text(item) !== null) : null;
}

function operation(value: unknown): CodexSecurityResult['operation'] {
  switch (value) {
    case 'security-scan':
    case 'deep-security-scan':
    case 'security-diff-scan':
    case 'validation':
      return value;
    default:
      return null;
  }
}

function status(value: unknown): CodexSecurityResult['status'] {
  switch (value) {
    case 'completed':
    case 'failed':
    case 'canceled':
    case 'interrupted':
      return value;
    case 'error':
      return 'failed';
    default:
      return 'unknown';
  }
}

function findings(value: unknown): CodexSecurityResult['findings'] {
  if (!Array.isArray(value)) {
    return null;
  }
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, unknown: 0 };
  for (const finding of value) {
    const severity = record(record(finding).severity).level;
    switch (severity) {
      case 'critical':
      case 'high':
      case 'medium':
      case 'low':
      case 'informational':
        bySeverity[severity]++;
        break;
      default:
        bySeverity.unknown++;
    }
  }
  return { total: value.length, bySeverity };
}

function validation(value: unknown): CodexSecurityResult['validation'] {
  switch (value) {
    case 'reportable':
    case 'suppressed':
    case 'not_applicable':
    case 'deferred':
      return { disposition: value };
    default:
      return null;
  }
}

function cost(value: unknown): CodexSecurityResult['cost'] {
  const input = record(value);
  const baselineUsd = amount(input.estimatedUsd);
  const bounds = record(input.estimatedUsdRange);
  const minUsd = amount(bounds.min);
  const maximum = amount(bounds.max);
  const range =
    minUsd === null
      ? null
      : { minUsd, maxUsd: maximum !== null && maximum >= minUsd ? maximum : null };
  const rawPricing = record(input.pricing);
  const pricing = {
    source: text(rawPricing.source),
    asOf: text(rawPricing.asOf),
    serviceTier: text(rawPricing.serviceTier),
    context: text(rawPricing.context),
  };
  const reportedPricing = Object.values(pricing).some((value) => value !== null) ? pricing : null;
  return baselineUsd === null && range === null && reportedPricing === null
    ? null
    : { baselineUsd, range, pricing: reportedPricing };
}

function usage(raw: Record<string, unknown>, observedCost: unknown): CodexSecurityResult['usage'] {
  const rawUsage = record(record(raw.turn).usage);
  const rawCost = { ...record(observedCost), ...record(raw.cost) };
  const input = count(rawCost.inputTokens) ?? count(rawUsage.input_tokens);
  const output = count(rawCost.outputTokens) ?? count(rawUsage.output_tokens);
  const reported =
    rawCost.cacheWriteInputTokensReported ?? rawUsage.cache_write_input_tokens_reported;
  const result = {
    input,
    output,
    cachedInput: count(rawCost.cachedInputTokens) ?? count(rawUsage.cached_input_tokens),
    cacheWriteInput:
      reported === false
        ? null
        : (count(rawCost.cacheWriteInputTokens) ?? count(rawUsage.cache_write_input_tokens)),
    total: input !== null && output !== null ? count(input + output) : count(rawUsage.total_tokens),
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}

function target(value: unknown): CodexSecurityResult['target'] {
  const input = record(value);
  const result = {
    kind: text(input.kind),
    id: text(input.targetId),
    displayName: text(input.displayName),
    revision: text(input.revision),
    baseRevision: text(input.baseRevision),
    headRevision: text(input.headRevision),
    snapshotDigest: text(input.snapshotDigest),
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}

function scope(value: unknown): CodexSecurityResult['scope'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const input = record(value);
  return {
    includePaths: strings(input.includePaths),
    excludePaths: strings(input.excludePaths),
    summary: text(input.summary),
    limitations: strings(input.limitations) ?? [],
  };
}

function elapsedMs(scan: Record<string, unknown>): number | null {
  const startedAt = text(scan.startedAt);
  const completedAt = text(scan.completedAt);
  // Require timezone-qualified timestamps to avoid depending on the importing host's timezone.
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    !startedAt ||
    !completedAt ||
    !timestampPattern.test(startedAt) ||
    !timestampPattern.test(completedAt)
  ) {
    return null;
  }
  return amount(Date.parse(completedAt) - Date.parse(startedAt));
}

/** Normalize serialized SDK evidence without reading files, loading the SDK, or estimating usage. */
export function normalizeCodexSecurityResult(
  value: unknown,
  context: CodexSecurityResultContext,
): CodexSecurityResult {
  const raw = record(value);
  const scan = record(record(raw.manifest).scan);
  const turn = record(raw.turn);
  const coverage = record(raw.coverage);
  const error = text(context.error) ?? text(raw.error);
  const file = text(context.source.file);
  const digest = text(context.source.sha256);
  const rawCost = record(raw.cost);
  const observedCost = record(context.observedCost);
  const artifacts = ARTIFACT_KINDS.flatMap((kind) => {
    const path = text(context.artifactPaths?.[kind]) ?? text(raw[kind]);
    return path === null ? [] : [{ kind, path }];
  });

  return {
    version: 1,
    source: {
      kind: context.source.kind,
      ...(file ? { file } : {}),
      ...(digest && /^[a-f0-9]{64}$/i.test(digest) ? { sha256: digest.toLowerCase() } : {}),
      mocked:
        turn.mock === true ||
        raw.mock === true ||
        raw.synthetic === true ||
        record(scan.extensions).mock === true ||
        record(scan.scope).runtimeStatus === 'mock',
    },
    operation: operation(context.operation) ?? operation(raw.operation),
    status: error ? 'failed' : status(context.status ?? scan.status ?? turn.status),
    error,
    scanId: text(scan.id),
    model: text(turn.model) ?? text(rawCost.model) ?? text(observedCost.model),
    versions: {
      sdk: text(context.sdkVersion) ?? text(raw.sdkVersion),
      plugin: text(context.pluginVersion) ?? text(record(scan.producer).version),
    },
    coverage: {
      completeness:
        coverage.completeness === 'complete' || coverage.completeness === 'partial'
          ? coverage.completeness
          : 'unknown',
      mode: text(coverage.mode),
    },
    findings: findings(record(raw.findings).findings),
    validation: validation(raw.disposition),
    cost: cost(raw.cost) ?? cost(context.observedCost),
    elapsedMs: elapsedMs(scan),
    usage: usage(raw, context.observedCost),
    target: target(scan.target),
    scope: scope(scan.scope),
    warnings: [
      ...new Set([...(strings(raw.warnings) ?? []), ...(strings(context.warnings) ?? [])]),
    ],
    artifacts,
  };
}
