import { isDeepStrictEqual } from 'node:util';

import { and, count, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable, evalsTable } from '../database/tables';
import {
  getStripFlags,
  persistRepeatMetadata,
  persistTraceMetadata,
  projectGradingResult,
  projectOutputMetadata,
  projectPrompt,
  projectProviderResponse,
  projectTestCase,
  redactSensitiveResultFieldsForDb,
  sanitizeForDb,
  sanitizeForDbWithSecrets,
  sanitizeGradingResultForDb,
  sanitizeProvider,
  serializeResultProviderRefs,
  surfaceRepeatMetadata,
  surfaceTraceMetadata,
} from '../evaluator/resultProcessing';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import {
  type AtomicTestCase,
  type EvaluateResult,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type PromptMetrics,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
} from '../types/index';
import { getCurrentTimestamp } from '../util/time';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { invalidateEvaluationCache, notifyEvaluationChanged } from './evalMutation';
import { clearCountCache } from './evalPerformance';

type SubmitRatingAction = 'rate' | 'clear' | 'update';
type SubmitRatingUpdate = 'score' | 'comment';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type ResultMetricCategory = 'pass' | 'fail' | 'error';
type PersistedEvalResult = typeof evalResultsTable.$inferSelect;
type RatingEvalResult = Pick<
  PersistedEvalResult,
  | 'error'
  | 'failureReason'
  | 'gradingResult'
  | 'manualRatingState'
  | 'metadata'
  | 'promptIdx'
  | 'response'
  | 'score'
  | 'success'
  | 'testCase'
>;

const HUMAN_ASSERTION_TYPE = 'human';
const MANUAL_RATING_REASON = 'Manual result (overrides all other grading results)';

const ManualRatingStateSchema = z.object({
  version: z.literal(1),
  // Retain the previous private baseline shape when reading already persisted results.
  status: z.enum(['baseline', 'active', 'legacy-active', 'cleared']),
  original: z.object({
    success: z.boolean(),
    score: z.number(),
    failureReason: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    comparisonCount: z.number().int().nonnegative().optional(),
    gradingResult: z
      .object({
        pass: z.boolean(),
        score: z.number(),
        reason: z.unknown().optional(),
        assertion: z.unknown().optional(),
        hadReason: z.boolean(),
        hadAssertion: z.boolean(),
        hadComponentResults: z.boolean(),
      })
      .nullable(),
  }),
});

type ManualRatingState = z.infer<typeof ManualRatingStateSchema>;

function normalizeFailureReason(value: number): ResultFailureReason {
  return isResultFailureReason(value) ? value : ResultFailureReason.NONE;
}

function isHumanAssertion(assertion: unknown): boolean {
  return asRecord(assertion)?.type === HUMAN_ASSERTION_TYPE;
}

function isHumanGradingResult(value: unknown): value is GradingResult {
  return isHumanAssertion(asRecord(value)?.assertion);
}

function getHumanGradingResult(
  gradingResult: GradingResult | null | undefined,
): GradingResult | undefined {
  const human = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults.find(isHumanGradingResult)
    : undefined;
  return human ?? (isHumanGradingResult(gradingResult) ? gradingResult : undefined);
}

function getManualRatingFailureReason(
  gradingResult: GradingResult | null,
): ResultFailureReason | undefined {
  const originalFailureReason =
    getHumanGradingResult(gradingResult)?.metadata?.originalFailureReason;
  return typeof originalFailureReason === 'number' && isResultFailureReason(originalFailureReason)
    ? originalFailureReason
    : undefined;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseManualRatingState(value: unknown): ManualRatingState | undefined {
  const parsed = ManualRatingStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function captureManualRatingState(
  result: Pick<RatingEvalResult, 'failureReason' | 'gradingResult' | 'score' | 'success'>,
): ManualRatingState {
  const gradingResult = result.gradingResult;
  return {
    version: 1,
    status: 'active',
    original: {
      success: result.success,
      score: result.score,
      failureReason:
        getManualRatingFailureReason(gradingResult) ?? normalizeFailureReason(result.failureReason),
      comparisonCount: getCompletedComparisons(gradingResult).length,
      gradingResult: gradingResult
        ? {
            pass: gradingResult.pass,
            score: gradingResult.score,
            reason: gradingResult.reason,
            assertion: gradingResult.assertion,
            hadReason: hasOwn(gradingResult, 'reason'),
            hadAssertion: hasOwn(gradingResult, 'assertion'),
            hadComponentResults: hasOwn(gradingResult, 'componentResults'),
          }
        : null,
    },
  };
}

function getCompletedComparisons(gradingResult: GradingResult | null): GradingResult[] {
  if (!Array.isArray(gradingResult?.componentResults)) {
    return [];
  }
  return gradingResult.componentResults.filter((component) => {
    const record = asRecord(component);
    const type = asRecord(record?.assertion)?.type;
    return (
      (type === 'max-score' || type === 'select-best') &&
      typeof record?.pass === 'boolean' &&
      Number.isFinite(record.score)
    );
  });
}

function includeLaterComparisons(
  state: ManualRatingState,
  gradingResult: GradingResult,
): ManualRatingState {
  // Older private states do not record which comparisons preceded the rating.
  if (state.original.comparisonCount === undefined) {
    return state;
  }
  const comparisons = getCompletedComparisons(gradingResult);
  // Comparisons already present at capture may have been followed by an intentional
  // score edit. Only replay verdicts that completed while the rating was active.
  const laterComparisons = comparisons.slice(state.original.comparisonCount);
  if (laterComparisons.length === 0) {
    return state;
  }
  const original = {
    ...state.original,
    comparisonCount: comparisons.length,
    gradingResult: state.original.gradingResult
      ? { ...state.original.gradingResult }
      : {
          pass: state.original.success,
          score: state.original.score,
          reason:
            laterComparisons[0].assertion?.type === 'select-best' ? laterComparisons[0].reason : '',
          assertion: laterComparisons[0].assertion,
          hadReason: true,
          hadAssertion: true,
          hadComponentResults: true,
        },
  };
  original.gradingResult.hadComponentResults = true;
  for (const comparison of laterComparisons) {
    const previousPass = original.success;
    if (!comparison.pass) {
      original.success = original.gradingResult.pass = false;
      original.score = original.gradingResult.score = comparison.score;
      if (previousPass) {
        original.failureReason = ResultFailureReason.ASSERT;
      }
      if (previousPass || comparison.assertion?.type === 'select-best') {
        original.gradingResult.reason = comparison.reason;
        original.gradingResult.hadReason = true;
      }
    }
    if (comparison.assertion?.type === 'max-score') {
      original.gradingResult.reason ??= '';
      original.gradingResult.hadReason = true;
      original.gradingResult.assertion = comparison.assertion;
      original.gradingResult.hadAssertion = true;
    }
  }
  return { ...state, original };
}

function restoreOriginalGradingResult(
  gradingResult: GradingResult,
  state: ManualRatingState,
): GradingResult | null {
  const original = state.original.gradingResult;
  if (!original) {
    return gradingResult.comment === undefined
      ? null
      : {
          pass: state.original.success,
          score: state.original.score,
          reason: '',
          comment: gradingResult.comment,
        };
  }
  const restored = { ...gradingResult } as GradingResult;
  const restoredRecord = restored as unknown as Record<string, unknown>;
  if (Array.isArray(restored.componentResults)) {
    restored.componentResults = restored.componentResults.filter(
      (componentResult) => !isHumanGradingResult(componentResult),
    );
  }

  restored.pass = original.pass;
  restored.score = original.score;
  if (original.hadReason) {
    restoredRecord.reason = original.reason;
  } else {
    delete restoredRecord.reason;
  }
  if (original.hadAssertion) {
    restoredRecord.assertion = original.assertion;
  } else {
    delete restored.assertion;
  }
  if (!original.hadComponentResults) {
    delete restored.componentResults;
  }

  return restored;
}

function hasManualRating(gradingResult: GradingResult | null | undefined): boolean {
  return Boolean(getHumanGradingResult(gradingResult));
}

function inferLegacyRatingUpdate(
  result: RatingEvalResult,
  submitted: GradingResult,
): SubmitRatingUpdate | undefined {
  if (
    (isHumanAssertion(submitted.assertion) && !isHumanAssertion(result.gradingResult?.assertion)) ||
    submitted.pass !== result.success
  ) {
    return undefined;
  }
  const previousHuman = getHumanGradingResult(result.gradingResult);
  const submittedHuman = getHumanGradingResult(submitted);
  if (
    !previousHuman ||
    !submittedHuman ||
    previousHuman.pass !== submittedHuman.pass ||
    previousHuman.score !== submittedHuman.score ||
    !isDeepStrictEqual(previousHuman.reason, submittedHuman.reason)
  ) {
    return undefined;
  }
  if (submitted.score === result.score) {
    return 'comment';
  }
  return submitted.reason === MANUAL_RATING_REASON ? 'score' : undefined;
}

function applyRatingFieldUpdate(
  previous: GradingResult | null,
  submitted: GradingResult,
  previousSuccess: boolean,
  previousScore: number,
  ratingUpdate: SubmitRatingUpdate,
  preserveHumanScore: boolean,
): GradingResult {
  const changes =
    ratingUpdate === 'score' ? { score: submitted.score } : { comment: submitted.comment };
  const updated = {
    ...previous,
    pass: previousSuccess,
    score: previousScore,
    ...changes,
  } as GradingResult;
  if (Array.isArray(previous?.componentResults)) {
    updated.componentResults = previous.componentResults.map((component) =>
      isHumanGradingResult(component) && !(ratingUpdate === 'score' && preserveHumanScore)
        ? { ...component, ...changes }
        : component,
    );
  }
  return updated;
}

function normalizeRatingSubmission(
  previous: GradingResult | null,
  submitted: GradingResult,
  previousSuccess: boolean,
  originalFailureReason: ResultFailureReason,
  ratingAction?: SubmitRatingAction,
): {
  gradingResult: GradingResult;
  clearingManualRating: boolean;
  hasManualRating: boolean;
} {
  const previousComponents = Array.isArray(previous?.componentResults)
    ? previous.componentResults
    : [];
  const previousAutomatedComponents = previousComponents.filter(
    (componentResult) => !isHumanGradingResult(componentResult),
  );
  const submittedHasComponents = Array.isArray(submitted.componentResults);
  const submittedComponents = Array.isArray(submitted.componentResults)
    ? submitted.componentResults
    : previousComponents;
  const explicitHumanComponent =
    ratingAction === 'clear' ? undefined : submittedComponents.find(isHumanGradingResult);
  const explicitTopLevelHuman = ratingAction !== 'clear' && isHumanAssertion(submitted.assertion);
  const previousHasManualRating = hasManualRating(previous);
  const clearingManualRating =
    previousHasManualRating &&
    (ratingAction === 'clear' ||
      (ratingAction === undefined &&
        submittedHasComponents &&
        !explicitHumanComponent &&
        !explicitTopLevelHuman));
  const outcomeChanged = previousSuccess !== submitted.pass;
  const shouldHaveManualRating =
    ratingAction !== 'clear' &&
    !clearingManualRating &&
    (ratingAction === 'rate' ||
      Boolean(explicitHumanComponent) ||
      explicitTopLevelHuman ||
      previousHasManualRating ||
      outcomeChanged);
  const gradingResult = { ...(previous ?? {}), ...submitted } as GradingResult;

  if (!shouldHaveManualRating) {
    if (previous && (submittedHasComponents || ratingAction === 'clear')) {
      gradingResult.componentResults = previousAutomatedComponents;
    }
    if (clearingManualRating || ratingAction === 'clear') {
      if (isHumanAssertion(gradingResult.assertion)) {
        delete gradingResult.assertion;
      }
    }
    return { gradingResult, clearingManualRating, hasManualRating: false };
  }

  const previousHumanComponent = previousComponents.find(isHumanGradingResult);
  const humanSource =
    explicitHumanComponent ?? (explicitTopLevelHuman ? submitted : previousHumanComponent);
  const manualReason = hasOwn(submitted, 'reason')
    ? submitted.reason
    : (humanSource?.reason ?? MANUAL_RATING_REASON);
  const humanRating = {
    ...(humanSource ?? {}),
    pass: submitted.pass,
    score: submitted.score,
    reason: manualReason,
    metadata: { ...humanSource?.metadata, originalFailureReason },
    assertion: {
      ...(asRecord(humanSource?.assertion) ?? {}),
      type: HUMAN_ASSERTION_TYPE,
    },
  } as GradingResult;

  if (hasOwn(submitted, 'comment')) {
    humanRating.comment = submitted.comment;
  }
  gradingResult.pass = submitted.pass;
  gradingResult.score = submitted.score;
  gradingResult.reason = manualReason;
  gradingResult.componentResults = [
    // Non-human components are evaluation output, not rating input. A result without a
    // server baseline must not let a rating request invent assertions that alter metrics.
    ...previousAutomatedComponents,
    humanRating,
  ];
  if (isHumanAssertion(gradingResult.assertion)) {
    delete gradingResult.assertion;
  }

  return { gradingResult, clearingManualRating: false, hasManualRating: true };
}

function hasExecutionError(result: RatingEvalResult, hasAutomatedComponents: boolean): boolean {
  const failureReason = normalizeFailureReason(result.failureReason);
  const responseError = asRecord(result.response)?.error;
  if (
    failureReason === ResultFailureReason.ERROR ||
    (typeof responseError === 'string' && responseError.length > 0)
  ) {
    return true;
  }
  if (failureReason === ResultFailureReason.ASSERT) {
    return false;
  }
  return !hasAutomatedComponents && typeof result.error === 'string' && result.error.length > 0;
}

type AutomatedClearComponent = {
  pass: boolean;
  score: number;
  weight: number;
  failedContentSafetyCheck: boolean;
  comparison: boolean;
};

function getFlattenedChildCount(
  component: Record<string, unknown>,
  rawComponents: unknown[],
  parentIndex: number,
): number {
  if (!Array.isArray(component.componentResults)) {
    return 0;
  }
  const flattenedChildren = component.componentResults.map((child) => {
    const childRecord = asRecord(child);
    return childRecord
      ? { ...childRecord, assertion: childRecord.assertion ?? component.assertion }
      : child;
  });
  return flattenedChildren.every((child, childIndex) =>
    isDeepStrictEqual(rawComponents[parentIndex + childIndex + 1], child),
  )
    ? flattenedChildren.length
    : 0;
}

function getAutomatedClearComponents(componentResults: unknown): AutomatedClearComponent[] {
  const rawComponents = Array.isArray(componentResults) ? componentResults : [];
  const automatedComponents: AutomatedClearComponent[] = [];
  for (let index = 0; index < rawComponents.length; index++) {
    const component = asRecord(rawComponents[index]);
    if (!component || isHumanAssertion(component.assertion)) {
      continue;
    }
    const assertion = asRecord(component.assertion);
    const assertionSet = asRecord(asRecord(component.metadata)?.assertionSet);
    const rawWeight = assertionSet?.weight ?? assertion?.weight ?? 1;
    if (
      typeof component.pass === 'boolean' &&
      typeof component.score === 'number' &&
      Number.isFinite(component.score)
    ) {
      automatedComponents.push({
        pass: component.pass,
        score: component.score,
        weight: typeof rawWeight === 'number' && Number.isFinite(rawWeight) ? rawWeight : 1,
        failedContentSafetyCheck:
          component.pass === false &&
          assertion?.type === 'guardrails' &&
          asRecord(assertion.config)?.purpose === 'redteam',
        comparison:
          assertion?.type === 'max-score' ||
          (typeof assertion?.type === 'string' && assertion.type.startsWith('select-')),
      });
    }
    // Assertion-set children are flattened after their aggregate parent for display. The
    // evaluator weights only the parent, so skip the duplicated children here too.
    index += getFlattenedChildCount(component, rawComponents, index);
  }
  return automatedComponents;
}

function buildServerOwnedClearGradingResult(
  result: RatingEvalResult,
  current: GradingResult,
  normalized: GradingResult,
): GradingResult {
  const automatedComponents = getAutomatedClearComponents(normalized.componentResults);
  const executionError = hasExecutionError(result, automatedComponents.length > 0);
  // Comparisons are merged after ordinary assertion aggregation, never weighted into it.
  const ordinaryComponents = automatedComponents.filter((component) => !component.comparison);
  const totalWeight = ordinaryComponents.reduce((sum, component) => sum + component.weight, 0);
  const totalScore = ordinaryComponents.reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  );
  const automatedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  const testCase = asRecord(result.testCase);
  const threshold = testCase?.threshold;
  let automatedPass =
    typeof threshold === 'number' && Number.isFinite(threshold)
      ? automatedScore >= threshold
      : ordinaryComponents.every((component) => component.pass);
  if (ordinaryComponents.some((component) => component.failedContentSafetyCheck)) {
    automatedPass = true;
  }
  if (executionError) {
    automatedPass = false;
  }
  const hasUnreconstructableRetainedFailure =
    !executionError && automatedPass && typeof result.error === 'string' && result.error.length > 0;
  const fallbackPass =
    !executionError && normalizeFailureReason(result.failureReason) === ResultFailureReason.NONE;
  const canReconstructAutomatedOutcome =
    automatedComponents.length > 0 && !hasOwn(testCase ?? {}, 'assertScoringFunction');
  const cleared = {
    ...current,
    reason: current.reason === MANUAL_RATING_REASON ? 'Manual rating cleared' : current.reason,
    // Without private provenance, missing components or custom scoring need a canonical
    // fallback. Retained failures unexplained by the components remain failures: the public
    // export may have stripped the custom scorer that produced them.
    pass: hasUnreconstructableRetainedFailure
      ? false
      : canReconstructAutomatedOutcome
        ? automatedPass
        : fallbackPass,
    score: hasUnreconstructableRetainedFailure
      ? 0
      : canReconstructAutomatedOutcome
        ? automatedScore
        : fallbackPass
          ? 1
          : 0,
  } as GradingResult;
  // Match the evaluator's final validation, including overflow hidden by a finite quotient.
  if (
    canReconstructAutomatedOutcome &&
    (!Number.isFinite(totalScore) ||
      !Number.isFinite(totalWeight) ||
      !Number.isFinite(automatedScore))
  ) {
    cleared.pass = false;
    cleared.score = 0;
  }
  // Match the evaluator's ordered comparison merge: winners preserve the aggregate,
  // while each failed comparison vetoes success and replaces the current score.
  for (const component of automatedComponents) {
    if (component.comparison && !component.pass) {
      cleared.pass = false;
      cleared.score = component.score;
    }
  }
  if (hasOwn(normalized, 'componentResults')) {
    cleared.componentResults = normalized.componentResults;
  } else {
    delete cleared.componentResults;
  }
  if (isHumanAssertion(cleared.assertion)) {
    delete cleared.assertion;
  }
  return cleared;
}

function resolveClearingManualRating(
  result: RatingEvalResult,
  existingState: ManualRatingState | undefined,
  clearRestoreBase: GradingResult,
  normalizedGradingResult: GradingResult,
) {
  if (existingState?.status === 'active') {
    const restoredState = includeLaterComparisons(existingState, clearRestoreBase);
    return {
      gradingResult: restoreOriginalGradingResult(clearRestoreBase, restoredState),
      success: restoredState.original.success,
      score: restoredState.original.score,
      failureReason: restoredState.original.failureReason,
      nextState: {
        ...restoredState,
        status: 'cleared' as const,
      },
    };
  }
  // Edits normalize the category; legacy clear still needs its retained provenance.
  const originalFailureReason =
    existingState?.status === 'legacy-active'
      ? existingState.original.failureReason
      : getManualRatingFailureReason(result.gradingResult);
  const originalResult =
    originalFailureReason === undefined
      ? result
      : { ...result, failureReason: originalFailureReason };
  const clearedGradingResult = result.gradingResult
    ? buildServerOwnedClearGradingResult(
        originalResult,
        result.gradingResult,
        normalizedGradingResult,
      )
    : normalizedGradingResult;
  const success = clearedGradingResult.pass;
  const score = clearedGradingResult.score;
  const failureReason = hasExecutionError(
    originalResult,
    getAutomatedClearComponents(clearedGradingResult.componentResults).length > 0,
  )
    ? ResultFailureReason.ERROR
    : success
      ? ResultFailureReason.NONE
      : ResultFailureReason.ASSERT;
  return {
    gradingResult: clearedGradingResult,
    success,
    score,
    failureReason,
    nextState: {
      ...(existingState?.status === 'legacy-active'
        ? existingState
        : captureManualRatingState({
            ...result,
            failureReason,
            gradingResult: clearedGradingResult,
            score,
            success,
          })),
      status: 'cleared' as const,
    },
  };
}

function resolveRatingTransition(
  result: RatingEvalResult,
  submittedGradingResult: GradingResult,
  ratingAction?: SubmitRatingAction,
  ratingUpdate?: SubmitRatingUpdate,
): {
  gradingResult: GradingResult | null;
  success: boolean;
  score: number;
  failureReason: ResultFailureReason;
  manualRatingState: ManualRatingState | null;
} {
  const previousHasManualRating = hasManualRating(result.gradingResult);
  const existingState = parseManualRatingState(result.manualRatingState);
  const isLegacyClearedUpdate =
    ratingAction === undefined &&
    !previousHasManualRating &&
    existingState?.status === 'cleared' &&
    !hasManualRating(submittedGradingResult) &&
    (hasOwn(submittedGradingResult, 'comment') ||
      Array.isArray(submittedGradingResult.componentResults) ||
      submittedGradingResult.reason === MANUAL_RATING_REASON);
  const legacyUpdate =
    ratingAction === undefined
      ? inferLegacyRatingUpdate(result, submittedGradingResult)
      : undefined;
  let update = ratingAction === 'update' ? (ratingUpdate ?? 'comment') : legacyUpdate;
  if (isLegacyClearedUpdate) {
    // Old clients retain stale outcomes after clearing. Only their annotations and marked
    // score edits are meaningful in these full payloads. Bare API pass/score edits retain
    // their inferred behavior; callers can also provide a human assertion or explicit intent.
    // Payload equality cannot distinguish a delayed clear from an intentional comment revert.
    if ((result.gradingResult?.comment ?? '') !== (submittedGradingResult.comment ?? '')) {
      update = 'comment';
    } else if (
      submittedGradingResult.reason === MANUAL_RATING_REASON &&
      submittedGradingResult.score !== result.score
    ) {
      update = 'score';
    }
  }
  const stateToRestore =
    !previousHasManualRating && existingState?.status === 'active' && ratingAction === 'clear'
      ? existingState
      : undefined;
  if (
    (isLegacyClearedUpdate && !update) ||
    (!previousHasManualRating && ratingAction === 'clear' && !stateToRestore)
  ) {
    return {
      gradingResult: result.gradingResult,
      success: result.success,
      score: result.score,
      failureReason: normalizeFailureReason(result.failureReason),
      manualRatingState: existingState ?? null,
    };
  }
  const normalized = update
    ? {
        gradingResult: applyRatingFieldUpdate(
          result.gradingResult,
          submittedGradingResult,
          result.success,
          result.score,
          update,
          legacyUpdate === 'score',
        ),
        clearingManualRating: false,
        hasManualRating: previousHasManualRating,
      }
    : normalizeRatingSubmission(
        result.gradingResult,
        submittedGradingResult,
        result.success,
        previousHasManualRating && existingState && existingState.status !== 'cleared'
          ? existingState.original.failureReason
          : (getManualRatingFailureReason(result.gradingResult) ??
              normalizeFailureReason(result.failureReason)),
        ratingAction,
      );
  let nextState: ManualRatingState | undefined;
  let gradingResult: GradingResult | null = normalized.gradingResult;
  let success = gradingResult.pass;
  let score = gradingResult.score;
  let failureReason =
    normalized.hasManualRating && !update
      ? success
        ? ResultFailureReason.NONE
        : ResultFailureReason.ASSERT
      : normalizeFailureReason(result.failureReason);
  const isClearingManualRating = ratingAction === 'clear' || normalized.clearingManualRating;
  const clearRestoreBase =
    result.gradingResult && isClearingManualRating
      ? result.gradingResult
      : normalized.gradingResult;
  if (stateToRestore || normalized.clearingManualRating) {
    const cleared = resolveClearingManualRating(
      result,
      existingState,
      clearRestoreBase,
      normalized.gradingResult,
    );
    ({ gradingResult, success, score, failureReason, nextState } = cleared);
  } else if (!previousHasManualRating && !normalized.hasManualRating) {
    if (existingState?.status === 'cleared' || existingState?.status === 'baseline') {
      nextState = existingState;
    } else if (score !== result.score) {
      // Include a score-only edit in reconciliation when a streaming eval flushes stale totals.
      nextState = { ...captureManualRatingState(result), status: 'baseline' };
    }
  } else if (!previousHasManualRating && normalized.hasManualRating) {
    nextState = captureManualRatingState(result);
  } else if (previousHasManualRating && normalized.hasManualRating) {
    nextState = existingState
      ? existingState.status === 'cleared'
        ? undefined
        : existingState
      : { ...captureManualRatingState(result), status: 'legacy-active' };
  }

  if (gradingResult) {
    gradingResult.pass = success;
    gradingResult.score = score;
  }
  return {
    gradingResult,
    success,
    score,
    failureReason,
    manualRatingState: nextState ?? null,
  };
}

export function countGradingAssertions(gradingResult: GradingResult | null | undefined): {
  pass: number;
  fail: number;
} {
  const componentResults = Array.isArray(gradingResult?.componentResults)
    ? gradingResult.componentResults
    : [];
  const counts = componentResults.reduce(
    (counts, componentResult: unknown) => {
      if (!componentResult || typeof componentResult !== 'object') {
        return counts;
      }
      const { pass } = componentResult as { pass?: unknown };
      if (pass === true) {
        counts.pass += 1;
      } else if (pass === false) {
        counts.fail += 1;
      }
      return counts;
    },
    { pass: 0, fail: 0 },
  );
  if (
    isHumanAssertion(gradingResult?.assertion) &&
    typeof gradingResult?.pass === 'boolean' &&
    !componentResults.some(isHumanGradingResult)
  ) {
    counts[gradingResult?.pass ? 'pass' : 'fail'] += 1;
  }
  return counts;
}

function getResultMetricCategory(
  success: boolean,
  failureReason: ResultFailureReason | number | undefined,
): ResultMetricCategory {
  if (success) {
    return 'pass';
  }
  return failureReason === ResultFailureReason.ERROR ? 'error' : 'fail';
}

function applyResultMetricDelta(
  metrics: PromptMetrics,
  previousCategory: ResultMetricCategory,
  nextCategory: ResultMetricCategory,
): void {
  if (previousCategory === nextCategory) {
    return;
  }

  const updateCategory = (category: ResultMetricCategory, delta: number) => {
    if (category === 'pass') {
      metrics.testPassCount += delta;
    } else if (category === 'error') {
      metrics.testErrorCount += delta;
    } else {
      metrics.testFailCount += delta;
    }
  };
  updateCategory(previousCategory, -1);
  updateCategory(nextCategory, 1);
}

async function submitEvalResultRating(
  evalId: string,
  id: string,
  submittedGradingResult: GradingResult,
  ratingAction?: SubmitRatingAction,
  ratingUpdate?: SubmitRatingUpdate,
) {
  const db = await getDb();
  const transactionResult = await db.transaction(async (tx) => {
    const result = await tx
      .select()
      .from(evalResultsTable)
      .where(and(eq(evalResultsTable.id, id), eq(evalResultsTable.evalId, evalId)))
      .get();
    if (!result) {
      return { status: 'result-not-found' as const };
    }

    const evalRow = await tx
      .select({ prompts: evalsTable.prompts })
      .from(evalsTable)
      .where(eq(evalsTable.id, evalId))
      .get();
    if (!evalRow) {
      return { status: 'eval-not-found' as const };
    }

    const transition = serializeResultProviderRefs(
      resolveRatingTransition(result, submittedGradingResult, ratingAction, ratingUpdate),
    );
    // This transaction bypasses save(), so apply the same persistence redactors
    // before comparing or returning data, including the private restore snapshot.
    transition.gradingResult = sanitizeGradingResultForDb(transition.gradingResult);
    if (transition.manualRatingState) {
      const original = serializeResultProviderRefs(transition.manualRatingState.original);
      transition.manualRatingState = {
        ...transition.manualRatingState,
        original: {
          ...original,
          gradingResult: sanitizeGradingResultForDb(original.gradingResult),
        },
      };
    }
    const transitionChanged =
      result.success !== transition.success ||
      result.score !== transition.score ||
      normalizeFailureReason(result.failureReason) !== transition.failureReason ||
      !isDeepStrictEqual(result.gradingResult, transition.gradingResult) ||
      !isDeepStrictEqual(result.manualRatingState, transition.manualRatingState);
    if (!transitionChanged) {
      return { status: 'unchanged' as const, result };
    }

    const prompts = evalRow.prompts ?? [];
    const prompt = prompts[result.promptIdx];
    if (!prompt) {
      throw new Error('Prompt not found');
    }
    if (!prompt.metrics) {
      logger.error(
        `[${id}] This is not normal. Prompt metrics not found for prompt ${result.promptIdx}`,
      );
      return { status: 'prompt-metrics-not-found' as const };
    }

    const previousCategory = getResultMetricCategory(result.success, result.failureReason);
    const previousAssertions = countGradingAssertions(result.gradingResult);
    const nextAssertions = countGradingAssertions(transition.gradingResult);
    const nextCategory = getResultMetricCategory(transition.success, transition.failureReason);

    if (prompt.metrics.testErrorCount == null) {
      const errors = await tx
        .select({ count: count() })
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            eq(evalResultsTable.promptIdx, result.promptIdx),
            eq(evalResultsTable.success, false),
            eq(evalResultsTable.failureReason, ResultFailureReason.ERROR),
          ),
        )
        .get();
      prompt.metrics.testErrorCount = errors?.count ?? 0;
    }
    prompt.metrics.score += transition.score - result.score;
    applyResultMetricDelta(prompt.metrics, previousCategory, nextCategory);
    prompt.metrics.assertPassCount += nextAssertions.pass - previousAssertions.pass;
    prompt.metrics.assertFailCount += nextAssertions.fail - previousAssertions.fail;

    const persistedResult = await tx
      .update(evalResultsTable)
      .set({
        gradingResult: transition.gradingResult,
        success: transition.success,
        score: transition.score,
        failureReason: transition.failureReason,
        manualRatingState: transition.manualRatingState,
        updatedAt: getCurrentTimestamp(),
      })
      .where(and(eq(evalResultsTable.id, id), eq(evalResultsTable.evalId, evalId)))
      .returning()
      .get();
    if (!persistedResult) {
      throw new Error('Result disappeared while submitting rating');
    }

    const evalUpdate = await tx
      .update(evalsTable)
      .set({ prompts })
      .where(eq(evalsTable.id, evalId))
      .run();
    if (evalUpdate.rowsAffected !== 1) {
      throw new Error('Eval disappeared while submitting rating');
    }

    return { status: 'updated' as const, result: persistedResult };
  });

  if (transactionResult.status === 'updated') {
    notifyEvaluationChanged(evalId);
  }
  return transactionResult;
}

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
      traceId,
      evaluationId,
      repeatIndex,
      repeatGroupId,
    } = serializeResultProviderRefs(result);

    // Persist trace and repeat linkage inside a private metadata namespace so they
    // survive EvalResult round-trips without a Drizzle schema migration.
    const persistedMetadata = persistTraceMetadata(
      persistRepeatMetadata(metadata, repeatIndex, repeatGroupId),
      traceId,
      evaluationId,
    );

    const processedResponse = await extractAndStoreBinaryData(result.response, {
      evalId,
      testIdx: result.testIdx,
      promptIdx: result.promptIdx,
    });
    const sanitizedGradingResult = sanitizeForDb(gradingResult || null);

    // Sanitize all JSON fields to remove circular references and non-serializable values.
    // `testCase` and `prompt` can contain a resolved runtime provider under
    // `options.provider` or `config.provider` (used for llm-rubric judging); that
    // provider may hold a live SDK client with credentials (Anthropic apiKey, etc.)
    // and circular references — see `sanitizeForDbWithSecrets`. Other fields go
    // through the lighter `sanitizeForDb` which only strips circular refs /
    // non-serializable values.
    const args = {
      id: crypto.randomUUID(),
      evalId,
      testCase: sanitizeForDbWithSecrets(testCase),
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt: sanitizeForDbWithSecrets(prompt),
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: sanitizeForDb(processedResponse || null),
      gradingResult: sanitizedGradingResult,
      namedScores: sanitizeForDb(namedScores),
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata: sanitizeForDb(persistedMetadata),
      manualRatingState: null,
      failureReason,
    };
    if (persist) {
      const db = await getDb();

      const redacted = redactSensitiveResultFieldsForDb({
        response: args.response,
        gradingResult: args.gradingResult,
        metadata: args.metadata,
      });
      args.response = redacted.response;
      args.gradingResult = redacted.gradingResult;
      args.metadata = redacted.metadata;
      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      clearCountCache(evalId);
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const db = await getDb();
    const returnResults: EvalResult[] = [];
    const processedResults: EvaluateResult[] = [];
    for (const result of results) {
      const processedResponse = isBlobStorageEnabled()
        ? await extractAndStoreBinaryData(result.response, {
            evalId,
            testIdx: result.testIdx,
            promptIdx: result.promptIdx,
          })
        : result.response;
      processedResults.push({
        ...serializeResultProviderRefs(result),
        response: processedResponse ?? undefined,
      });
    }

    await db.transaction(async (tx) => {
      for (const result of processedResults) {
        // See `createFromEvaluateResult` for why `testCase` and `prompt` go
        // through the credential-redacting sanitizer while the other fields
        // stay on the lighter `sanitizeForDb`. Trace and repeat linkage travel inside
        // metadata; strip the top-level fields so the DB write only carries known-schema columns.
        const {
          traceId: _traceId,
          evaluationId: _evaluationId,
          repeatIndex: _repeatIndex,
          repeatGroupId: _repeatGroupId,
          manualRatingState: _manualRatingState,
          ...rest
        } = result as EvaluateResult & { manualRatingState?: unknown };
        const sanitizedResult = {
          ...rest,
          testCase: sanitizeForDbWithSecrets(result.testCase),
          prompt: sanitizeForDbWithSecrets(result.prompt),
          ...redactSensitiveResultFieldsForDb({
            response: sanitizeForDb(result.response),
            gradingResult: sanitizeForDb(result.gradingResult),
            metadata: sanitizeForDb(
              persistTraceMetadata(
                persistRepeatMetadata(result.metadata, result.repeatIndex, result.repeatGroupId),
                result.traceId,
                result.evaluationId,
              ),
            ),
          }),
          namedScores: sanitizeForDb(result.namedScores),
          provider: result.provider ? sanitizeProvider(result.provider) : result.provider,
          manualRatingState: null,
        };
        const dbResult = await tx
          .insert(evalResultsTable)
          .values({ ...sanitizedResult, evalId, id: crypto.randomUUID() })
          .returning()
          .get();
        returnResults.push(new EvalResult({ ...dbResult, persisted: true }));
      }
    });
    clearCountCache(evalId);
    return returnResults;
  }

  static async findById(id: string) {
    const db = await getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async submitRating(
    evalId: string,
    id: string,
    gradingResult: GradingResult,
    ratingAction?: SubmitRatingAction,
    ratingUpdate?: SubmitRatingUpdate,
  ) {
    const result = await submitEvalResultRating(
      evalId,
      id,
      gradingResult,
      ratingAction,
      ratingUpdate,
    );
    return result.status === 'updated' || result.status === 'unchanged'
      ? { ...result, result: new EvalResult({ ...result.result, persisted: true }) }
      : result;
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const db = await getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          opts?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, opts.testIdx),
        ),
      );
    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  static async findManyByEvalIdAndTestIndices(evalId: string, testIndices: number[]) {
    if (!testIndices.length) {
      return [];
    }

    const db = await getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          testIndices.length === 1
            ? eq(evalResultsTable.testIdx, testIndices[0])
            : inArray(evalResultsTable.testIdx, testIndices),
        ),
      );

    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  /**
   * Returns a set of completed (testIdx,promptIdx) pairs for a given eval.
   * Key format: `${testIdx}:${promptIdx}`
   *
   * @param evalId - The evaluation ID to query
   * @param opts.excludeErrors - If true, excludes results with ERROR failureReason (used in retry mode)
   */
  static async getCompletedIndexPairs(
    evalId: string,
    opts?: { excludeErrors?: boolean },
  ): Promise<Set<string>> {
    const db = await getDb();
    const whereClause = opts?.excludeErrors
      ? and(
          eq(evalResultsTable.evalId, evalId),
          // Exclude ERROR results so they can be retried
          // This prevents resume mode from skipping ERROR results during retry
          ne(evalResultsTable.failureReason, ResultFailureReason.ERROR),
        )
      : eq(evalResultsTable.evalId, evalId);

    const rows = await db
      .select({ testIdx: evalResultsTable.testIdx, promptIdx: evalResultsTable.promptIdx })
      .from(evalResultsTable)
      .where(whereClause);
    const ret = new Set<string>();
    for (const r of rows) {
      ret.add(`${r.testIdx}:${r.promptIdx}`);
    }
    return ret;
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    const db = await getDb();
    const batchSize = opts?.batchSize || 100;
    let offset = 0;

    while (true) {
      const nextResult = await db
        .select({ testIdx: evalResultsTable.testIdx })
        .from(evalResultsTable)
        .where(and(eq(evalResultsTable.evalId, evalId), gte(evalResultsTable.testIdx, offset)))
        .orderBy(evalResultsTable.testIdx)
        .limit(1)
        .get();

      if (!nextResult) {
        break;
      }

      offset = nextResult.testIdx;
      const results = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            gte(evalResultsTable.testIdx, offset),
            lt(evalResultsTable.testIdx, offset + batchSize),
          ),
        )
        .all();

      yield results.map((result) => new EvalResult({ ...result, persisted: true }));
      offset += batchSize;
    }
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  success: boolean;
  score: number;
  response: ProviderResponse | undefined;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
  // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
  metadata: Record<string, any>;
  traceId?: string;
  evaluationId?: string;
  repeatIndex?: number;
  repeatGroupId?: string;
  failureReason: ResultFailureReason;
  persisted: boolean;
  pluginId?: string;
  #legacyComparisonCount?: number;

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    success: boolean;
    score: number;
    response: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
    // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
    metadata?: Record<string, any> | null;
    manualRatingState?: unknown;
    failureReason: ResultFailureReason | number;
    persisted?: boolean;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testIdx = opts.testIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.score = opts.score;
    this.success = opts.success;
    this.response = opts.response || undefined;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    const surfacedTrace = surfaceTraceMetadata(opts.metadata);
    const surfacedRepeat = surfaceRepeatMetadata(surfacedTrace.metadata);
    this.metadata = surfacedRepeat.metadata;
    this.traceId = surfacedTrace.traceId;
    this.evaluationId = surfacedTrace.evaluationId;
    this.repeatIndex = surfacedRepeat.repeatIndex;
    this.repeatGroupId = surfacedRepeat.repeatGroupId;
    const manualRatingState =
      opts.persisted === true ? parseManualRatingState(opts.manualRatingState) : undefined;
    if (
      manualRatingState?.status === 'active' &&
      manualRatingState.original.comparisonCount === undefined
    ) {
      // Historical states cannot distinguish comparisons already in their snapshot. Start
      // at the loaded boundary so future evaluator appends still participate in a clear.
      this.#legacyComparisonCount = getCompletedComparisons(this.gradingResult).length;
    }
    this.failureReason = isResultFailureReason(opts.failureReason)
      ? opts.failureReason
      : ResultFailureReason.NONE;
    this.persisted = opts.persisted || false;
    this.pluginId = opts.testCase.metadata?.pluginId;
  }

  async save() {
    const db = await getDb();
    // Trace/repeat linkage and `pluginId` aren't schema columns — `pluginId` is re-derived
    // from testCase metadata, while linkage travels inside the metadata JSON. Drizzle would
    // drop them silently, but excluding them explicitly keeps the payload aligned with the schema.
    const {
      traceId: _traceId,
      evaluationId: _evaluationId,
      repeatIndex: _repeatIndex,
      repeatGroupId: _repeatGroupId,
      pluginId: _pluginId,
      ...rest
    } = serializeResultProviderRefs(this);
    const persistedValues = {
      ...rest,
      error: this.error ?? null,
      gradingResult: sanitizeGradingResultForDb(rest.gradingResult),
      metadata: persistTraceMetadata(
        persistRepeatMetadata(this.metadata, this.repeatIndex, this.repeatGroupId),
        this.traceId,
        this.evaluationId,
      ),
    };
    //check if this exists in the db
    if (this.persisted) {
      await db
        .update(evalResultsTable)
        .set({
          ...persistedValues,
          // Rating transactions own the baseline. Only initialize a missing historical
          // comparison boundary, without replacing any concurrently updated state.
          ...(this.#legacyComparisonCount !== undefined && {
            manualRatingState: sql`
              CASE WHEN json_extract(${evalResultsTable.manualRatingState}, '$.status') = 'active'
                THEN json_insert(${evalResultsTable.manualRatingState}, '$.original.comparisonCount', ${this.#legacyComparisonCount})
                ELSE ${evalResultsTable.manualRatingState}
              END`,
          }),
          updatedAt: getCurrentTimestamp(),
        })
        .where(eq(evalResultsTable.id, this.id))
        .run();
    } else {
      const result = await db
        .insert(evalResultsTable)
        .values({ ...persistedValues, manualRatingState: null })
        .returning();
      this.id = result[0].id;
      this.persisted = true;
    }
    invalidateEvaluationCache(this.evalId);
  }

  toEvaluateResult(stripFlags = getStripFlags()): EvaluateResult {
    const {
      shouldStripPromptText,
      shouldStripResponseOutput,
      shouldStripTestVars,
      shouldStripGradingResult,
      shouldStripMetadata,
    } = stripFlags;

    const response = projectProviderResponse(this.response, {
      stripMetadata: shouldStripMetadata,
      stripOutput: shouldStripResponseOutput,
    });

    const prompt = projectPrompt(this.prompt, shouldStripPromptText);

    const testCase = projectTestCase(this.testCase, {
      stripMetadata: shouldStripMetadata,
      stripVars: shouldStripTestVars,
      stripOutput: shouldStripResponseOutput,
      stripPromptText: shouldStripPromptText,
    });
    // Mirror the live accounting in the evaluator: a response counts as one provider
    // request even when it reports no token usage, and a grading result counts as one
    // assertion request (with its tokens folded in when present).
    const tokenUsage = createEmptyTokenUsage();
    if (this.response) {
      accumulateResponseTokenUsage(tokenUsage, this.response);
    }
    if (this.gradingResult) {
      accumulateGradingTokenUsage(tokenUsage, this.gradingResult.tokensUsed, {
        cached: this.gradingResult.metadata?.cachedResponse,
      });
    }

    return {
      cost: this.cost,
      ...(this.response?.incurredCost !== undefined && {
        incurredCost: this.response.incurredCost,
      }),
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult
        ? null
        : projectGradingResult(this.gradingResult, shouldStripPromptText),
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...(this.evaluationId ? { evaluationId: this.evaluationId } : {}),
      ...(this.repeatGroupId !== undefined && {
        repeatGroupId: this.repeatGroupId,
        repeatIndex: this.repeatIndex,
      }),
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      tokenUsage,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata
        ? {}
        : projectOutputMetadata(
            this.metadata,
            shouldStripResponseOutput,
            this.response?.metadata,
            this.testCase.metadata,
          ),
      failureReason: this.failureReason,
    };
  }
}

/** Normalize an `EvalResult` model instance or a plain `EvaluateResult` to `EvaluateResult`. */
export function asEvaluateResult(
  result: EvalResult | EvaluateResult,
  stripFlags = getStripFlags(),
): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult(stripFlags) : result;
}

export { getResultIndexKey } from '../evaluator/resultIndex';
// Compatibility exports for existing source consumers. New callers use evaluator/resultProcessing.
export {
  getStripFlags,
  PROMPTFOO_METADATA_KEY,
  persistRepeatMetadata,
  persistTraceMetadata,
  projectPrompt,
  projectTracesForOutput,
  sanitizeProvider,
  sanitizeResultForJsonlArtifact,
  stripRepeatLinkageFromMetadata,
  stripTraceLinkageFromMetadata,
  toSerializableProviderRef,
} from '../evaluator/resultProcessing';
