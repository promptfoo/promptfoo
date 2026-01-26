import { MODEL_GRADED_ASSERTION_TYPES } from '../assertions/constants';

import type { AssertionType, EvaluateStats } from '../types/index';
import type { AssertionTokenUsage, AssertionTypeStats, StatableResult } from './types';

/**
 * Internal accumulator for per-assertion-type stats during computation.
 */
interface AssertionAccumulator {
  pass: number;
  fail: number;
}

/**
 * Computes per-assertion-type effectiveness statistics from evaluation results.
 *
 * @param results - Array of evaluation results
 * @param maxTypes - Maximum number of assertion types to return (default 20)
 * @returns Array of assertion type stats sorted by volume
 */
export function computeAssertionBreakdown(
  results: StatableResult[],
  maxTypes: number = 20,
): AssertionTypeStats[] {
  const accumulators: Record<string, AssertionAccumulator> = {};

  for (const result of results) {
    const componentResults = result.gradingResult?.componentResults || [];

    for (const cr of componentResults) {
      const type = cr.assertion?.type || 'unknown';

      if (!accumulators[type]) {
        accumulators[type] = { pass: 0, fail: 0 };
      }

      if (cr.pass) {
        accumulators[type].pass++;
      } else {
        accumulators[type].fail++;
      }
    }
  }

  return Object.entries(accumulators)
    .map(([type, acc]): AssertionTypeStats => {
      const total = acc.pass + acc.fail;
      return {
        type,
        pass: acc.pass,
        fail: acc.fail,
        total,
        passRate: total > 0 ? acc.pass / total : 0,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, maxTypes);
}

/**
 * Computes overall assertion statistics from evaluation results.
 *
 * @param results - Array of evaluation results
 * @param stats - Evaluation statistics containing token usage
 * @returns Complete assertion stats object
 */
export function computeAssertionStats(
  results: StatableResult[],
  stats: EvaluateStats,
): {
  total: number;
  passed: number;
  passRate: number;
  modelGraded: number;
  breakdown: AssertionTypeStats[];
  tokenUsage: AssertionTokenUsage;
} {
  let total = 0;
  let passed = 0;
  const assertionTypes = new Set<string>();

  // Count all assertions and collect unique types
  for (const result of results) {
    const componentResults = result.gradingResult?.componentResults || [];

    for (const cr of componentResults) {
      total++;
      if (cr.pass) {
        passed++;
      }

      // Collect unique assertion types
      const assertionType = cr.assertion?.type;
      if (assertionType) {
        assertionTypes.add(assertionType);
      }
    }
  }

  // Count unique model-graded assertion types (not individual assertions)
  // This matches the original telemetry behavior
  const modelGraded = Array.from(assertionTypes).filter((type) =>
    MODEL_GRADED_ASSERTION_TYPES.has(type as AssertionType),
  ).length;

  // Get token usage for assertions from stats
  const tokenUsage: AssertionTokenUsage = {
    totalTokens: stats.tokenUsage?.assertions?.total || 0,
    promptTokens: stats.tokenUsage?.assertions?.prompt || 0,
    completionTokens: stats.tokenUsage?.assertions?.completion || 0,
    cachedTokens: stats.tokenUsage?.assertions?.cached || 0,
    numRequests: stats.tokenUsage?.assertions?.numRequests || 0,
    reasoningTokens: stats.tokenUsage?.assertions?.completionDetails?.reasoning || 0,
  };

  return {
    total,
    passed,
    passRate: total > 0 ? passed / total : 0,
    modelGraded,
    breakdown: computeAssertionBreakdown(results),
    tokenUsage,
  };
}
