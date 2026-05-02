import { z } from 'zod';

import type { ModelAuditScanResults } from '../types/modelAudit';

const ModelAuditIssueSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'info', 'debug', 'critical']),
    message: z.string(),
  })
  .passthrough();

const ModelAuditCheckSchema = z
  .object({
    name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped']),
    message: z.string(),
  })
  .passthrough();

const CompleteModelAuditScanResultsSchema = z
  .object({
    issues: z.array(ModelAuditIssueSchema),
    checks: z.array(ModelAuditCheckSchema),
    has_errors: z.boolean(),
    total_checks: z.number().nonnegative(),
    passed_checks: z.number().nonnegative(),
    failed_checks: z.number().nonnegative(),
  })
  .passthrough();

export function parseCompleteModelAuditResults(value: unknown): ModelAuditScanResults {
  return CompleteModelAuditScanResultsSchema.parse(value) as ModelAuditScanResults;
}

export function getModelAuditVerdict(results: ModelAuditScanResults): {
  hasFindings: boolean;
  hasErrors: boolean;
  hasFailedChecks: boolean;
} {
  const issues = results.issues ?? [];
  const checks = results.checks ?? [];
  const hasFailedChecks =
    (results.failed_checks ?? 0) > 0 || checks.some((check) => check.status === 'failed');
  const hasBlockingIssue = issues.some(
    (issue) => issue.severity === 'critical' || issue.severity === 'error',
  );
  const hasReviewableIssue = issues.some(
    (issue) =>
      issue.severity === 'critical' || issue.severity === 'error' || issue.severity === 'warning',
  );

  return {
    hasFindings: Boolean(results.has_errors || hasFailedChecks || hasReviewableIssue),
    hasErrors: Boolean(results.has_errors || hasFailedChecks || hasBlockingIssue),
    hasFailedChecks,
  };
}
