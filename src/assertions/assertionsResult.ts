import { isDeepStrictEqual } from 'node:util';

import { getEnvBool } from '../envars';
import { isGradingResult } from '../types/index';

import type { AssertionSet, GradingResult, ScoringFunction } from '../types/index';

export const GUARDRAIL_BLOCKED_REASON = 'Content failed guardrail safety checks';

export const DEFAULT_TOKENS_USED = {
  total: 0,
  prompt: 0,
  completion: 0,
  cached: 0,
  numRequests: 0,
};

type AssertionTokenUsage = typeof DEFAULT_TOKENS_USED &
  Pick<NonNullable<GradingResult['tokensUsed']>, 'completionDetails' | 'incurredTokenUsage'>;

interface ParentAssertionSet {
  index: number;
  assertionSet: AssertionSet;
}

function buildAssertionSetMetadata(assertionSet: AssertionSet) {
  return {
    type: assertionSet.type,
    assertionCount: assertionSet.assert.length,
    ...(assertionSet.metric !== undefined && { metric: assertionSet.metric }),
    ...(assertionSet.threshold !== undefined && { threshold: assertionSet.threshold }),
    ...(assertionSet.weight !== undefined && { weight: assertionSet.weight }),
  };
}

function mergeMetadata(
  baseMetadata: GradingResult['metadata'],
  incomingMetadata: GradingResult['metadata'],
): GradingResult['metadata'] | undefined {
  if (!baseMetadata && !incomingMetadata) {
    return undefined;
  }

  return {
    ...incomingMetadata,
    ...baseMetadata,
    ...(baseMetadata?.assertionSet && { assertionSet: baseMetadata.assertionSet }),
  };
}

function normalizeAssertionTokenUsage(result: GradingResult) {
  const tokensUsed = result.tokensUsed;
  if (!tokensUsed) {
    return undefined;
  }

  if (result.metadata?.cachedResponse === true) {
    const reportedTotal =
      tokensUsed.total ?? (tokensUsed.prompt ?? 0) + (tokensUsed.completion ?? 0);
    const logicalTotal = reportedTotal || (tokensUsed.cached ?? 0);
    return {
      ...tokensUsed,
      total: logicalTotal,
      prompt: tokensUsed.prompt ?? 0,
      completion: tokensUsed.completion ?? 0,
      cached: Math.max(tokensUsed.cached ?? 0, logicalTotal),
      numRequests: Math.max(tokensUsed.numRequests ?? 0, 1),
      incurredTokenUsage: { ...DEFAULT_TOKENS_USED },
    };
  }

  return {
    ...tokensUsed,
    ...(result.metadata?.renderedGradingPrompt !== undefined &&
      tokensUsed.numRequests === 0 && { numRequests: 1 }),
  };
}

function accumulateNormalizedAssertionTokenUsage(
  target: NonNullable<GradingResult['tokensUsed']>,
  update: NonNullable<GradingResult['tokensUsed']>,
): void {
  const trackIncurredUsage = Boolean(target.incurredTokenUsage || update.incurredTokenUsage);
  if (trackIncurredUsage && !target.incurredTokenUsage) {
    target.incurredTokenUsage = cloneAssertionTokenUsage(target);
  }

  for (const field of ['total', 'prompt', 'completion', 'cached', 'numRequests'] as const) {
    target[field] = (target[field] ?? 0) + (update[field] ?? 0);
  }

  if (update.completionDetails) {
    const currentDetails = target.completionDetails;
    const incomingDetails = update.completionDetails;
    target.completionDetails = {
      reasoning: (currentDetails?.reasoning ?? 0) + (incomingDetails.reasoning ?? 0),
      acceptedPrediction:
        (currentDetails?.acceptedPrediction ?? 0) + (incomingDetails.acceptedPrediction ?? 0),
      rejectedPrediction:
        (currentDetails?.rejectedPrediction ?? 0) + (incomingDetails.rejectedPrediction ?? 0),
      cacheReadInputTokens:
        (currentDetails?.cacheReadInputTokens ?? 0) + (incomingDetails.cacheReadInputTokens ?? 0),
      cacheCreationInputTokens:
        (currentDetails?.cacheCreationInputTokens ?? 0) +
        (incomingDetails.cacheCreationInputTokens ?? 0),
    };
  }

  if (trackIncurredUsage && target.incurredTokenUsage) {
    accumulateNormalizedAssertionTokenUsage(
      target.incurredTokenUsage,
      update.incurredTokenUsage ?? cloneAssertionTokenUsage(update),
    );
  }
}

function cloneAssertionTokenUsage(
  tokenUsage: NonNullable<GradingResult['tokensUsed']>,
): NonNullable<NonNullable<GradingResult['tokensUsed']>['incurredTokenUsage']> {
  const { incurredTokenUsage: _incurredTokenUsage, ...assertionUsage } = tokenUsage;
  return {
    ...assertionUsage,
    ...(assertionUsage.completionDetails && {
      completionDetails: { ...assertionUsage.completionDetails },
    }),
  };
}

function mergeScoringMetadata(
  baseMetadata: GradingResult['metadata'],
  scoringResult: GradingResult,
  baseTokensUsed: GradingResult['tokensUsed'],
): GradingResult['metadata'] | undefined {
  const metadata = mergeMetadata(baseMetadata, scoringResult.metadata);
  const tokensUsed = scoringResult.tokensUsed;
  const scoringPerformedFreshWork =
    scoringResult.metadata?.cachedResponse !== true &&
    tokensUsed !== undefined &&
    ((tokensUsed.numRequests ?? 0) > 0 ||
      (tokensUsed.total ?? 0) > 0 ||
      (tokensUsed.prompt ?? 0) > 0 ||
      (tokensUsed.completion ?? 0) > 0);

  const componentsPerformedFreshWork =
    baseMetadata?.cachedResponse !== true &&
    ((baseTokensUsed?.numRequests ?? 0) > 0 ||
      (baseTokensUsed?.total ?? 0) > 0 ||
      (baseTokensUsed?.prompt ?? 0) > 0 ||
      (baseTokensUsed?.completion ?? 0) > 0);

  if (
    (!scoringPerformedFreshWork && !componentsPerformedFreshWork) ||
    metadata?.cachedResponse !== true
  ) {
    return metadata;
  }

  const { cachedResponse: _cachedResponse, ...remainingMetadata } = metadata;
  return Object.keys(remainingMetadata).length > 0 ? remainingMetadata : undefined;
}

function mergeScoringTokenUsage(
  baseTokensUsed: GradingResult['tokensUsed'],
  scoringResult: GradingResult,
): GradingResult['tokensUsed'] {
  if (!scoringResult.tokensUsed || scoringResult.tokensUsed === baseTokensUsed) {
    return baseTokensUsed;
  }

  const scoringHasIndependentProvenance =
    scoringResult.metadata?.cachedResponse === true ||
    scoringResult.metadata?.renderedGradingPrompt !== undefined;
  if (
    baseTokensUsed &&
    !scoringHasIndependentProvenance &&
    isDeepStrictEqual(scoringResult.tokensUsed, baseTokensUsed)
  ) {
    return baseTokensUsed;
  }

  const scoringTokensUsed = normalizeAssertionTokenUsage(scoringResult);
  if (!scoringTokensUsed) {
    return baseTokensUsed;
  }

  const mergedTokensUsed = {
    total: baseTokensUsed?.total ?? 0,
    prompt: baseTokensUsed?.prompt ?? 0,
    completion: baseTokensUsed?.completion ?? 0,
    cached: baseTokensUsed?.cached ?? 0,
    numRequests: baseTokensUsed?.numRequests ?? 0,
    ...(baseTokensUsed?.completionDetails && {
      completionDetails: { ...baseTokensUsed.completionDetails },
    }),
    ...(baseTokensUsed?.incurredTokenUsage && {
      incurredTokenUsage: cloneAssertionTokenUsage(baseTokensUsed.incurredTokenUsage),
    }),
  };
  const scorerUsedTokens =
    (scoringTokensUsed.total ?? 0) > 0 ||
    (scoringTokensUsed.prompt ?? 0) > 0 ||
    (scoringTokensUsed.completion ?? 0) > 0;

  accumulateNormalizedAssertionTokenUsage(mergedTokensUsed, {
    ...scoringTokensUsed,
    ...(scoringResult.metadata?.cachedResponse !== true &&
      scorerUsedTokens &&
      !scoringTokensUsed.numRequests && { numRequests: 1 }),
  });

  return mergedTokensUsed;
}

export class AssertionsResult {
  static noAssertsResult(): GradingResult {
    return {
      pass: true,
      score: 1,
      reason: 'No assertions',
      tokensUsed: { ...DEFAULT_TOKENS_USED },
    };
  }

  private tokensUsed: AssertionTokenUsage = {
    ...DEFAULT_TOKENS_USED,
  };
  private threshold: number | undefined;
  private _parentAssertionSet: ParentAssertionSet | undefined;
  private totalScore: number = 0;
  private totalWeight: number = 0;
  private failedReason: string | undefined;
  private componentResults: GradingResult[] = [];
  private namedScores: Record<string, number> = {};
  private namedScoreWeights: Record<string, number> = {};
  private result: GradingResult | null = null;
  private failedContentSafetyChecks: boolean = false;

  constructor({
    threshold,
    parentAssertionSet,
  }: {
    threshold?: number;
    parentAssertionSet?: ParentAssertionSet;
  } = {}) {
    this.threshold = threshold;
    this._parentAssertionSet = parentAssertionSet;
  }

  get parentAssertionSet() {
    return this._parentAssertionSet;
  }

  addResult({
    index,
    result,
    metric,
    weight = 1,
  }: {
    index: number;
    result: GradingResult;
    metric?: string;
    weight?: number;
  }) {
    this.totalScore += result.score * weight;
    this.totalWeight += weight;
    this.componentResults[index] = result;

    const isRedteamGuardrail =
      result.assertion?.type === 'guardrails' && result.assertion?.config?.purpose === 'redteam';

    if (isRedteamGuardrail && !result.pass) {
      this.failedContentSafetyChecks = true;
    }

    if (metric) {
      this.namedScores[metric] = (this.namedScores[metric] || 0) + result.score * weight;
      this.namedScoreWeights[metric] = (this.namedScoreWeights[metric] || 0) + weight;
    }

    if (result.namedScores) {
      Object.entries(result.namedScores).forEach(([metricName, score]) => {
        if (metricName !== metric) {
          const incomingWeight = result.namedScoreWeights?.[metricName] ?? 1;
          const weightedIncomingWeight = incomingWeight * weight;
          this.namedScores[metricName] =
            (this.namedScores[metricName] || 0) + score * weightedIncomingWeight;
          this.namedScoreWeights[metricName] =
            (this.namedScoreWeights[metricName] || 0) + weightedIncomingWeight;
        }
      });
    }

    const tokensUsed = normalizeAssertionTokenUsage(result);
    if (tokensUsed) {
      accumulateNormalizedAssertionTokenUsage(this.tokensUsed, tokensUsed);
    }

    if (result.pass) {
      return;
    }

    this.failedReason = result.reason;

    if (getEnvBool('PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES')) {
      throw new Error(result.reason);
    }
  }

  async testResult(scoringFunction?: ScoringFunction): Promise<GradingResult> {
    if (this.result) {
      return this.result;
    }

    const score = this.totalWeight > 0 ? this.totalScore / this.totalWeight : 0;

    let pass = !this.failedReason;
    let reason = this.failedReason || 'All assertions passed';

    if (typeof this.threshold === 'number' && !Number.isNaN(this.threshold)) {
      // A numeric test threshold overrides the pass/fail status of individual assertions.
      // Gate on `typeof === 'number'` (not a truthy check) so a threshold of 0 is honored —
      // `score >= 0` is always true, i.e. "collect assertion scores but never fail on an
      // individual failure". Guarding on the type (rather than `!== undefined`) keeps a
      // `null`/`NaN` threshold — e.g. an empty `threshold:` in YAML — from silently
      // force-passing every assertion via `score >= null`.
      pass = score >= this.threshold;
      const comparator = pass ? '≥' : '<';
      reason = `Aggregate score ${score.toFixed(2)} ${comparator} ${this.threshold} threshold`;
    }

    if (this.failedContentSafetyChecks) {
      pass = true;
      reason = GUARDRAIL_BLOCKED_REASON;
    }

    // Flatten nested component results, and copy the assertion into the child results.
    const flattenedComponentResults = this.componentResults.flatMap((result) => {
      if (result.componentResults) {
        return [
          result,
          ...result.componentResults.map((subResult) => ({
            ...subResult,
            assertion: subResult.assertion || result.assertion,
          })),
        ];
      } else {
        return result;
      }
    });

    const normalizedNamedScores: Record<string, number> = {};
    for (const [key, value] of Object.entries(this.namedScores)) {
      const totalWeight = this.namedScoreWeights[key] ?? 0;
      normalizedNamedScores[key] = totalWeight > 0 ? value / totalWeight : 0;
    }

    const hasNamedScoreWeights = Object.keys(this.namedScoreWeights).length > 0;
    const cachedResponse =
      this.componentResults.length > 0 &&
      this.componentResults.every((result) => result.metadata?.cachedResponse === true);

    this.result = {
      pass,
      score,
      reason,
      namedScores: normalizedNamedScores,
      ...(hasNamedScoreWeights && { namedScoreWeights: this.namedScoreWeights }),
      tokensUsed: this.tokensUsed,
      componentResults: flattenedComponentResults,
      ...((this._parentAssertionSet || cachedResponse) && {
        metadata: {
          ...(this._parentAssertionSet && {
            assertionSet: buildAssertionSetMetadata(this._parentAssertionSet.assertionSet),
          }),
          ...(cachedResponse && { cachedResponse: true }),
        },
      }),
    };

    if (scoringFunction) {
      try {
        const scoringResult = await scoringFunction(normalizedNamedScores, {
          threshold: this.threshold,
          parentAssertionSet: this._parentAssertionSet,
          componentResults: flattenedComponentResults,
          tokensUsed: this.tokensUsed,
        });
        if (!isGradingResult(scoringResult)) {
          throw new Error('assertion scoring function must return a GradingResult');
        }
        this.result = {
          ...this.result,
          ...scoringResult,
          tokensUsed: mergeScoringTokenUsage(this.result.tokensUsed, scoringResult),
          ...((this.result.metadata || scoringResult.metadata) && {
            metadata: mergeScoringMetadata(
              this.result.metadata,
              scoringResult,
              this.result.tokensUsed,
            ),
          }),
        };
      } catch (err) {
        this.result.pass = false;
        this.result.score = 0;
        this.result.reason = `Scoring function error: ${(err as Error).message}`;
      }
    }

    return this.result;
  }
}
