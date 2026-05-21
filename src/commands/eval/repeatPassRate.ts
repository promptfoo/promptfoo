import type EvalResult from '../../models/evalResult';
import type { EvaluateResult } from '../../types/index';

export interface RepeatPassRateGroup {
  description: string;
  pass: number;
  total: number;
}

export function groupResultsByTest(
  results: (EvaluateResult | EvalResult)[],
): Map<string, RepeatPassRateGroup> {
  const groups = new Map<string, RepeatPassRateGroup>();
  for (const result of results) {
    const description = result.testCase.description || JSON.stringify(result.testCase.vars || {});
    const key = JSON.stringify({
      testCase: result.testCase,
      promptId: result.promptId,
      provider: {
        id: result.provider.id,
        label: result.provider.label,
      },
    });
    if (!groups.has(key)) {
      groups.set(key, { pass: 0, total: 0, description });
    }
    const group = groups.get(key)!;
    group.total++;
    if ('success' in result && result.success) {
      group.pass++;
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
