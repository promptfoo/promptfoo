import { RunStatsAccumulator } from './accumulator';

import type { ApiProvider, EvaluateStats } from '../types/index';
import type { EvalRunStats, ProviderStats, StatableResult } from './types';

export interface ComputeRunStatsInput {
  results: StatableResult[];
  stats: EvaluateStats;
  providers: ApiProvider[];
}

export interface ComputeRunStatsBatchedInput {
  resultBatches: AsyncIterable<StatableResult[]>;
  stats: EvaluateStats;
  providers: ApiProvider[];
}

export interface ComputeRunStatsBatchedResult {
  runStats: EvalRunStats;
  allProviderStats: ProviderStats[];
  resultCount: number;
  hasTimedOutResult: boolean;
}

export function computeRunStats(input: ComputeRunStatsInput): EvalRunStats {
  const { results, stats, providers } = input;
  const accumulator = new RunStatsAccumulator();
  accumulator.addResults(results);

  return accumulator.toRunStats(stats, providers);
}

export async function computeRunStatsBatched(
  input: ComputeRunStatsBatchedInput,
): Promise<ComputeRunStatsBatchedResult> {
  const { resultBatches, stats, providers } = input;
  const accumulator = new RunStatsAccumulator();

  for await (const batch of resultBatches) {
    accumulator.addResults(batch);
  }

  return {
    runStats: accumulator.toRunStats(stats, providers),
    allProviderStats: accumulator.getProviderStats(),
    resultCount: accumulator.resultCount,
    hasTimedOutResult: accumulator.hasTimedOutResult,
  };
}
