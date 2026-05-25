import { type EvaluateResult } from '../types';

import type EvalResult from '../models/evalResult';

export interface PerTestPassRateFailure {
  description: string;
  passCount: number;
  totalCount: number;
  passRatePct: number;
}

type ResultLike = EvaluateResult | EvalResult;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

function resolveVars(result: ResultLike): unknown {
  // EvaluateResult exposes the specific var combination at top level; EvalResult
  // (DB-backed) keeps them under testCase.
  if ('vars' in result && (result as EvaluateResult).vars != null) {
    return (result as EvaluateResult).vars;
  }
  const testCase = result.testCase as { vars?: unknown } | undefined;
  return testCase?.vars ?? {};
}

function groupKey(result: ResultLike): string {
  const testCase = result.testCase as { description?: string } | undefined;
  return [result.promptIdx, testCase?.description ?? '', stableStringify(resolveVars(result))].join(
    ' ',
  );
}

function describeGroup(sample: ResultLike): string {
  const testCase = sample.testCase as { description?: string } | undefined;
  if (testCase?.description) {
    return testCase.description;
  }
  return `test #${sample.testIdx} (vars=${stableStringify(resolveVars(sample))})`;
}

export function findTestsBelowRepeatPassRateThreshold(
  results: ResultLike[],
  thresholdPct: number,
): PerTestPassRateFailure[] {
  if (!Number.isFinite(thresholdPct)) {
    return [];
  }

  type Group = { passCount: number; totalCount: number; sample: ResultLike };
  const groups = new Map<string, Group>();

  for (const result of results) {
    const key = groupKey(result);
    let group = groups.get(key);
    if (!group) {
      group = { passCount: 0, totalCount: 0, sample: result };
      groups.set(key, group);
    }
    group.totalCount++;
    if (result.success) {
      group.passCount++;
    }
  }

  const failures: PerTestPassRateFailure[] = [];
  for (const group of groups.values()) {
    if (group.totalCount === 0) {
      continue;
    }
    const passRatePct = (group.passCount / group.totalCount) * 100;
    if (passRatePct < thresholdPct) {
      failures.push({
        description: describeGroup(group.sample),
        passCount: group.passCount,
        totalCount: group.totalCount,
        passRatePct,
      });
    }
  }

  return failures;
}
