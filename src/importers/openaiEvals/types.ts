import type { AtomicTestCase, CompletedPrompt, EvaluateResult } from '../../types/index';

export interface OpenAIEvalsJsonlRow {
  run_id: string;
  data_source_idx: number;
  item: Record<string, unknown>;
  sample?: OpenAISample;
  grades: Record<string, number>;
  grader_samples?: Record<string, unknown>;
  passes?: Record<string, boolean>;
}

export interface OpenAISample {
  outputs?: unknown;
  error?: unknown;
  finish_reason?: unknown;
  token_usage?: unknown;
  [key: string]: unknown;
}

export interface OpenAIEvalsImportResult {
  evalId: string;
  results: {
    version: 3;
    timestamp: string;
    prompts: CompletedPrompt[];
    results: EvaluateResult[];
  };
  config: {
    description: string;
    tests: AtomicTestCase[];
    metadata: {
      openaiEvalsImport: {
        format: string;
        rowCount: number;
        runIds: string[];
      };
    };
  };
  metadata: {
    evaluationCreatedAt: string;
    openaiRunIds: string[];
  };
}
