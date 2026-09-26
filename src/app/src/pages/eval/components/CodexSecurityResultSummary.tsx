import { CopyButton } from '@app/components/ui/copy-button';
import { formatDuration } from '@app/utils/date';
import { formatCost } from '@app/utils/media';
import type { CodexSecurityResult } from '@promptfoo/contracts/codexSecurity';

const OPERATION_LABELS = {
  'security-scan': 'Standard security scan',
  'deep-security-scan': 'Deep security scan',
  'security-diff-scan': 'Git diff security scan',
  validation: 'Finding validation',
};
const STATUS_LABELS = {
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
  interrupted: 'Interrupted',
  unknown: 'Status unknown',
};
const DISPOSITION_LABELS = {
  reportable: 'Reportable',
  suppressed: 'Suppressed',
  not_applicable: 'Not applicable',
  deferred: 'Deferred',
};
const ARTIFACT_LABELS = {
  scanDir: 'Scan directory',
  outputDir: 'Validation directory',
  reportPath: 'Report',
  manifestPath: 'Manifest',
  findingsPath: 'Findings',
  coveragePath: 'Coverage',
  sarifPath: 'SARIF',
  artifactsDir: 'Artifacts directory',
};

function estimatedCost(cost: CodexSecurityResult['cost']): string {
  if (cost?.range) {
    return cost.range.maxUsd === null
      ? `${formatCost(cost.range.minUsd)} minimum; upper estimate unknown`
      : `${formatCost(cost.range.minUsd)}–${formatCost(cost.range.maxUsd)}`;
  }
  return cost?.baselineUsd == null ? 'Unknown' : formatCost(cost.baselineUsd);
}

function recordedList(values: string[] | null | undefined): string | undefined {
  return values ? values.join(', ') || 'None reported' : undefined;
}

export function CodexSecurityResultSummary({
  result,
  compact = false,
}: {
  result: CodexSecurityResult;
  compact?: boolean;
}) {
  const severities = result.findings
    ? Object.entries(result.findings.bySeverity)
        .filter(([, count]) => count > 0)
        .map(([severity, count]) => `${count} ${severity}`)
        .join(', ')
    : '';
  const details = [
    ['Report file', result.source.file],
    ['SHA-256', result.source.sha256],
    ['Scan ID', result.scanId],
    ['Target', result.target?.displayName],
    ['Target kind', result.target?.kind],
    ['Target ID', result.target?.id],
    ['Revision', result.target?.revision],
    ['Base revision', result.target?.baseRevision],
    ['Head revision', result.target?.headRevision],
    ['Snapshot digest', result.target?.snapshotDigest],
    ['Coverage mode', result.coverage.mode],
    ['Included paths', recordedList(result.scope?.includePaths)],
    ['Excluded paths', recordedList(result.scope?.excludePaths)],
    ['Scope', result.scope?.summary],
    ['Scope limitations', recordedList(result.scope?.limitations)],
    ['Pricing source', result.cost?.pricing?.source],
    ['Pricing date', result.cost?.pricing?.asOf],
    ['Pricing context', result.cost?.pricing?.context],
    ['Service tier', result.cost?.pricing?.serviceTier],
    [
      'Short-context baseline',
      result.cost?.range && result.cost.baselineUsd !== null
        ? formatCost(result.cost.baselineUsd)
        : null,
    ],
    ['SDK', result.versions.sdk],
    ['Plugin', result.versions.plugin],
  ].filter(([, value]) => value != null);
  const showFindings =
    result.findings !== null || (result.operation !== null && result.operation !== 'validation');

  return (
    <section aria-label="Codex Security result" className="space-y-2 text-sm">
      <p className="font-medium">
        {result.operation ? OPERATION_LABELS[result.operation] : 'Security operation'}
        {' · '}
        {STATUS_LABELS[result.status]}
      </p>
      {(result.model || result.source.kind === 'saved-report') && (
        <p className="text-muted-foreground">
          {result.model}
          {result.model && result.source.kind === 'saved-report' && ' · '}
          {result.source.kind === 'saved-report' && 'Saved report'}
        </p>
      )}
      {result.source.mocked && (
        <p className="font-medium text-amber-700 dark:text-amber-300">
          This result is marked as mocked.
        </p>
      )}
      {!compact && result.error && <p className="break-words text-destructive">{result.error}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {result.operation === 'validation' ? (
          <>
            <dt className="text-muted-foreground">Disposition</dt>
            <dd>
              {result.validation ? DISPOSITION_LABELS[result.validation.disposition] : 'Unknown'}
            </dd>
          </>
        ) : showFindings ? (
          <>
            <dt className="text-muted-foreground">Findings</dt>
            <dd>
              {result.findings?.total ?? 'Unknown'}
              {severities && <span className="text-muted-foreground"> ({severities})</span>}
            </dd>
            <dt className="text-muted-foreground">Coverage</dt>
            <dd className="capitalize">{result.coverage.completeness}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Estimated cost</dt>
        <dd>{estimatedCost(result.cost)}</dd>
        {result.elapsedMs !== null && (
          <>
            <dt className="text-muted-foreground">Recorded duration</dt>
            <dd>{formatDuration(result.elapsedMs)}</dd>
          </>
        )}
        {result.usage?.total != null && (
          <>
            <dt className="text-muted-foreground">Recorded tokens</dt>
            <dd>{result.usage.total.toLocaleString()}</dd>
          </>
        )}
      </dl>
      {result.warnings.length > 0 &&
        (compact ? (
          <p className="text-amber-700 dark:text-amber-300">
            {result.warnings.length} {result.warnings.length === 1 ? 'warning' : 'warnings'}
          </p>
        ) : (
          <ul
            aria-label="Warnings"
            className="list-disc space-y-1 pl-5 text-amber-700 dark:text-amber-300"
          >
            {result.warnings.map((warning, index) => (
              <li key={index} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        ))}
      {!compact && (details.length > 0 || result.artifacts.length > 0) && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Report details</summary>
          <dl className="mt-2 space-y-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
            {result.artifacts.map((artifact) => (
              <div key={artifact.kind}>
                <dt className="font-medium">{ARTIFACT_LABELS[artifact.kind]}</dt>
                <dd className="flex min-w-0 items-start gap-2">
                  <code className="min-w-0 break-all text-xs">{artifact.path}</code>
                  <CopyButton
                    value={artifact.path}
                    aria-label={`Copy ${ARTIFACT_LABELS[artifact.kind].toLowerCase()} path`}
                    title="Copy path"
                    className="shrink-0"
                  />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
