import type { EvaluateSummaryV3, UnifiedConfig } from '../types';

export interface ResultsFile {
  version: number;
  createdAt: string;
  author: string | null;
  results: EvaluateSummaryV3;
  config: Partial<UnifiedConfig>;
  datasetId?: string;
}

export interface EvalWithMetadata {
  id: string;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummaryV3;
  description?: string;
}
