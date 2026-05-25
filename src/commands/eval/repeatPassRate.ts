import type EvalResult from '../../models/evalResult';
import type { EvaluateResult } from '../../types/index';

export interface RepeatPassRateGroup {
  description: string;
  pass: number;
  total: number;
}

export function groupResultsByTest(
  results: (EvaluateResult | EvalResult)[],
  repeat: number,
  repeatPassRateGroupByTestIdx?: ReadonlyMap<number, number>,
): Map<string, RepeatPassRateGroup> {
  const resultsBySerializedTest = new Map<
    string,
    { hasRuntimeGroupIdentity: boolean; results: (EvaluateResult | EvalResult)[] }
  >();

  for (const result of results) {
    const repeatPassRateGroupIdx = repeatPassRateGroupByTestIdx?.get(result.testIdx);
    const key = JSON.stringify(
      repeatPassRateGroupIdx === undefined
        ? {
            testCase: result.testCase,
            promptId: result.promptId,
            provider: {
              id: result.provider.id,
              label: result.provider.label,
            },
          }
        : {
            repeatPassRateGroupIdx,
            promptId: result.promptId,
            provider: {
              id: result.provider.id,
              label: result.provider.label,
            },
          },
    );
    const matchingResults = resultsBySerializedTest.get(key) ?? {
      hasRuntimeGroupIdentity: repeatPassRateGroupIdx !== undefined,
      results: [],
    };
    matchingResults.results.push(result);
    resultsBySerializedTest.set(key, matchingResults);
  }

  const groups = new Map<string, RepeatPassRateGroup>();

  for (const [serializedKey, bucket] of resultsBySerializedTest) {
    const matchingResults = bucket.results;
    matchingResults.sort((left, right) => left.testIdx - right.testIdx);

    // The runtime plan supplies stable identities before secret redaction and
    // provider serialization. Retain the window fallback for direct/legacy callers.
    const windowSize = bucket.hasRuntimeGroupIdentity ? matchingResults.length : repeat;
    for (let offset = 0; offset < matchingResults.length; offset += windowSize) {
      const window = matchingResults.slice(offset, offset + windowSize);
      const description =
        window[0].testCase.description || JSON.stringify(window[0].testCase.vars || {});
      const group = { pass: 0, total: window.length, description };
      for (const result of window) {
        if ('success' in result && result.success) {
          group.pass++;
        }
      }
      groups.set(`${serializedKey}:${offset / repeat}`, group);
    }
  }

  return groups;
}

export function getFailingGroups(
  groups: Map<string, RepeatPassRateGroup>,
  threshold: number,
): RepeatPassRateGroup[] {
  const failing: RepeatPassRateGroup[] = [];
  for (const [, group] of groups) {
    const groupPassRate = (group.pass / group.total) * 100;
    if (groupPassRate < threshold) {
      failing.push(group);
    }
  }
  return failing;
}
