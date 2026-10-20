interface ProviderIdentity {
  id?: string;
  label?: string;
}

interface PlannedGroup {
  repeatGroupId: string;
  promptIdx: number;
  provider: ProviderIdentity;
  repetitions: number;
}

interface BayesAtNPlan {
  version: 1;
  groups: PlannedGroup[];
}

interface BayesAtNResult {
  repeatGroupId?: string;
  repeatIndex?: number;
  promptIdx: number;
  provider: ProviderIdentity;
  success: boolean;
  failureReason: number;
}

interface BayesAtNCohort {
  promptIdx: number;
  provider: ProviderIdentity;
  questions: number;
  trials: number;
  mean?: number;
  posteriorStd?: number;
  unavailableReason?: string;
}

function cohortKey(result: { promptIdx: number; provider: ProviderIdentity }): string {
  return JSON.stringify([result.promptIdx, result.provider.id, result.provider.label]);
}

function groupKey(result: {
  repeatGroupId?: string;
  promptIdx: number;
  provider: ProviderIdentity;
}) {
  return JSON.stringify([cohortKey(result), result.repeatGroupId]);
}

function readPlan(value: unknown): BayesAtNPlan | undefined {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) {
    return undefined;
  }
  if (!('groups' in value) || !Array.isArray(value.groups)) {
    return undefined;
  }
  const seen = new Set<string>();
  const groups: unknown[] = value.groups;
  for (const item of groups) {
    if (!item || typeof item !== 'object') {
      return undefined;
    }
    const group = item as Partial<PlannedGroup>;
    if (
      !group ||
      typeof group.repeatGroupId !== 'string' ||
      typeof group.promptIdx !== 'number' ||
      !Number.isSafeInteger(group.promptIdx) ||
      group.promptIdx < 0 ||
      typeof group.repetitions !== 'number' ||
      !Number.isSafeInteger(group.repetitions) ||
      group.repetitions < 1 ||
      !group.provider ||
      typeof group.provider !== 'object' ||
      (group.provider.id !== undefined && typeof group.provider.id !== 'string') ||
      (group.provider.label !== undefined && typeof group.provider.label !== 'string')
    ) {
      return undefined;
    }
    const key = groupKey({
      repeatGroupId: group.repeatGroupId,
      promptIdx: group.promptIdx,
      provider: group.provider,
    });
    if (seen.has(key)) {
      return undefined;
    }
    seen.add(key);
  }
  return value as BayesAtNPlan;
}

export class BayesAtNCalculator {
  private groups = new Map<
    string,
    PlannedGroup & { indices: Set<number>; passed: number; unavailableReason?: string }
  >();
  private cohorts = new Map<string, BayesAtNCohort>();

  constructor(plan: unknown) {
    for (const group of readPlan(plan)?.groups ?? []) {
      const key = cohortKey(group);
      const cohort = this.cohorts.get(key) ?? {
        promptIdx: group.promptIdx,
        provider: group.provider,
        questions: 0,
        trials: group.repetitions,
      };
      cohort.questions++;
      if (group.repetitions !== cohort.trials) {
        cohort.unavailableReason = 'Questions have different repeat counts';
      }
      this.cohorts.set(key, cohort);
      this.groups.set(groupKey(group), { ...group, indices: new Set(), passed: 0 });
    }
  }

  addResult(result: BayesAtNResult, cached: boolean): void {
    const cohort = this.cohorts.get(cohortKey(result));
    if (!cohort) {
      return;
    }
    const group = this.groups.get(groupKey(result));
    if (!group) {
      cohort.unavailableReason = 'Results contain an unscheduled question';
      return;
    }
    const index = result.repeatIndex;
    if (
      index === undefined ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= group.repetitions ||
      group.indices.has(index)
    ) {
      group.unavailableReason = 'Repeat indices are missing, duplicated, or out of range';
      return;
    }
    group.indices.add(index);
    if (result.failureReason === 2) {
      group.unavailableReason = 'Results contain execution errors';
    } else if (typeof result.success !== 'boolean') {
      group.unavailableReason = 'Results do not contain binary pass/fail outcomes';
    } else if (cached) {
      group.unavailableReason = 'Results contain cached responses or grading';
    } else if (result.success) {
      group.passed++;
    }
  }

  getSummary(): BayesAtNCohort[] | undefined {
    if (this.cohorts.size === 0) {
      return undefined;
    }
    const moments = new Map<string, { mean: number; variance: number; reason?: string }>();
    for (const group of this.groups.values()) {
      const key = cohortKey(group);
      const total = moments.get(key) ?? { mean: 0, variance: 0 };
      const n = group.repetitions;
      const a = group.passed + 1;
      const b = n - group.passed + 1;
      // Binary Bayes@N with independent Beta(1,1) priors for each question.
      // https://arxiv.org/abs/2510.04265v4, section 2.4 and Appendix A.
      const mean = a / (n + 2);
      total.mean += mean;
      total.variance += (mean * (b / (n + 2))) / (n + 3);
      total.reason ??= group.unavailableReason;
      if (group.indices.size !== n) {
        total.reason ??= 'Not all scheduled repetitions are present';
      }
      moments.set(key, total);
    }
    return [...this.cohorts.entries()].map(([key, cohort]) => {
      const total = moments.get(key)!;
      const unavailableReason = cohort.unavailableReason ?? total.reason;
      return unavailableReason
        ? { ...cohort, unavailableReason }
        : {
            ...cohort,
            mean: total.mean / cohort.questions,
            posteriorStd: Math.sqrt(total.variance) / cohort.questions,
          };
    });
  }
}
