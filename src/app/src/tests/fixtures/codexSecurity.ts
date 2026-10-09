import type { CodexSecurityResult } from '@promptfoo/contracts/codexSecurity';

/** Unit-test metadata only; no report or SDK operation is executed. */
export function createCodexSecurityResult(
  overrides: Partial<CodexSecurityResult> = {},
): CodexSecurityResult {
  return {
    version: 1,
    source: { kind: 'sdk', mocked: false },
    operation: 'security-scan',
    status: 'unknown',
    error: null,
    scanId: null,
    model: null,
    versions: { sdk: null, plugin: null },
    coverage: { completeness: 'unknown', mode: null },
    findings: null,
    validation: null,
    cost: null,
    elapsedMs: null,
    usage: null,
    target: null,
    scope: null,
    warnings: [],
    artifacts: [],
    ...overrides,
  };
}
