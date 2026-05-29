import { MODEL_GRADED_ASSERTION_TYPES } from '../assertions/constants';
import { getCountableAssertionComponents } from './assertionComponents';
import {
  accumulateResultAssertionTokenUsage,
  createAssertionTokenAccumulator,
  getStatsAssertionTokenUsage,
  toAssertionTokenUsage,
} from './assertionTokens';

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
  const accumulators = new Map<string, AssertionAccumulator>();

  for (const result of results) {
    for (const cr of getCountableAssertionComponents(result)) {
      const type = cr.assertion?.type || 'unknown';

      const accumulator = accumulators.get(type) ?? { pass: 0, fail: 0 };
      accumulators.set(type, accumulator);

      if (cr.pass) {
        accumulator.pass++;
      } else {
        accumulator.fail++;
      }
    }
  }

  return Array.from(accumulators.entries())
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
    .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type))
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
    for (const cr of getCountableAssertionComponents(result)) {
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
  const resultTokenUsage = createAssertionTokenAccumulator();
  let foundResultTokenUsage = false;
  for (const result of results) {
    foundResultTokenUsage =
      accumulateResultAssertionTokenUsage(resultTokenUsage, result) || foundResultTokenUsage;
  }

  return {
    total,
    passed,
    passRate: total > 0 ? passed / total : 0,
    modelGraded,
    breakdown: computeAssertionBreakdown(results),
    tokenUsage: toAssertionTokenUsage(
      foundResultTokenUsage ? resultTokenUsage : getStatsAssertionTokenUsage(stats),
    ),
  };
}
