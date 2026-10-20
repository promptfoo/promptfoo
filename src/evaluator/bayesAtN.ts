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

interface PlannedStep {
  repeatGroupId?: string;
  promptIdx: number;
  provider: { id(): string; label?: string };
  evaluateOptions?: { repeat?: number };
}

function groupKey(result: PlannedGroup): string {
  return JSON.stringify([
    result.promptIdx,
    result.provider.id,
    result.provider.label,
    result.repeatGroupId,
  ]);
}

export function validateBayesAtNRepeat(repeat: number | undefined): void {
  if (repeat !== undefined && (!Number.isSafeInteger(repeat) || repeat < 1)) {
    throw new Error('Bayes@N requires a positive safe integer repeat count');
  }
}

export function createBayesAtNPlan(steps: Iterable<PlannedStep>): BayesAtNPlan {
  const groups = new Map<string, PlannedGroup>();
  for (const step of steps) {
    if (step.repeatGroupId === undefined) {
      throw new Error('Bayes@N requires a repeat group for every scheduled question');
    }
    const group = {
      repeatGroupId: step.repeatGroupId,
      promptIdx: step.promptIdx,
      provider: { id: step.provider.id(), label: step.provider.label },
      repetitions: step.evaluateOptions?.repeat ?? 1,
    };
    groups.set(groupKey(group), group);
  }
  if (groups.size === 0) {
    throw new Error('Bayes@N requires at least one scheduled question');
  }
  return { version: 1, groups: [...groups.values()] };
}

export function readResumeBayesAtNPlan(plan: unknown): BayesAtNPlan {
  const invalidPlan = () =>
    new Error(
      'Bayes@N resume requires the original valid sampling plan and retained grading evidence',
    );
  if (!plan || typeof plan !== 'object' || !('version' in plan) || plan.version !== 1) {
    throw invalidPlan();
  }
  if (!('groups' in plan) || !Array.isArray(plan.groups) || plan.groups.length === 0) {
    throw invalidPlan();
  }
  const groups: PlannedGroup[] = [];
  const keys = new Set<string>();
  for (const group of plan.groups) {
    if (
      !group ||
      typeof group !== 'object' ||
      typeof group.repeatGroupId !== 'string' ||
      group.repeatGroupId.length === 0 ||
      !Number.isSafeInteger(group.promptIdx) ||
      group.promptIdx < 0 ||
      !Number.isSafeInteger(group.repetitions) ||
      group.repetitions < 1 ||
      !group.provider ||
      typeof group.provider !== 'object' ||
      (group.provider.id !== undefined && typeof group.provider.id !== 'string') ||
      (group.provider.label !== undefined && typeof group.provider.label !== 'string')
    ) {
      throw invalidPlan();
    }
    const normalized: PlannedGroup = {
      repeatGroupId: group.repeatGroupId,
      promptIdx: group.promptIdx,
      provider: { id: group.provider.id, label: group.provider.label },
      repetitions: group.repetitions,
    };
    const key = groupKey(normalized);
    if (keys.has(key)) {
      throw invalidPlan();
    }
    keys.add(key);
    groups.push(normalized);
  }
  return { version: 1, groups };
}

export function validateResumeBayesAtNPlan(original: BayesAtNPlan, current: BayesAtNPlan): void {
  const groups = new Map(original.groups.map((group) => [groupKey(group), group.repetitions]));
  if (
    current.groups.length !== groups.size ||
    current.groups.some((group) => groups.get(groupKey(group)) !== group.repetitions)
  ) {
    throw new Error(
      'Bayes@N resume requires the original questions, providers, prompts, and repeat counts',
    );
  }
}
