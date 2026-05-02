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
    const testCase = 'testCase' in result ? result.testCase : undefined;
    const description = testCase?.description || JSON.stringify(testCase?.vars || {});
    const providerId =
      'provider' in result && result.provider
        ? typeof result.provider === 'object' && 'id' in result.provider
          ? (result.provider.id as string)
          : ''
        : '';
    const promptId = 'promptId' in result ? (result.promptId as string) : '';
    const key = `${description}|||${promptId}|||${providerId}`;
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
