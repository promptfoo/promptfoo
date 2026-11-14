export interface NamedMetricAccumulator {
  namedScores: Record<string, number>;
  namedScoresCount: Record<string, number>;
  namedScoreWeights?: Record<string, number>;
}
