import { MODEL_GRADED_ASSERTION_TYPES } from '../assertions/constants';
import {
  type ApiProvider,
  type AssertionType,
  BaseAssertionTypesSchema,
  type EvaluateStats,
  SpecialAssertionTypesSchema,
} from '../types/index';
import { getCountableAssertionComponents } from './assertionComponents';
import {
  accumulateResultAssertionTokenUsage,
  createAssertionTokenAccumulator,
  getStatsAssertionTokenUsage,
  toAssertionTokenUsage,
} from './assertionTokens';
import { categorizeError, type ErrorCategory, isOperationalError } from './errors';
import { getPercentile } from './latency';
import { computeModelInfo, computeModelInfoFromIds } from './providers';

import type {
  AssertionTypeStats,
  ErrorBreakdown,
  EvalRunStats,
  ProviderStats,
  StatableResult,
} from './types';

const KNOWN_ASSERTION_TYPES = new Set<string>([
  ...BaseAssertionTypesSchema.options,
  ...BaseAssertionTypesSchema.options.map((type) => `not-${type}`),
  ...SpecialAssertionTypesSchema.options,
]);

interface ProviderAccumulator {
  requests: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

interface AssertionAccumulator {
  pass: number;
  fail: number;
}

function createEmptyErrorBreakdown(): ErrorBreakdown {
  return {
    timeout: 0,
    rate_limit: 0,
    auth: 0,
    server_error: 0,
    network: 0,
    other: 0,
  };
}

// Retains latency samples and grouped counters, without retaining provider outputs.
export class RunStatsAccumulator {
  private readonly latencies: number[] = [];
  private readonly errors = createEmptyErrorBreakdown();
  private readonly providers = new Map<string, ProviderAccumulator>();
  private readonly assertions = new Map<string, AssertionAccumulator>();
  private readonly assertionTokenUsage = createAssertionTokenAccumulator();
  private readonly seenComparisonAssertionTokenUsage = new Set<string>();
  private readonly assertionTypes = new Set<string>();
  private readonly modelProviderIds = new Set<string>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private errorCount = 0;
  private assertionCount = 0;
  private assertionPassCount = 0;
  private processedResultCount = 0;
  private foundTimedOutResult = false;
  private foundAssertionTokenUsage = false;

  addResults(results: Iterable<StatableResult>): void {
    for (const result of results) {
      this.addResult(result);
    }
  }

  get resultCount(): number {
    return this.processedResultCount;
  }

  get hasTimedOutResult(): boolean {
    return this.foundTimedOutResult;
  }

  toRunStats(stats: EvaluateStats, providers: ApiProvider[]): EvalRunStats {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const totalLatency = sortedLatencies.reduce((sum, latency) => sum + latency, 0);
    const cacheTotal = this.cacheHits + this.cacheMisses;
    const errorTypes = (Object.keys(this.errors) as ErrorCategory[])
      .filter((category) => this.errors[category] > 0)
      .sort();
    const assertionTokenUsage = this.foundAssertionTokenUsage
      ? this.assertionTokenUsage
      : getStatsAssertionTokenUsage(stats);

    const modelInfo =
      this.modelProviderIds.size > 0
        ? computeModelInfoFromIds(Array.from(this.modelProviderIds))
        : computeModelInfo(providers);

    return {
      latency: {
        avgMs: sortedLatencies.length > 0 ? Math.round(totalLatency / sortedLatencies.length) : 0,
        p50Ms: Math.round(getPercentile(sortedLatencies, 0.5)),
        p95Ms: Math.round(getPercentile(sortedLatencies, 0.95)),
        p99Ms: Math.round(getPercentile(sortedLatencies, 0.99)),
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: cacheTotal > 0 ? this.cacheHits / cacheTotal : null,
      },
      errors: {
        total: this.errorCount,
        types: errorTypes,
        breakdown: this.errors,
      },
      providers: this.getProviderStats(10),
      assertions: {
        total: this.assertionCount,
        passed: this.assertionPassCount,
        passRate: this.assertionCount > 0 ? this.assertionPassCount / this.assertionCount : 0,
        modelGraded: Array.from(this.assertionTypes).filter((type) =>
          MODEL_GRADED_ASSERTION_TYPES.has(type as AssertionType),
        ).length,
        breakdown: this.getAssertionBreakdown(),
        tokenUsage: toAssertionTokenUsage(assertionTokenUsage),
      },
      models: modelInfo,
    };
  }

  private addProviderResult(result: StatableResult): void {
    this.processedResultCount++;

    if (result.latencyMs >= 0) {
      this.latencies.push(result.latencyMs);
    }

    const operationalError = isOperationalError(result);
    const targetError =
      operationalError &&
      (Boolean(result.response?.error) || result.response?.output === undefined);
    if (!targetError && result.response?.cached === true) {
      this.cacheHits++;
    } else if (!targetError && result.response) {
      this.cacheMisses++;
    }

    const providerId = result.provider?.id || 'unknown';
    this.modelProviderIds.add(providerId);
    const provider = this.providers.get(providerId) ?? {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
    };
    provider.requests += result.response?.tokenUsage?.numRequests ?? 1;
    provider.totalLatencyMs += result.latencyMs || 0;
    if (targetError) {
      provider.failures++;
    } else {
      provider.successes++;
    }
    this.providers.set(providerId, provider);
    provider.totalTokens += result.response?.tokenUsage?.total || 0;
    provider.promptTokens += result.response?.tokenUsage?.prompt || 0;
    provider.completionTokens += result.response?.tokenUsage?.completion || 0;
    provider.cachedTokens += result.response?.tokenUsage?.cached || 0;
  }

  private addResult(result: StatableResult): void {
    if (isOperationalError(result)) {
      this.errorCount++;
      const category = categorizeError(result.error || '');
      this.errors[category]++;
      this.foundTimedOutResult ||= category === 'timeout';
    }
    if (!result.gradingOnly) {
      this.addProviderResult(result);
    }
    this.foundAssertionTokenUsage =
      accumulateResultAssertionTokenUsage(
        this.assertionTokenUsage,
        result,
        this.seenComparisonAssertionTokenUsage,
      ) || this.foundAssertionTokenUsage;

    for (const componentResult of getCountableAssertionComponents(result)) {
      this.assertionCount++;
      if (componentResult.pass) {
        this.assertionPassCount++;
      }

      const rawType = componentResult.assertion?.type;
      const type = rawType ? (KNOWN_ASSERTION_TYPES.has(rawType) ? rawType : 'custom') : 'unknown';
      if (componentResult.assertion?.type) {
        this.assertionTypes.add(type);
      }

      const assertion = this.assertions.get(type) ?? { pass: 0, fail: 0 };
      if (componentResult.pass) {
        assertion.pass++;
      } else {
        assertion.fail++;
      }
      this.assertions.set(type, assertion);
    }
  }

  getProviderStats(maxProviders?: number): ProviderStats[] {
    const providerStats = Array.from(this.providers.entries())
      .map(([provider, accumulated]): ProviderStats => {
        const outcomes = accumulated.successes + accumulated.failures;
        return {
          provider,
          requests: accumulated.requests,
          successes: accumulated.successes,
          failures: accumulated.failures,
          successRate: outcomes > 0 ? accumulated.successes / outcomes : 0,
          avgLatencyMs: outcomes > 0 ? Math.round(accumulated.totalLatencyMs / outcomes) : 0,
          totalTokens: accumulated.totalTokens,
          promptTokens: accumulated.promptTokens,
          completionTokens: accumulated.completionTokens,
          cachedTokens: accumulated.cachedTokens,
          tokensPerRequest:
            accumulated.requests > 0
              ? Math.round(accumulated.totalTokens / accumulated.requests)
              : 0,
          cacheRate:
            accumulated.totalTokens > 0 ? accumulated.cachedTokens / accumulated.totalTokens : 0,
        };
      })
      .sort((a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider));

    return maxProviders === undefined ? providerStats : providerStats.slice(0, maxProviders);
  }

  getAssertionBreakdown(maxTypes = 20): AssertionTypeStats[] {
    return Array.from(this.assertions.entries())
      .map(([type, accumulated]): AssertionTypeStats => {
        const total = accumulated.pass + accumulated.fail;
        return {
          type,
          pass: accumulated.pass,
          fail: accumulated.fail,
          total,
          passRate: total > 0 ? accumulated.pass / total : 0,
        };
      })
      .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type))
      .slice(0, maxTypes);
  }
}
