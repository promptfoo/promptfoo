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
): Map<string, RepeatPassRateGroup> {
  const resultsBySerializedTest = new Map<string, (EvaluateResult | EvalResult)[]>();

  for (const result of results) {
    const key = JSON.stringify({
      testCase: result.testCase,
      promptId: result.promptId,
      provider: {
        id: result.provider.id,
        label: result.provider.label,
      },
    });
    const matchingResults = resultsBySerializedTest.get(key) ?? [];
    matchingResults.push(result);
    resultsBySerializedTest.set(key, matchingResults);
  }

  const groups = new Map<string, RepeatPassRateGroup>();

  for (const [serializedKey, matchingResults] of resultsBySerializedTest) {
    matchingResults.sort((left, right) => left.testIdx - right.testIdx);

    // Persisted results strip function values. If otherwise identical tests differ
    // only by inline functions, each still occupies its own contiguous repeat window.
    for (let offset = 0; offset < matchingResults.length; offset += repeat) {
      const window = matchingResults.slice(offset, offset + repeat);
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
