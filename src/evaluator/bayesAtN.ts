import { createHash } from 'crypto';

interface InputAssertion {
  type: string;
  assert?: InputAssertion[];
  value?: unknown;
  transform?: unknown;
  provider?: unknown;
  contextTransform?: unknown;
  rubricPrompt?: unknown;
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
  providerFiles?: (provider: unknown, target: boolean) => [string, string][];
  providerConfig?: (provider: object) => unknown;
  rubricFileReference?: (reference: string, arrayElement?: boolean) => string;
  mimeTypes?: Record<string, string>;
}

function hasSharedSession(config: Record<string, unknown>): boolean {
  const sharedKeys = [
    'persistSession',
    'session_id',
    'persist_sessions',
    'thread_id',
    'persist_threads',
    'resume',
    'continue',
    'sessionId',
    'session_key',
    'session',
  ];
  if (sharedKeys.some((key) => Boolean(config[key]))) {
    return true;
  }
  const extraArgs = config.extra_args;
  if (
    extraArgs &&
    typeof extraArgs === 'object' &&
    ['resume', 'r', 'continue', 'c', 'session-id', 'fork-session'].some((key) =>
      Object.prototype.hasOwnProperty.call(extraArgs, key),
    )
  ) {
    return true;
  }
  const runOptions = config.runOptions;
  if (
    runOptions &&
    typeof runOptions === 'object' &&
    'session' in runOptions &&
    runOptions.session
  ) {
    return true;
  }
  const headers = config.headers;
  return Boolean(
    headers &&
      typeof headers === 'object' &&
      Object.entries(headers).some(
        ([key, value]) => key.toLowerCase() === 'x-openclaw-session-key' && Boolean(value),
      ),
  );
}

function isInputProvider(provider: unknown): provider is InputStep['provider'] {
  return Boolean(
    provider &&
      typeof provider === 'object' &&
      'id' in provider &&
      typeof provider.id === 'function' &&
      'callApi' in provider,
  );
}

const providerTypes = ['text', 'embedding', 'classification', 'moderation'] as const;

export function hasBayesAtNSharedSession(step: InputStep): boolean {
  const seenProviders = new Set<object>();
  const hasSharedProvider = (provider: unknown, target = false): boolean => {
    if (!provider || typeof provider !== 'object' || seenProviders.has(provider)) {
      return false;
    }
    seenProviders.add(provider);
    if ('hasSharedSession' in provider && provider.hasSharedSession === true) {
      return true;
    }
    if ('id' in provider || 'config' in provider) {
      const config =
        'config' in provider ? ((provider.config as Record<string, unknown>) ?? {}) : {};
      return (
        hasSharedSession(config) ||
        hasSharedSession({
          ...config,
          ...(target && {
            ...(step.prompt.config as Record<string, unknown>),
            ...step.test.options,
          }),
        })
      );
    }
    return providerTypes.some(
      (type) => type in provider && hasSharedProvider(provider[type as keyof typeof provider]),
    );
  };
  // These option names are reserved for shared sessions in Bayes@N, including
  // custom provider IDs. Saving a fresh session (persist_session) is allowed.
  const activeProvider = isInputProvider(step.test.provider) ? step.test.provider : step.provider;
  if (
    hasSharedProvider(activeProvider, true) ||
    (!isInputProvider(step.test.provider) && hasSharedProvider(step.test.provider)) ||
    hasSharedProvider(step.test.options?.provider)
  ) {
    return true;
  }
  const hasSharedGrader = (assertions: InputAssertion[] = []): boolean =>
    assertions.some((assertion) =>
      assertion.type === 'assert-set'
        ? hasSharedGrader(assertion.assert)
        : hasSharedProvider(assertion.provider),
    );
  return hasSharedGrader(step.test.assert);
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
          ...(sources.providerConfig?.(value) !== undefined && {
            nativeConfig: sources.providerConfig?.(value),
          }),
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
  const providerFiles = new Map<string, string>();
  const seenProviderMaps = new Set<object>();
  const addFile = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(addFile);
      return;
    }
    if (typeof value === 'string' && value.startsWith('file://')) {
      files.add(value);
    }
  };
  const addProvider = (provider: unknown, target = false, collectInputs = true) => {
    addFile(provider);
    for (const [filePath, hash] of collectInputs
      ? (sources.providerFiles?.(provider, target) ?? [])
      : []) {
      providerFiles.set(filePath, hash);
    }
    if (provider && typeof provider === 'object') {
      if ('id' in provider) {
        addFile(provider.id);
      }
      if ('transform' in provider) {
        addFile(provider.transform);
      }
      if (!('id' in provider) && !('config' in provider) && !seenProviderMaps.has(provider)) {
        seenProviderMaps.add(provider);
        for (const type of providerTypes) {
          if (type in provider) {
            addProvider(provider[type as keyof typeof provider]);
          }
        }
      }
    }
  };
  const addRubric = (value: unknown, arrayElement = false): void => {
    if (typeof value === 'string' && value.startsWith('file://')) {
      files.add(sources.rubricFileReference?.(value, arrayElement) ?? value);
    } else if (Array.isArray(value)) {
      for (const part of value) {
        addRubric(part, true);
      }
    }
  };
  const rubricTypes = new Set([
    'llm-rubric',
    'agent-rubric',
    'factuality',
    'model-graded-factuality',
    'model-graded-closedqa',
    'answer-relevance',
    'context-recall',
    'context-relevance',
    'context-faithfulness',
    'search-rubric',
  ]);
  const addAssertions = (assertions: InputAssertion[] = []) => {
    for (const assertion of assertions) {
      if (assertion.type === 'assert-set') {
        addAssertions(assertion.assert);
      } else {
        addFile(assertion.value);
        addFile(assertion.transform);
        const type = assertion.type?.replace(/^not-/, '');
        if (
          type &&
          ['context-recall', 'context-relevance', 'context-faithfulness'].includes(type)
        ) {
          addFile(assertion.contextTransform);
        }
        const rubric = assertion.rubricPrompt || step.test.options?.rubricPrompt;
        if (type === 'g-eval' && rubric && typeof rubric === 'object' && !Array.isArray(rubric)) {
          addRubric('steps' in rubric ? rubric.steps : undefined);
          addRubric('evaluate' in rubric ? rubric.evaluate : undefined);
        } else if (type === 'context-faithfulness' && Array.isArray(rubric)) {
          for (const part of rubric.slice(0, 2)) {
            addRubric(part && typeof part === 'object' && 'content' in part ? part.content : part);
          }
        } else if (type && rubricTypes.has(type)) {
          addRubric(rubric);
        }
        addProvider(assertion.provider);
      }
    }
  };
  addAssertions(step.test.assert);
  addProvider(step.provider, true, !isInputProvider(step.test.provider));
  addProvider(step.test.provider, isInputProvider(step.test.provider));
  addProvider(step.test.options?.provider);
  addFile(step.test.options?.transform);
  addFile(step.test.options?.postprocess);
  addFile(step.test.options?.transformVars);
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
              ...(providerFiles.size > 0 && { providerFiles: [...providerFiles].sort() }),
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
  const inputHashes = new Map<string, string>();
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
    const key = groupKey(group);
    if (inputHashes.has(key) && inputHashes.get(key) !== step.inputHash) {
      throw new Error('Bayes@N requires identical question and grading inputs across repeats');
    }
    inputHashes.set(key, step.inputHash);
    groups.set(key, group);
  }
  if (groups.size === 0) {
    throw new Error('Bayes@N requires at least one scheduled question');
  }
  return { version: 1, groups: [...groups.values()] };
}
