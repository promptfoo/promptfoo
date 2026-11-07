import { boundedIdentityString } from './identity';
import { captureJson, isRecord, own } from './values';

import type { WorkBudget } from './limits';
import type {
  AnalysisLimits,
  CacheStatus,
  MetamorphicPlan,
  Observation,
  Selection,
  SourceStatus,
} from './types';

export interface NativePanel {
  summaryVersion: number;
  rows: number;
  selectedRows: number;
  ignoredRows: number;
  unidentifiedRows: number;
  observations: Map<string, Observation>;
}
export function slotKey(
  context: string,
  family: string,
  variant: string,
  repetition: number,
): string {
  return JSON.stringify([context, family, variant, repetition]);
}
function contextKey(promptIdx: number, providerId: string, label: string | undefined): string {
  return JSON.stringify([promptIdx, providerId, label ?? null]);
}
export function nativeSourceStatus(row: unknown, response: unknown): SourceStatus {
  const success = own(row, 'success');
  const reason = own(row, 'failureReason');
  const responseError = own(response, 'error');
  if (responseError !== undefined && responseError !== null && responseError !== '') {
    return success === true ? 'unknown' : 'execution-failed';
  }
  if (reason === 2) {
    return success === false ? 'execution-failed' : 'unknown';
  }
  if (reason === 1) {
    return success === false ? 'assertion-failed' : 'unknown';
  }
  // Older exports may omit failureReason. Only a positive native success flag
  // establishes an assertion pass; a false flag with unknown reason does not.
  if ((reason === 0 || reason === undefined) && success === true) {
    return 'passed';
  }
  return 'unknown';
}
export function nativeCacheStatus(response: unknown): CacheStatus {
  const cached = own(response, 'cached');
  return cached === true ? 'cached' : cached === false ? 'fresh' : 'unknown';
}
function outputValue(response: unknown, limits: AnalysisLimits, work: WorkBudget): Selection {
  const output = own(response, 'output');
  if (output === undefined) {
    return { available: false, reason: 'output-missing' };
  }
  if (output === '[output stripped]') {
    return { available: false, reason: 'output-stripped' };
  }
  return { available: true, value: captureJson(output, limits, work) };
}
function scoresValue(row: unknown, limits: AnalysisLimits, work: WorkBudget): Selection {
  const scores = own(row, 'namedScores');
  if (scores === undefined) {
    return { available: false, reason: 'named-scores-missing' };
  }
  if (!isRecord(scores)) {
    throw new Error('Native named scores must be an object of finite numbers');
  }
  const captured = captureJson(scores, limits, work);
  if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) {
    throw new Error('Native named scores must be an object');
  }
  for (const value of Object.values(captured)) {
    if (typeof value !== 'number') {
      throw new Error('Native named scores must be finite numbers');
    }
  }
  return { available: true, value: captured };
}

function validateRepeatIndex(nativeRepeat: unknown, repetitions: number): number {
  const repetition = nativeRepeat === undefined && repetitions === 1 ? 0 : nativeRepeat;
  if (
    !Number.isSafeInteger(repetition) ||
    (repetition as number) < 0 ||
    (repetition as number) >= repetitions
  ) {
    throw new Error('Selected native row requires an in-range repeatIndex');
  }
  return repetition as number;
}

class NativeIdentities {
  private readonly promptIds = new Map<string, string>();
  private readonly repeatGroups = new Map<string, string>();
  private readonly groupIdentities = new Map<string, string>();

  validate(row: unknown, contextId: string, familyId: string, variantId: string, work: WorkBudget) {
    const promptId = own(row, 'promptId');
    if (promptId !== undefined) {
      if (!boundedIdentityString(promptId, 4096, work)) {
        throw new Error('Native prompt identity must be a string when provided');
      }
      const previous = this.promptIds.get(contextId);
      if (previous !== undefined && previous !== promptId) {
        throw new Error('Selected context contains inconsistent native prompt identities');
      }
      this.promptIds.set(contextId, promptId);
    }
    const repeatGroupId = own(row, 'repeatGroupId');
    if (repeatGroupId !== undefined) {
      if (!boundedIdentityString(repeatGroupId, 4096, work) || repeatGroupId.length === 0) {
        throw new Error('Native repeat group identity must be a nonempty string');
      }
      const logical = JSON.stringify([contextId, familyId, variantId]);
      const previousGroup = this.repeatGroups.get(logical);
      const groupKey = JSON.stringify([contextId, repeatGroupId]);
      const previousIdentity = this.groupIdentities.get(groupKey);
      if (
        (previousGroup !== undefined && previousGroup !== repeatGroupId) ||
        (previousIdentity !== undefined && previousIdentity !== logical)
      ) {
        throw new Error('Native repeat group conflicts with the declared logical identity');
      }
      this.repeatGroups.set(logical, repeatGroupId);
      this.groupIdentities.set(groupKey, logical);
    }

    return { promptId, repeatGroupId };
  }
}

/**
 * Project the flat native OutputFile/ResultsFile summary. Ignore forward-
 * compatible unrelated fields: never deserialize providers or execute config.
 */
export function projectNative(
  input: unknown,
  plan: MetamorphicPlan,
  limits: AnalysisLimits,
  work: WorkBudget,
): NativePanel {
  const summary = own(input, 'results');
  const version = own(summary, 'version');
  const rows = own(summary, 'results');
  if ((version !== 2 && version !== 3) || !Array.isArray(rows)) {
    throw new Error('Expected native OutputFile.results with version 2 or 3 and flat results');
  }
  if (rows.length > limits.maxRows) {
    throw new Error('Native export exceeds the row limit');
  }
  const panel: NativePanel = {
    summaryVersion: version,
    rows: rows.length,
    selectedRows: 0,
    ignoredRows: 0,
    unidentifiedRows: 0,
    observations: new Map(),
  };
  const contexts = new Map(
    plan.contexts.map((context) => [
      contextKey(context.promptIdx, context.providerId, context.providerLabel),
      context,
    ]),
  );
  const families = new Map(plan.families.map((family) => [family.id, new Set(family.variants)]));
  const identities = new NativeIdentities();
  for (let index = 0; index < rows.length; index++) {
    work.spend();
    const row = own(rows, String(index));
    if (!isRecord(row)) {
      throw new Error('Native result rows must be objects');
    }
    const promptIdx = own(row, 'promptIdx');
    const provider = own(row, 'provider');
    const providerId = own(provider, 'id');
    const label = own(provider, 'label');
    if (
      !Number.isSafeInteger(promptIdx) ||
      (promptIdx as number) < 0 ||
      !boundedIdentityString(providerId, 4096, work) ||
      providerId.length === 0 ||
      (label !== undefined && !boundedIdentityString(label, 4096, work))
    ) {
      throw new Error('Native result has an invalid context selector');
    }
    const context = contexts.get(
      contextKey(promptIdx as number, providerId, label as string | undefined),
    );
    if (!context) {
      panel.ignoredRows += 1;
      continue;
    }
    const identity = own(own(own(row, 'testCase'), 'metadata'), 'metamorphic');
    if (identity === undefined) {
      panel.unidentifiedRows += 1;
      continue;
    }
    if (
      !isRecord(identity) ||
      !boundedIdentityString(own(identity, 'familyId'), 128, work) ||
      !boundedIdentityString(own(identity, 'variantId'), 128, work)
    ) {
      throw new Error(
        'Native testCase metamorphic identity must contain string familyId and variantId',
      );
    }
    const familyId = own(identity, 'familyId') as string;
    const variantId = own(identity, 'variantId') as string;
    if (!familyId || !variantId) {
      throw new Error('Native metamorphic family and variant IDs must be nonempty');
    }
    const variants = families.get(familyId);
    if (!variants) {
      panel.ignoredRows += 1;
      continue;
    }
    if (!variants.has(variantId)) {
      throw new Error('Selected native family contains an undeclared variant');
    }
    const nativeRepeat = own(row, 'repeatIndex');
    const repetition = validateRepeatIndex(nativeRepeat, plan.repetitions);
    const { promptId, repeatGroupId } = identities.validate(
      row,
      context.id,
      familyId,
      variantId,
      work,
    );
    const key = slotKey(context.id, familyId, variantId, repetition as number);
    if (panel.observations.has(key)) {
      throw new Error(
        'Duplicate native observation slot; expanded tests need unique variant identities',
      );
    }
    const response = own(row, 'response');
    if (response !== undefined && !isRecord(response)) {
      throw new Error('Native provider response must be an object when provided');
    }
    panel.observations.set(key, {
      contextId: context.id,
      familyId,
      variantId,
      repetition: repetition as number,
      identity: {
        repeatIndexProvided: nativeRepeat !== undefined,
        repeatGroupProvided: repeatGroupId !== undefined,
        promptIdProvided: promptId !== undefined,
      },
      sourceStatus: nativeSourceStatus(row, response),
      cache: nativeCacheStatus(response),
      output: outputValue(response, limits, work),
      namedScores: scoresValue(row, limits, work),
    });
    panel.selectedRows += 1;
  }
  return panel;
}
