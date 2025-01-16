import { getEnvBool } from '../envars';
import type { AssertionSet, GradingResult } from '../types';

const DEFAULT_TOKENS_USED = {
  total: 0,
  prompt: 0,
  completion: 0,
  cached: 0,
};

interface ParentAssertionSet {
  index: number;
  assertionSet: AssertionSet;
}

export class AssertionsResult {
  static noAssertsResult(): GradingResult {
    return {
      pass: true,
      score: 1,
      reason: 'No assertions',
      tokensUsed: { ...DEFAULT_TOKENS_USED },
      assertion: null,
    };
  }

  private tokensUsed = {
    ...DEFAULT_TOKENS_USED,
  };
  private threshold: number | undefined;
  private _parentAssertionSet: ParentAssertionSet | undefined;
  private totalScore: number = 0;
  private totalWeight: number = 0;
  private failedReason: string | undefined;
  private componentResults: GradingResult[] = [];
  private namedScores: Record<string, number> = {};
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
      this.namedScores[metric] = (this.namedScores[metric] || 0) + result.score;
    }

    if (result.namedScores) {
      Object.entries(result.namedScores).forEach(([metricName, score]) => {
        if (metricName !== metric) {
          this.namedScores[metricName] = (this.namedScores[metricName] || 0) + score;
        }
      });
    }

    if (result.tokensUsed) {
      this.tokensUsed.total += result.tokensUsed.total || 0;
      this.tokensUsed.prompt += result.tokensUsed.prompt || 0;
      this.tokensUsed.completion += result.tokensUsed.completion || 0;
      this.tokensUsed.cached += result.tokensUsed.cached || 0;
    }

    if (result.pass) {
      return;
    }

    this.failedReason = result.reason;

    if (getEnvBool('PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES')) {
      throw new Error(result.reason);
    }
  }

  testResult(): GradingResult {
    if (this.result) {
      return this.result;
    }

    const score = this.totalWeight > 0 ? this.totalScore / this.totalWeight : 0;

    let pass = !this.failedReason;

    let reason = this.failedReason ? this.failedReason : 'All assertions passed';

    if (this.threshold) {
      // Existence of a test threshold overrides the pass/fail status of individual assertions
      pass = score >= this.threshold;

      if (pass) {
        reason = `Aggregate score ${score.toFixed(2)} ≥ ${this.threshold} threshold`;
      } else {
        reason = `Aggregate score ${score.toFixed(2)} < ${this.threshold} threshold`;
      }
    }

    if (this.failedContentSafetyChecks) {
      pass = true;
      reason = 'Content failed guardrail safety checks';
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

    this.result = {
      pass,
      score,
      reason,
      namedScores: this.namedScores,
      tokensUsed: this.tokensUsed,
      componentResults: flattenedComponentResults,
      assertion: null,
    };

    return this.result;
  }
}
