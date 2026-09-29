import { RunStatsAccumulator } from '../../src/runStats/accumulator';
import { computeRunStats } from '../../src/runStats/index';
import { createEvaluateStats } from '../factories/eval';

import type { StatableResult } from '../../src/runStats/types';
import type { EvaluateStats } from '../../src/types/index';

export function computeCacheStats(results: StatableResult[]) {
  return computeRunStats({ results, stats: createEvaluateStats(), providers: [] }).cache;
}
export function computeLatencyStats(results: StatableResult[]) {
  return computeRunStats({ results, stats: createEvaluateStats(), providers: [] }).latency;
}
export function computeErrorStats(results: StatableResult[]) {
  return computeRunStats({ results, stats: createEvaluateStats(), providers: [] }).errors;
}
export function computeAssertionStats(results: StatableResult[], stats: EvaluateStats) {
  return computeRunStats({ results, stats, providers: [] }).assertions;
}
export function computeAssertionBreakdown(results: StatableResult[], maxTypes = 20) {
  const accumulator = new RunStatsAccumulator();
  accumulator.addResults(results);
  return accumulator.getAssertionBreakdown(maxTypes);
}
export function computeProviderStats(results: StatableResult[], maxProviders = 10) {
  const accumulator = new RunStatsAccumulator();
  accumulator.addResults(results);
  return accumulator.getProviderStats(maxProviders);
}
