import { RunStatsAccumulator } from './accumulator';

import type { ApiProvider } from '../types/index';
import type { EvalRunStats, ProviderStats, StatableResult } from './types';

export interface ComputeRunStatsInput {
  results: StatableResult[];
  providers: ApiProvider[];
}

export interface ComputeRunStatsBatchedInput {
  resultBatches: AsyncIterable<StatableResult[]>;
  providers: ApiProvider[];
}

export interface ComputeRunStatsBatchedResult {
  runStats: EvalRunStats;
  allProviderStats: ProviderStats[];
  resultCount: number;
  hasTimedOutResult: boolean;
}

export function computeRunStats(input: ComputeRunStatsInput): EvalRunStats {
  const { results, providers } = input;
  const accumulator = new RunStatsAccumulator();
  accumulator.addResults(results);

  return accumulator.toRunStats(providers);
}

export async function computeRunStatsBatched(
  input: ComputeRunStatsBatchedInput,
): Promise<ComputeRunStatsBatchedResult> {
  const { resultBatches, providers } = input;
  const accumulator = new RunStatsAccumulator();

  for await (const batch of resultBatches) {
    accumulator.addResults(batch);
  }

  return {
    runStats: accumulator.toRunStats(providers),
    allProviderStats: accumulator.getProviderStats(),
    resultCount: accumulator.resultCount,
    hasTimedOutResult: accumulator.hasTimedOutResult,
  };
}
