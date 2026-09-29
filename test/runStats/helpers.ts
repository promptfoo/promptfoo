import { RunStatsAccumulator } from '../../src/runStats/accumulator';
import { computeRunStats } from '../../src/runStats/index';

import type { StatableResult } from '../../src/runStats/types';

export function computeCacheStats(results: StatableResult[]) {
  return computeRunStats({ results, providers: [] }).cache;
}
export function computeLatencyStats(results: StatableResult[]) {
  return computeRunStats({ results, providers: [] }).latency;
}
export function computeErrorStats(results: StatableResult[]) {
  return computeRunStats({ results, providers: [] }).errors;
}
export function computeAssertionStats(results: StatableResult[]) {
  return computeRunStats({ results, providers: [] }).assertions;
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
