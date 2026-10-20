import { createHash } from 'crypto';

interface InputAssertion {
  type: string;
  assert?: InputAssertion[];
  value?: unknown;
  transform?: unknown;
  provider?: unknown;
}

interface InputStep {
  prompt: { raw: string; label?: string; template?: string; config?: unknown; function?: unknown };
  provider: {
    id(): string;
    label?: string;
    config?: unknown;
    transform?: unknown;
    inputs?: unknown;
    callApi?: Function;
  };
  test: {
    metadata?: Record<string, unknown>;
    assert?: InputAssertion[];
    provider?: unknown;
    options?: Record<string, unknown>;
  };
  nunjucksFilters?: unknown;
}

interface ProviderIdentity {
  id?: string;
  label?: string;
}

interface PlannedGroup {
  repeatGroupId: string;
  promptIdx: number;
  provider: ProviderIdentity;
  repetitions: number;
  inputHash: string;
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
  inputHash: string;
}

interface InputSources {
  fileHash: (reference: string) => string;
  functionSource: (fn: Function) => string | undefined;
  mimeTypes?: Record<string, string>;
}

export function copyBayesAtNInput<T>(value: T): T {
  if (
    !value ||
    typeof value !== 'object' ||
    ('id' in value && typeof value.id === 'function' && 'callApi' in value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => copyBayesAtNInput(entry)) as T;
  }
  if (value instanceof Date) {
    return new Date(value) as T;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, copyBayesAtNInput(entry)]),
  ) as T;
}

function encodeInput(
  value: unknown,
  sources: InputSources,
  ancestors = new Set<object>(),
): unknown {
  if (typeof value === 'function') {
    const reference = sources.functionSource(value);
    return [
      'function',
      Function.prototype.toString.call(value),
      reference,
      reference && sources.fileHash(reference),
    ];
  }
  if (!value || typeof value !== 'object') {
    return [typeof value, typeof value === 'number' ? String(value) : value];
  }
  if (ancestors.has(value)) {
    throw new Error('Bayes@N requires serializable question and grading inputs');
  }
  ancestors.add(value);
  try {
    if ('id' in value && typeof value.id === 'function' && 'callApi' in value) {
      const provider = value as InputStep['provider'];
      return encodeInput(
        {
          id: provider.id(),
          label: provider.label,
          config: provider.config,
          transform: provider.transform,
          inputs: provider.inputs,
          callApi: provider.callApi,
          env: 'env' in value ? value.env : undefined,
        },
        sources,
        ancestors,
      );
    }
    if (Array.isArray(value)) {
      return ['array', value.map((entry) => encodeInput(entry, sources, ancestors))];
    }
    if (value instanceof Date) {
      return ['date', value.toISOString()];
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new Error('Bayes@N requires serializable question and grading inputs');
    }
    return [
      'object',
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          encodeInput((value as Record<string, unknown>)[key], sources, ancestors),
        ]),
    ];
  } finally {
    ancestors.delete(value);
  }
}

export function hashBayesAtNInputs(step: InputStep, sources: InputSources): string {
  const metadata = { ...step.test.metadata };
  delete metadata.bayesAtNPlan;
  delete metadata.evaluationId;
  delete metadata.tracingEnabled;
  const files = new Set<string>();
  const addFile = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(addFile);
      return;
    }
    if (typeof value === 'string' && value.startsWith('file://')) {
      files.add(value);
    }
  };
  const addProvider = (provider: unknown) => {
    addFile(provider);
    if (provider && typeof provider === 'object') {
      if ('id' in provider) {
        addFile(provider.id);
      }
      if ('transform' in provider) {
        addFile(provider.transform);
      }
    }
  };
  const addAssertions = (assertions: InputAssertion[] = []) => {
    for (const assertion of assertions) {
      if (assertion.type === 'assert-set') {
        addAssertions(assertion.assert);
      } else {
        addFile(assertion.value);
        addFile(assertion.transform);
        addProvider(assertion.provider);
      }
    }
  };
  addAssertions(step.test.assert);
  addProvider(step.provider);
  addProvider(step.test.provider);
  addProvider(step.test.options?.provider);
  addFile(step.test.options?.transform);
  addFile(step.test.options?.postprocess);
  addFile(step.test.options?.transformVars);
  addFile(step.test.options?.rubricPrompt);
  return (
    'sha256:' +
    createHash('sha256')
      .update(
        JSON.stringify(
          encodeInput(
            {
              prompt: {
                raw: step.prompt.raw,
                label: step.prompt.label,
                template: step.prompt.template,
                config: step.prompt.config,
                function: step.prompt.function,
              },
              provider: step.provider,
              test: { ...step.test, metadata },
              filters: step.nunjucksFilters,
              files: [...files].sort().map((reference) => [reference, sources.fileHash(reference)]),
              mimeTypes: sources.mimeTypes,
            },
            sources,
          ),
        ),
      )
      .digest('hex')
  );
}

export function hasBayesAtNComparison(assertions: InputAssertion[] = []): boolean {
  return assertions.some(
    (assertion) =>
      assertion.type === 'select-best' ||
      assertion.type === 'max-score' ||
      (assertion.type === 'assert-set' && hasBayesAtNComparison(assertion.assert)),
  );
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
      inputHash: step.inputHash,
    };
    const existing = groups.get(groupKey(group));
    if (existing && existing.inputHash !== group.inputHash) {
      throw new Error('Bayes@N requires identical question and grading inputs across repeats');
    }
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
      typeof group.inputHash !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(group.inputHash) ||
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
      inputHash: group.inputHash,
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
  const groups = new Map(original.groups.map((group) => [groupKey(group), group]));
  if (
    current.groups.length !== groups.size ||
    current.groups.some((group) => {
      const saved = groups.get(groupKey(group));
      return saved?.repetitions !== group.repetitions || saved?.inputHash !== group.inputHash;
    })
  ) {
    throw new Error(
      'Bayes@N resume requires the original questions, grading inputs, providers, prompts, and repeat counts',
    );
  }
}
