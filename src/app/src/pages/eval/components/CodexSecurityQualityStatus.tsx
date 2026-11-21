import type { GradingResult } from '@promptfoo/types';

function unscoredReasons(result: GradingResult): string[] {
  const quality: unknown = result.metadata?.quality;
  const reasons = result.componentResults?.flatMap(unscoredReasons) ?? [];
  if (
    quality &&
    typeof quality === 'object' &&
    'status' in quality &&
    quality.status === 'not-scored'
  ) {
    reasons.push('reason' in quality && typeof quality.reason === 'string' ? quality.reason : '');
  }
  return reasons;
}

/** Eligibility is supplied by the assertion, never inferred from scan status or counts. */
export function CodexSecurityQualityStatus({
  gradingResults,
  compact = false,
}: {
  gradingResults?: GradingResult[];
  compact?: boolean;
}) {
  const reasons = gradingResults?.flatMap(unscoredReasons);

  if (!reasons?.length) {
    return null;
  }

  return (
    <div className="my-2 space-y-1 text-sm">
      <p className="font-medium">Quality: Not scored</p>
      {!compact &&
        [...new Set(reasons)].filter(Boolean).map((reason) => (
          <p key={reason} className="break-words text-muted-foreground">
            {reason}
          </p>
        ))}
    </div>
  );
}
