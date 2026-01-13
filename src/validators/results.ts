import { z } from 'zod';
import { BaseTokenUsageSchema, type TokenUsage } from '../types/shared';
import { type Prompt, PromptSchema } from './prompts';
import {
  type AtomicTestCase,
  TestCaseSchema,
  TestGeneratorConfigSchema,
  type Vars,
} from './test_cases';

import type { BlobRef } from '../blobs/types';
import type { ProviderOptions, ProviderResponse } from '../types/providers';
import type { GradingResult } from './assertions';
import type { UnifiedConfig } from './config';

export const PromptMetricsSchema = z.object({
  score: z.number(),
  testPassCount: z.number(),
  testFailCount: z.number(),
  testErrorCount: z.number(),
  assertPassCount: z.number(),
  assertFailCount: z.number(),
  totalLatencyMs: z.number(),
  tokenUsage: BaseTokenUsageSchema,
  namedScores: z.record(z.string(), z.number()),
  namedScoresCount: z.record(z.string(), z.number()),
  redteam: z
    .object({
      pluginPassCount: z.record(z.string(), z.number()),
      pluginFailCount: z.record(z.string(), z.number()),
      strategyPassCount: z.record(z.string(), z.number()),
      strategyFailCount: z.record(z.string(), z.number()),
    })
    .optional(),
  cost: z.number(),
});
export type PromptMetrics = z.infer<typeof PromptMetricsSchema>;

// Used for final prompt display
export const CompletedPromptSchema = PromptSchema.extend({
  provider: z.string(),
  metrics: PromptMetricsSchema.optional(),
});

export type CompletedPrompt = z.infer<typeof CompletedPromptSchema>;

// Used when building prompts index from files.
export interface PromptWithMetadata {
  id: string;
  prompt: Prompt;
  recentEvalDate: Date;
  recentEvalId: string;
  evals: {
    id: string;
    datasetId: string;
    metrics: CompletedPrompt['metrics'];
  }[];
  count: number;
}

// The server returns ISO formatted strings for dates, so we need to adjust the type here
export type ServerPromptWithMetadata = Omit<PromptWithMetadata, 'recentEvalDate'> & {
  recentEvalDate: string;
};

export const ResultFailureReason = {
  // The test passed, or we don't know exactly why the test case failed.
  NONE: 0,
  // The test case failed because an assertion rejected it.
  ASSERT: 1,
  // Test case failed due to some other error.
  ERROR: 2,
} as const;
export type ResultFailureReason = (typeof ResultFailureReason)[keyof typeof ResultFailureReason];

const validResultFailureReasons = new Set<number>(Object.values(ResultFailureReason));

export function isResultFailureReason(value: number): value is ResultFailureReason {
  return validResultFailureReasons.has(value);
}

export interface EvaluateResult {
  id?: string; // on the new version 2, this is stored per-result
  description?: string; // on the new version 2, this is stored per-result // FIXME(ian): The EvalResult model doesn't pass this through, but that's ok since we can use testCase.description?
  promptIdx: number; // on the new version 2, this is stored per-result
  testIdx: number; // on the new version 2, this is stored per-result
  testCase: AtomicTestCase; // on the new version 2, this is stored per-result
  promptId: string; // on the new version 2, this is stored per-result
  provider: Pick<ProviderOptions, 'id' | 'label'>;
  prompt: Prompt;
  vars: Vars;
  response?: ProviderResponse;
  error?: string | null;
  failureReason: ResultFailureReason;
  success: boolean;
  score: number;
  latencyMs: number;
  gradingResult?: GradingResult | null;
  namedScores: Record<string, number>;
  cost?: number;
  metadata?: Record<string, any>;
  tokenUsage?: Required<TokenUsage>;
}

export interface EvaluateTableOutput {
  cost: number;
  failureReason: ResultFailureReason;
  gradingResult?: GradingResult | null;
  id: string;
  latencyMs: number;
  metadata?: Record<string, any>;
  namedScores: Record<string, number>;
  pass: boolean;
  prompt: string;
  provider?: string;
  response?: ProviderResponse;
  score: number;
  testCase: AtomicTestCase;
  text: string;
  tokenUsage?: Partial<TokenUsage>;
  error?: string | null;
  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    blobRef?: BlobRef;
    transcript?: string;
    format?: string;
    sampleRate?: number;
    channels?: number;
    duration?: number;
  };
  video?: {
    id?: string; // Provider video ID (e.g., Sora job ID, Veo operation name)
    blobRef?: BlobRef; // Blob storage reference for video data (Veo)
    storageRef?: { key?: string }; // Storage reference for video file (Sora)
    url?: string; // Storage ref URL (e.g., storageRef:video/abc123.mp4) or blob URI
    format?: string; // 'mp4'
    size?: string; // '1280x720' or '720x1280'
    duration?: number; // Seconds
    thumbnail?: string; // Storage ref URL for thumbnail (Sora)
    spritesheet?: string; // Storage ref URL for spritesheet (Sora)
    model?: string; // Model used (e.g., 'sora-2', 'veo-3.1-generate-preview')
    aspectRatio?: string; // '16:9' or '9:16' (Veo)
    resolution?: string; // '720p' or '1080p' (Veo)
  };
}

export interface EvaluateTableRow {
  description?: string;
  outputs: EvaluateTableOutput[];
  vars: string[];
  test: AtomicTestCase;
  testIdx: number;
}

export interface EvaluateTable {
  head: {
    prompts: CompletedPrompt[];
    vars: string[];
  };
  body: EvaluateTableRow[];
}

export interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  durationMs?: number;
}

export interface EvaluateSummaryV3 {
  version: 3;
  timestamp: string;
  results: EvaluateResult[];
  prompts: CompletedPrompt[];
  stats: EvaluateStats;
}

export interface EvaluateSummaryV2 {
  version: number;
  timestamp: string;
  results: EvaluateResult[];
  table: EvaluateTable;
  stats: EvaluateStats;
}

export type EvalTableDTO = {
  table: EvaluateTable;
  totalCount: number;
  filteredCount: number;
  filteredMetrics: PromptMetrics[] | null;
  config: Partial<UnifiedConfig>;
  author: string | null;
  version: number;
  id: string;
  stats?: EvaluateStats;
};

// Used when building prompts index from files.
export const TestCasesWithMetadataPromptSchema = z.object({
  prompt: CompletedPromptSchema,
  id: z.string(),
  evalId: z.string(),
});

export type TestCasesWithMetadataPrompt = z.infer<typeof TestCasesWithMetadataPromptSchema>;

export const TestCasesWithMetadataSchema = z.object({
  id: z.string(),
  testCases: z.union([
    z.string(),
    z.array(z.union([z.string(), TestCaseSchema, TestGeneratorConfigSchema])),
  ]),
  recentEvalDate: z.date(),
  recentEvalId: z.string(),
  count: z.number(),
  prompts: z.array(TestCasesWithMetadataPromptSchema),
});

export type TestCasesWithMetadata = z.infer<typeof TestCasesWithMetadataSchema>;

export interface EvalWithMetadata {
  id: string;
  date: Date;
  config: Partial<UnifiedConfig>;
  results: EvaluateSummaryV3;
  description?: string;
}

export interface SharedResults {
  data: ResultsFile;
}

// promptfoo's internal results format
export interface ResultsFile {
  version: number;
  createdAt: string;
  results: EvaluateSummaryV3 | EvaluateSummaryV2;
  config: Partial<UnifiedConfig>;
  author: string | null;
  prompts?: CompletedPrompt[];
  // Included by readResult() in util.
  datasetId?: string | null;
}

export interface OutputMetadata {
  promptfooVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  exportedAt: string;
  evaluationCreatedAt?: string;
  author?: string;
}

// File exported as --output option
export interface OutputFile {
  evalId: string | null;
  results: EvaluateSummaryV3 | EvaluateSummaryV2;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
  metadata?: OutputMetadata;
}

// Live eval job state
export interface Job {
  evalId: string | null;
  status: 'in-progress' | 'complete' | 'error';
  progress: number;
  total: number;
  result: EvaluateSummaryV3 | EvaluateSummaryV2 | null;
  logs: string[];
}

// used for writing eval results
export const OutputFileExtension = z.enum([
  'csv',
  'html',
  'json',
  'jsonl',
  'txt',
  'xml',
  'yaml',
  'yml',
]);
export type OutputFileExtension = z.infer<typeof OutputFileExtension>;

export const EvalResultsFilterMode = z.enum([
  'all',
  'failures',
  'different',
  'highlights',
  'errors',
  'passes',
]);

export type EvalResultsFilterMode = z.infer<typeof EvalResultsFilterMode>;

// The eval results list returned by the server and used for the eval picker
export interface ResultLightweight {
  evalId: string;
  datasetId: string | null;
  createdAt: number;
  description: string | null;
  numTests: number;
  isRedteam?: boolean;
}

export type ResultLightweightWithLabel = ResultLightweight & { label: string };

export type EvalSummary = ResultLightweightWithLabel & {
  isRedteam: boolean;
  passRate: number;
  label: string;
  providers: {
    id: string;
    label: string | null;
  }[];
  attackSuccessRate?: number;
};
