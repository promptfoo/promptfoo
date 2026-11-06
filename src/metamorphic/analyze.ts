import { resolveLimits, WorkBudget } from './limits';
import { type NativePanel, projectNative, slotKey } from './native';
import { parsePlan } from './plan';
import { evaluateRelation } from './relations';
import { selectValue } from './selectors';

import type {
  AnalysisLimits,
  CheckCounts,
  CheckResult,
  Context,
  Family,
  FamilyRun,
  MetamorphicPlan,
  MetamorphicReport,
  Observation,
  ObservationCounts,
  ObservationEvidence,
  PanelSummary,
  RelationSummary,
  Verdict,
} from './types';

function observationCounts(): ObservationCounts {
  return {
    expected: 0,
    present: 0,
    missing: 0,
    passed: 0,
    assertionFailed: 0,
    executionFailed: 0,
    unknown: 0,
    cached: 0,
    fresh: 0,
    cacheUnknown: 0,
  };
}
function checkCounts(): CheckCounts {
  return { expected: 0, pass: 0, fail: 0, inconclusive: 0 };
}
function addObservation(counts: ObservationCounts, observation: Observation | undefined): void {
  counts.expected += 1;
  if (!observation) {
    counts.missing += 1;
    return;
  }
  counts.present += 1;
  switch (observation.sourceStatus) {
    case 'passed':
      counts.passed += 1;
      break;
    case 'assertion-failed':
      counts.assertionFailed += 1;
      break;
    case 'execution-failed':
      counts.executionFailed += 1;
      break;
    case 'unknown':
      counts.unknown += 1;
      break;
  }
  switch (observation.cache) {
    case 'cached':
      counts.cached += 1;
      break;
    case 'fresh':
      counts.fresh += 1;
      break;
    case 'unknown':
      counts.cacheUnknown += 1;
      break;
  }
}
function addCheck(counts: CheckCounts, verdict: Verdict): void {
  counts.expected += 1;
  counts[verdict] += 1;
}
function verdict(
  checks: CheckCounts,
  observations?: ObservationCounts,
  policy?: MetamorphicPlan['sourceAssertions'],
): Verdict {
  if (
    checks.fail > 0 ||
    (policy === 'require-pass' && observations && observations.assertionFailed > 0)
  ) {
    return 'fail';
  }
  if (
    checks.inconclusive > 0 ||
    (observations &&
      (observations.missing > 0 || observations.executionFailed > 0 || observations.unknown > 0))
  ) {
    return 'inconclusive';
  }
  return 'pass';
}

function observationEvidence(
  observation: Observation | undefined,
  contextId: string,
  familyId: string,
  variantId: string,
  repetition: number,
): ObservationEvidence {
  return {
    contextId: contextId,
    familyId: familyId,
    variantId,
    repetition,
    present: observation !== undefined,
    ...(observation ? { identity: { ...observation.identity } } : {}),
    sourceStatus: observation?.sourceStatus ?? 'missing',
    cache: observation?.cache ?? 'unknown',
    outputAvailable: observation?.output.available === true,
    ...(observation
      ? observation.output.available
        ? {}
        : { outputUnavailableReason: observation.output.reason }
      : { outputUnavailableReason: 'missing-observation' as const }),
    namedScoresAvailable: observation?.namedScores.available === true,
  };
}

interface AnalysisAccumulator {
  observations: ObservationCounts;
  totals: CheckCounts;
  panels: PanelSummary[];
  relations: RelationSummary[];
  checks: CheckResult[];
  evidence: ObservationEvidence[];
  familyRuns: FamilyRun[];
  runTotals: CheckCounts;
}
function analyzeFamily(
  context: Context,
  family: Family,
  plan: MetamorphicPlan,
  native: NativePanel,
  limits: AnalysisLimits,
  work: WorkBudget,
  includeValues: boolean,
  accumulator: AnalysisAccumulator,
): void {
  const { observations, totals, panels, relations, checks, evidence, familyRuns, runTotals } =
    accumulator;
  const panelCounts = observationCounts();
  const panelChecks = checkCounts();
  const runObservations = Array.from({ length: plan.repetitions }, observationCounts);
  const runChecks = Array.from({ length: plan.repetitions }, checkCounts);
  for (const variant of family.variants) {
    for (let repetition = 0; repetition < plan.repetitions; repetition++) {
      work.spend();
      const observation = native.observations.get(
        slotKey(context.id, family.id, variant, repetition),
      );
      evidence.push(observationEvidence(observation, context.id, family.id, variant, repetition));
      addObservation(observations, observation);
      addObservation(panelCounts, observation);
      addObservation(runObservations[repetition], observation);
    }
  }
  for (const relation of family.relations) {
    const relationChecks = checkCounts();
    for (let repetition = 0; repetition < plan.repetitions; repetition++) {
      work.spend();
      const leftObservation = native.observations.get(
        slotKey(context.id, family.id, relation.left, repetition),
      );
      const rightObservation = native.observations.get(
        slotKey(context.id, family.id, relation.right, repetition),
      );
      const left = selectValue(leftObservation, relation.leftSelector, limits, work);
      const right = selectValue(rightObservation, relation.rightSelector, limits, work);
      const result = evaluateRelation(relation, left, right, work);
      const check: CheckResult = {
        contextId: context.id,
        familyId: family.id,
        relationId: relation.id,
        repetition,
        kind: relation.kind,
        left: relation.left,
        right: relation.right,
        ...result,
        selections: {
          left: left.available ? { available: true } : { available: false, reason: left.reason },
          right: right.available ? { available: true } : { available: false, reason: right.reason },
        },
      };
      if (includeValues) {
        check.values = {
          ...(left.available ? { left: left.value } : {}),
          ...(right.available ? { right: right.value } : {}),
        };
      }
      checks.push(check);
      addCheck(totals, result.verdict);
      addCheck(panelChecks, result.verdict);
      addCheck(relationChecks, result.verdict);
      addCheck(runChecks[repetition], result.verdict);
    }
    relations.push({
      contextId: context.id,
      familyId: family.id,
      relationId: relation.id,
      verdict: verdict(relationChecks),
      checks: relationChecks,
    });
  }
  for (let repetition = 0; repetition < plan.repetitions; repetition++) {
    const runVerdict = verdict(
      runChecks[repetition],
      runObservations[repetition],
      plan.sourceAssertions,
    );
    familyRuns.push({
      contextId: context.id,
      familyId: family.id,
      repetition,
      verdict: runVerdict,
      checks: runChecks[repetition],
      observations: runObservations[repetition],
    });
    addCheck(runTotals, runVerdict);
  }
  panels.push({
    contextId: context.id,
    familyId: family.id,
    verdict: verdict(panelChecks, panelCounts, plan.sourceAssertions),
    checks: panelChecks,
    observations: panelCounts,
  });
}

/**
 * Analyze all declared slots. Report detail caps belong to renderers and cannot
 * alter the decision, counts or source-assertion policy used here.
 */
export function analyzeMetamorphic(
  nativeExport: unknown,
  planInput: unknown,
  options: { limits?: Partial<AnalysisLimits>; includeValues?: boolean } = {},
): MetamorphicReport {
  if (options.includeValues !== undefined && typeof options.includeValues !== 'boolean') {
    throw new Error('includeValues must be a boolean');
  }
  const limits = resolveLimits(options.limits);
  const plan = parsePlan(planInput, limits);
  const work = new WorkBudget(limits.maxWork);
  const native = projectNative(nativeExport, plan, limits, work);
  const observations = observationCounts();
  const totals = checkCounts();
  const panels: PanelSummary[] = [];
  const relations: RelationSummary[] = [];
  const checks: CheckResult[] = [];
  const evidence: ObservationEvidence[] = [];
  const familyRuns: FamilyRun[] = [];
  const runTotals = checkCounts();
  const identityCoverage = {
    presentObservations: native.selectedRows,
    repeatIndexProvided: 0,
    repeatGroupProvided: 0,
    promptIdProvided: 0,
  };
  for (const observation of native.observations.values()) {
    identityCoverage.repeatIndexProvided += Number(observation.identity.repeatIndexProvided);
    identityCoverage.repeatGroupProvided += Number(observation.identity.repeatGroupProvided);
    identityCoverage.promptIdProvided += Number(observation.identity.promptIdProvided);
  }
  for (const context of plan.contexts) {
    for (const family of plan.families) {
      analyzeFamily(context, family, plan, native, limits, work, options.includeValues === true, {
        observations,
        totals,
        panels,
        relations,
        checks,
        evidence,
        familyRuns,
        runTotals,
      });
    }
  }
  return {
    version: 1,
    planName: plan.name,
    ...(plan.datasetRevision ? { datasetRevision: plan.datasetRevision } : {}),
    sourceAssertions: plan.sourceAssertions,
    verdict: verdict(totals, observations, plan.sourceAssertions),
    includesValues: options.includeValues === true,
    identityCoverage,
    nativeSummaryVersion: native.summaryVersion,
    input: {
      rows: native.rows,
      selectedRows: native.selectedRows,
      ignoredRows: native.ignoredRows,
      unidentifiedRows: native.unidentifiedRows,
    },
    observations,
    totals,
    runTotals,
    familyRuns,
    panels,
    relations,
    checks,
    evidence,
    limitations: [
      'Relations test exported processed output or named scores; they do not establish semantic correctness.',
      'Input transformations and family identities are declared by the caller and are not validated causally.',
      'Repetitions are matched by index; independence and shared randomness are not inferred.',
      'Native expanded-test and prompt identity checks apply only where those fields are present; see identityCoverage.',
      'Cached observations remain descriptive evidence; missing cache flags mean unknown provenance.',
      'Reports omit source content by default, but logical plan labels remain visible.',
    ],
  };
}
