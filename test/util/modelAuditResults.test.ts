import { describe, expect, it } from 'vitest';
import {
  getModelAuditVerdict,
  parseCompleteModelAuditResults,
} from '../../src/util/modelAuditResults';

describe('modelAuditResults', () => {
  it('parses complete scan results', () => {
    const results = parseCompleteModelAuditResults({
      total_checks: 2,
      passed_checks: 1,
      failed_checks: 1,
      has_errors: false,
      issues: [],
      checks: [
        { name: 'safe', status: 'passed', message: 'ok' },
        { name: 'pickle', status: 'failed', message: 'failed' },
      ],
    });

    expect(results.failed_checks).toBe(1);
    expect(getModelAuditVerdict(results)).toEqual({
      hasFindings: true,
      hasErrors: true,
      hasFailedChecks: true,
    });
  });

  it('keeps informational-only results clean', () => {
    expect(
      getModelAuditVerdict({
        has_errors: false,
        issues: [{ severity: 'info', message: 'metadata only' }],
        checks: [],
      }),
    ).toEqual({
      hasFindings: false,
      hasErrors: false,
      hasFailedChecks: false,
    });
  });
});
