import { EvaluateSummary, UnifiedConfig } from '.';

export interface ResultsFile {
  version: number;
  createdAt: string;
  author: string | null;
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
  datasetId?: string;
}

export interface EvalWithMetadata {
  id: string;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummary;
  description?: string;
}
