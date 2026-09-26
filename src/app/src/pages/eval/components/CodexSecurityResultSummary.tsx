import { useId } from 'react';

import { Badge } from '@app/components/ui/badge';
import { CopyButton } from '@app/components/ui/copy-button';
import { formatCost } from '@app/utils/media';

const OPERATION_LABELS: Record<string, string> = {
  'security-scan': 'Standard security scan',
  'deep-security-scan': 'Deep security scan',
  'security-diff-scan': 'Git diff security scan',
  validation: 'Finding validation',
};
const DISPOSITIONS: Record<string, string> = {
  reportable: 'Reportable',
  suppressed: 'Suppressed',
  not_applicable: 'Not applicable',
  deferred: 'Deferred',
};
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'informational', 'unknown'] as const;
const ARTIFACTS = [
  ['scanDir', 'Scan directory'],
  ['outputDir', 'Validation directory'],
  ['reportPath', 'Report'],
  ['findingsPath', 'Findings'],
  ['coveragePath', 'Coverage'],
  ['manifestPath', 'Manifest'],
  ['sarifPath', 'SARIF'],
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseOutput(output: unknown): Record<string, unknown> | undefined {
  if (typeof output !== 'string') {
    return record(output);
  }
  try {
    return record(JSON.parse(output));
  } catch {
    return undefined;
  }
}

function CostSummary({ cost }: { cost: Record<string, unknown> | undefined }) {
  const baseline = nonnegativeNumber(cost?.estimatedUsd);
  const range = record(cost?.estimatedUsdRange);
  const minimum = nonnegativeNumber(range?.min);
  const maximum = nonnegativeNumber(range?.max);

  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">Estimated cost</p>
      <p className="text-muted-foreground">
        Baseline: {baseline === undefined ? 'Unknown' : formatCost(baseline)}
      </p>
      <p className="text-muted-foreground">
        Range:{' '}
        {minimum === undefined
          ? 'Unknown'
          : maximum === undefined || maximum < minimum
            ? `${formatCost(minimum)} minimum; upper estimate unknown`
            : `${formatCost(minimum)}–${formatCost(maximum)}`}
      </p>
      <p className="text-xs text-muted-foreground">
        API-equivalent estimates, not a billing total. The baseline assumes short-context pricing.
      </p>
    </div>
  );
}

function ScanFindingsSummary({
  metadata,
  raw,
}: {
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}) {
  const coverage = record(metadata?.coverage) ?? record(raw?.coverage);
  const completeness = coverage?.completeness;
  const coverageLabel =
    completeness === 'complete' ? 'Complete' : completeness === 'partial' ? 'Partial' : 'Unknown';
  const rawFindings = record(raw?.findings)?.findings;
  const findings = Array.isArray(rawFindings) ? rawFindings : undefined;
  const reportedCount = nonnegativeNumber(metadata?.findingsCount);
  const findingCount =
    findings?.length ??
    (reportedCount !== undefined && Number.isInteger(reportedCount) ? reportedCount : undefined);
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings ?? []) {
    const severity = record(record(finding)?.severity)?.level;
    const level =
      typeof severity === 'string' && SEVERITIES.some((value) => value === severity)
        ? severity
        : 'unknown';
    counts[level]++;
  }

  return (
    <div className="space-y-2">
      <Badge variant={completeness === 'partial' ? 'warning' : 'secondary'}>
        Coverage: {coverageLabel}
      </Badge>
      <p className="text-sm font-medium">Current findings: {findingCount ?? 'Unknown'}</p>
      {findings ? (
        <ul aria-label="Current findings by severity" className="flex flex-wrap gap-2">
          {SEVERITIES.filter((severity) => severity !== 'unknown' || counts.unknown > 0).map(
            (severity) => (
              <li key={severity}>
                <Badge
                  variant={
                    severity === 'informational'
                      ? 'info'
                      : severity === 'unknown'
                        ? 'secondary'
                        : severity
                  }
                >
                  {severity}: {counts[severity]}
                </Badge>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Severity counts unavailable.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Counts include this scan only. Complete coverage does not mean the repository is free of
        findings.
      </p>
    </div>
  );
}

interface CodexSecurityResultSummaryProps {
  provider?: string;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

export function CodexSecurityResultSummary({
  provider,
  output,
  metadata,
}: CodexSecurityResultSummaryProps) {
  const headingId = useId();
  const operation = text(metadata?.operation);
  const nativeProvider =
    metadata?.providerType === 'codex-security' ||
    provider === 'openai:codex-security' ||
    provider?.startsWith('openai:codex-security:');
  // Provider labels may replace the ID in saved results. Require SDK provenance as well
  // as a recognized operation before treating a labeled provider as Codex Security.
  const identifiedByMetadata =
    operation !== undefined &&
    Object.prototype.hasOwnProperty.call(OPERATION_LABELS, operation) &&
    (text(metadata?.sdkVersion) !== undefined || text(metadata?.pluginVersion) !== undefined);
  if (!nativeProvider && !identifiedByMetadata) {
    return null;
  }

  const raw = parseOutput(output);
  const validation = operation === 'validation';
  const disposition = text(metadata?.disposition) ?? text(raw?.disposition);
  const dispositionLabel =
    disposition && Object.prototype.hasOwnProperty.call(DISPOSITIONS, disposition)
      ? DISPOSITIONS[disposition]
      : 'Unknown';
  const warnings = Array.isArray(metadata?.warnings)
    ? [
        ...new Set(
          metadata.warnings.filter((warning): warning is string => text(warning) !== undefined),
        ),
      ]
    : [];
  const cost = record(metadata?.cost) ?? record(raw?.cost);
  const status = text(metadata?.status) ?? text(record(raw?.turn)?.status);
  const synthetic = metadata?.synthetic === true || record(raw?.turn)?.mock === true;
  const pluginVersion =
    text(metadata?.pluginVersion) ??
    text(record(record(record(raw?.manifest)?.scan)?.producer)?.version);
  const artifacts = ARTIFACTS.flatMap(([key, label]) => {
    const value = text(metadata?.[key]) ?? text(raw?.[key]);
    return value ? [{ key, label, value }] : [];
  });

  return (
    <section
      aria-labelledby={headingId}
      className="mb-4 space-y-4 rounded-lg border border-border p-4"
    >
      <div className="space-y-1">
        <h4 id={headingId} className="text-base font-medium">
          Codex Security summary
        </h4>
        <p className="text-sm text-muted-foreground">
          {operation && Object.prototype.hasOwnProperty.call(OPERATION_LABELS, operation)
            ? OPERATION_LABELS[operation]
            : 'Security operation'}
          {status && ` · Status: ${status}`}
        </p>
      </div>
      {synthetic && (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          Synthetic test data. No security analysis was performed.
        </p>
      )}
      {validation ? (
        <p className="text-sm font-medium">Validation disposition: {dispositionLabel}</p>
      ) : (
        <ScanFindingsSummary metadata={metadata} raw={raw} />
      )}
      <CostSummary cost={cost} />
      {warnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Warnings</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
            {warnings.slice(0, 20).map((warning) => (
              <li key={warning} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
          {warnings.length > 20 && (
            <p className="text-sm text-muted-foreground">
              {warnings.length - 20} more warnings in metadata.
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        SDK: {text(metadata?.sdkVersion) ?? 'Unknown'} · Plugin: {pluginVersion ?? 'Unknown'}
      </p>
      {artifacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Artifacts</p>
          <p className="text-xs text-muted-foreground">
            Paths refer to files on the host that ran the operation.
          </p>
          <dl className="space-y-2 text-sm">
            {artifacts.map(({ key, label, value }) => (
              <div key={key} className="space-y-1">
                <dt className="font-medium">{label}</dt>
                <dd className="flex min-w-0 items-start gap-2">
                  <code className="min-w-0 break-all text-xs text-muted-foreground">{value}</code>
                  <CopyButton
                    value={value}
                    aria-label={`Copy ${label.toLowerCase()} path`}
                    title="Copy path"
                    className="shrink-0"
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
