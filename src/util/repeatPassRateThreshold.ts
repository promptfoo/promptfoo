import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';

/**
 * A single per-test repeat pass-rate violation.
 *
 * When the `--repeat N` flag is used (or `evaluateOptions.repeat`), the same test case can run
 * multiple times against the same prompt/provider combination. A violation is recorded when the
 * pass rate across those repeated runs falls below the configured threshold.
 */
export interface RepeatPassRateViolation {
  testIdx: number;
  promptIdx: number;
  successes: number;
  total: number;
  passRate: number;
  description?: string;
}

/**
 * Group results by their `(testIdx, promptIdx)` pair and compute the pass rate for each group.
 * Returns groups whose pass rate falls strictly below `threshold` (percent, 0–100).
 *
 * Errors and assertion failures both count as non-passes (mirroring the existing aggregate
 * `PROMPTFOO_PASS_RATE_THRESHOLD` semantics, which also count errors as non-passes).
 */
export function computeRepeatPassRateViolations(
  results: Pick<EvalResult, 'testIdx' | 'promptIdx' | 'success' | 'description' | 'testCase'>[],
  threshold: number,
): RepeatPassRateViolation[] {
  if (!Number.isFinite(threshold)) {
    return [];
  }

  type Bucket = {
    testIdx: number;
    promptIdx: number;
    successes: number;
    total: number;
    description?: string;
  };
  const buckets = new Map<string, Bucket>();
  for (const result of results) {
    const key = `${result.testIdx}:${result.promptIdx}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        testIdx: result.testIdx,
        promptIdx: result.promptIdx,
        successes: 0,
        total: 0,
        description: result.description ?? result.testCase?.description,
      };
      buckets.set(key, bucket);
    }
    if (result.success) {
      bucket.successes += 1;
    }
    bucket.total += 1;
  }

  const violations: RepeatPassRateViolation[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.total === 0) {
      continue;
    }
    const passRate = (bucket.successes / bucket.total) * 100;
    if (passRate < threshold) {
      violations.push({
        testIdx: bucket.testIdx,
        promptIdx: bucket.promptIdx,
        successes: bucket.successes,
        total: bucket.total,
        passRate,
        description: bucket.description,
      });
    }
  }

  // Sort for deterministic logging across runs.
  violations.sort((a, b) => a.testIdx - b.testIdx || a.promptIdx - b.promptIdx);
  return violations;
}

/**
 * Compute per-test repeat pass-rate violations for an Eval, fetching results in batches when the
 * eval is persisted so this works after `clearResults()` has been called.
 */
export async function findRepeatPassRateViolations(
  evalRecord: Eval,
  threshold: number,
): Promise<RepeatPassRateViolation[]> {
  if (!Number.isFinite(threshold)) {
    return [];
  }

  if (!evalRecord.persisted) {
    return computeRepeatPassRateViolations(evalRecord.results, threshold);
  }

  type Bucket = {
    testIdx: number;
    promptIdx: number;
    successes: number;
    total: number;
    description?: string;
  };
  const buckets = new Map<string, Bucket>();
  for await (const batch of evalRecord.fetchResultsBatched()) {
    for (const result of batch) {
      const key = `${result.testIdx}:${result.promptIdx}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          testIdx: result.testIdx,
          promptIdx: result.promptIdx,
          successes: 0,
          total: 0,
          description: result.description ?? result.testCase?.description,
        };
        buckets.set(key, bucket);
      }
      if (result.success) {
        bucket.successes += 1;
      }
      bucket.total += 1;
    }
  }

  const violations: RepeatPassRateViolation[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.total === 0) {
      continue;
    }
    const passRate = (bucket.successes / bucket.total) * 100;
    if (passRate < threshold) {
      violations.push({
        testIdx: bucket.testIdx,
        promptIdx: bucket.promptIdx,
        successes: bucket.successes,
        total: bucket.total,
        passRate,
        description: bucket.description,
      });
    }
  }

  violations.sort((a, b) => a.testIdx - b.testIdx || a.promptIdx - b.promptIdx);
  return violations;
}

/**
 * Render a violation as a single human-readable line for CLI output.
 */
export function formatRepeatPassRateViolation(
  violation: RepeatPassRateViolation,
  threshold: number,
): string {
  const label = violation.description
    ? `test #${violation.testIdx} (${violation.description})`
    : `test #${violation.testIdx}`;
  return `${label}, prompt #${violation.promptIdx}: ${violation.successes}/${violation.total} passed (${violation.passRate.toFixed(2)}% < ${threshold}%)`;
}
