import { getRepeatPassRateGroupTestIdx } from './repeatPassRateMetadata';

import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';

export { REPEAT_PASS_RATE_GROUP_METADATA_KEY } from './repeatPassRateMetadata';

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

type RepeatPassRateResult = Pick<
  EvalResult,
  'testIdx' | 'promptIdx' | 'success' | 'description' | 'testCase'
> & {
  metadata?: Record<string, any>;
};

type Bucket = {
  testIdx: number;
  promptIdx: number;
  successes: number;
  total: number;
  description?: string;
};

function addResultToBuckets(buckets: Map<string, Bucket>, result: RepeatPassRateResult) {
  const testIdx = getRepeatPassRateGroupTestIdx(result);
  if (testIdx === undefined) {
    // Row was not part of a repeat group (e.g. a test opted out with
    // `options.repeat: 1` inside a globally repeated run). A single, intentionally
    // non-repeated row must not be graded as its own repeat group — that would fail
    // any threshold above 0 when the run is otherwise configured to allow opt-outs.
    return;
  }
  const key = `${testIdx}:${result.promptIdx}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      testIdx,
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

function collectViolations(buckets: Map<string, Bucket>, threshold: number) {
  const violations: RepeatPassRateViolation[] = [];
  for (const bucket of buckets.values()) {
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
 * Group results by their repeat-stable test identity and `promptIdx`, then compute pass rates.
 * Returns groups whose pass rate falls strictly below `threshold` (percent, 0–100).
 *
 * Errors and assertion failures both count as non-passes (mirroring the existing aggregate
 * `PROMPTFOO_PASS_RATE_THRESHOLD` semantics, which also count errors as non-passes).
 */
export function computeRepeatPassRateViolations(
  results: RepeatPassRateResult[],
  threshold: number,
): RepeatPassRateViolation[] {
  if (!Number.isFinite(threshold)) {
    return [];
  }

  const buckets = new Map<string, Bucket>();
  for (const result of results) {
    addResultToBuckets(buckets, result);
  }
  return collectViolations(buckets, threshold);
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

  const buckets = new Map<string, Bucket>();
  for await (const batch of evalRecord.fetchResultsBatched()) {
    for (const result of batch) {
      addResultToBuckets(buckets, result);
    }
  }
  // Rows that failed to persist live only in memory and are not returned by the batched
  // DB stream. Merge them back in so a failed-to-persist attempt still counts against the
  // per-test repeat pass rate instead of silently dropping the failing repeat.
  for (const result of evalRecord.getFailedResults()) {
    addResultToBuckets(buckets, result);
  }
  return collectViolations(buckets, threshold);
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
