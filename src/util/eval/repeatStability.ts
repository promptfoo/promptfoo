import {
  type EvaluateResult,
  type RepeatStabilityConfidenceInterval,
  type RepeatStabilityGroup,
  type RepeatStabilitySummary,
  ResultFailureReason,
} from '../../types';

const WILSON_Z_95 = 1.959963984540054;

export function getWilsonScoreInterval(
  passed: number,
  total: number,
): RepeatStabilityConfidenceInterval | undefined {
  if (total <= 0 || passed < 0 || passed > total) {
    return undefined;
  }

  const proportion = passed / total;
  const zSquared = WILSON_Z_95 ** 2;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const margin =
    (WILSON_Z_95 / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + zSquared / (4 * total ** 2));

  return {
    confidenceLevel: 0.95,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

type RepeatStabilityResult = Omit<
  Pick<
    EvaluateResult,
    | 'description'
    | 'failureReason'
    | 'gradingResult'
    | 'prompt'
    | 'promptIdx'
    | 'provider'
    | 'repeatGroupId'
    | 'repeatIndex'
    | 'response'
    | 'success'
    | 'testCase'
  >,
  'description'
> & {
  description?: string | null;
};

type MutableRepeatStabilityGroup = RepeatStabilityGroup & { scored: number };

function isCachedResult(result: RepeatStabilityResult): boolean {
  return (
    result.response?.cached === true || result.gradingResult?.metadata?.cachedResponse === true
  );
}

function getGroupKey(result: RepeatStabilityResult): string {
  return `${result.repeatGroupId}\u0000${result.promptIdx}\u0000${result.provider.id}\u0000${result.provider.label}`;
}

export class RepeatStabilityCalculator {
  private groups = new Map<string, MutableRepeatStabilityGroup>();

  addResults(results: Iterable<RepeatStabilityResult>): void {
    for (const result of results) {
      this.addResult(result);
    }
  }

  addResult(result: RepeatStabilityResult): void {
    if (
      !result.repeatGroupId ||
      result.repeatIndex === undefined ||
      !Number.isInteger(result.repeatIndex) ||
      result.repeatIndex < 0
    ) {
      return;
    }

    const key = getGroupKey(result);
    const group = this.groups.get(key) ?? {
      repeatGroupId: result.repeatGroupId,
      promptIdx: result.promptIdx,
      provider: result.provider,
      description: result.description ?? result.testCase.description,
      promptLabel: result.prompt.label,
      repetitions: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      cached: 0,
      scored: 0,
      unstable: false,
    };

    group.repetitions++;
    if (isCachedResult(result)) {
      group.cached++;
    }
    if (result.failureReason === ResultFailureReason.ERROR) {
      group.errors++;
    } else if (result.success) {
      group.passed++;
      group.scored++;
    } else {
      group.failed++;
      group.scored++;
    }
    group.unstable = group.passed > 0 && group.failed > 0;
    this.groups.set(key, group);
  }

  getSummary(): RepeatStabilitySummary | undefined {
    if (this.groups.size === 0) {
      return undefined;
    }

    const groups: RepeatStabilityGroup[] = Array.from(this.groups.values()).map(
      ({ scored, ...group }) => ({
        ...group,
        ...(scored > 0 && { passRate: group.passed / scored }),
        ...(scored > 0 &&
          group.cached === 0 && {
            passRateConfidenceInterval: getWilsonScoreInterval(group.passed, scored),
          }),
      }),
    );

    groups.sort(
      (a, b) =>
        a.repeatGroupId.localeCompare(b.repeatGroupId) ||
        a.promptIdx - b.promptIdx ||
        (a.provider.id ?? '').localeCompare(b.provider.id ?? '') ||
        (a.provider.label ?? '').localeCompare(b.provider.label ?? ''),
    );

    return {
      totalGroups: groups.length,
      unstableGroups: groups.filter((group) => group.unstable).length,
      groupsWithErrors: groups.filter((group) => group.errors > 0).length,
      cachedResults: groups.reduce((total, group) => total + group.cached, 0),
      groups,
    };
  }
}

export function calculateRepeatStability(
  results: Iterable<RepeatStabilityResult>,
): RepeatStabilitySummary | undefined {
  const calculator = new RepeatStabilityCalculator();
  calculator.addResults(results);
  return calculator.getSummary();
}
