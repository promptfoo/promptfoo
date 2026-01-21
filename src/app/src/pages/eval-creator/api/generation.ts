/**
 * API client functions for the generation system.
 * Uses callApi for proper API base URL handling.
 */

import { callApi } from '@app/utils/api';
import { z } from 'zod';
import type { Assertion, TestCase } from '@promptfoo/types';

/**
 * Simplified prompt representation for generation APIs.
 * The backend only needs raw content and a label, not the full Prompt type.
 */
export interface GenerationPrompt {
  raw: string;
  label: string;
}

// Zod schemas for API response validation
const GenerateJobResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string().optional(),
  error: z.string().optional(),
});

const GenerationJobSchema = z.object({
  id: z.string(),
  type: z.enum(['dataset', 'assertions', 'combined']),
  status: z.enum(['pending', 'in-progress', 'complete', 'error']),
  progress: z.number().default(0),
  total: z.number().default(0),
  phase: z.string().default('Initializing...'),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const JobStatusResponseSchema = z.object({
  success: z.boolean(),
  job: GenerationJobSchema.optional(),
  error: z.string().optional(),
});

const ConceptAnalysisSchema = z.object({
  topics: z.array(z.string()),
  entities: z.array(z.string()),
  constraints: z.array(z.string()),
});

const DiversityMetricsSchema = z.object({
  score: z.number(),
  clusters: z.number().optional(),
  gaps: z.array(z.string()).optional(),
});

const CoverageAnalysisSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      coverageLevel: z.enum(['none', 'partial', 'full']),
      matchingAssertions: z.array(z.string()),
    }),
  ),
  overallScore: z.number(),
  gaps: z.array(z.string()),
});

// Types for generation options
export interface DatasetGenerationOptions {
  instructions?: string;
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  provider?: string;
  edgeCases?: {
    enabled?: boolean;
    types?: ('boundary' | 'format' | 'empty' | 'special-chars' | 'adversarial' | 'length')[];
    count?: number;
  };
  diversity?: {
    enabled?: boolean;
    targetScore?: number;
  };
  iterative?: {
    enabled?: boolean;
    maxRounds?: number;
  };
}

export interface AssertionGenerationOptions {
  instructions?: string;
  numAssertions?: number;
  provider?: string;
  type?: 'pi' | 'g-eval' | 'llm-rubric';
  coverage?: {
    enabled?: boolean;
    extractRequirements?: boolean;
  };
  negativeTests?: {
    enabled?: boolean;
    types?: ('should-not-contain' | 'should-not-hallucinate' | 'should-not-expose')[];
  };
}

export interface TestSuiteGenerationOptions {
  dataset?: DatasetGenerationOptions;
  assertions?: AssertionGenerationOptions;
  parallel?: boolean;
  skipDataset?: boolean;
  skipAssertions?: boolean;
}

// Job status types
export type GenerationJobStatus = 'pending' | 'in-progress' | 'complete' | 'error';

export interface GenerationJob {
  id: string;
  type: 'dataset' | 'assertions' | 'combined';
  status: GenerationJobStatus;
  progress: number;
  total: number;
  phase: string;
  result?: GenerationResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetGenerationResult {
  /** Test cases returned as flat VarMapping objects (Record<string, string>) */
  testCases: Array<Record<string, string>>;
  concepts?: {
    topics: string[];
    entities: string[];
    constraints: string[];
  };
  diversity?: {
    score: number;
    clusters?: number;
  };
  edgeCases?: Array<{
    vars: Record<string, string>;
    type: string;
    description: string;
  }>;
  metadata: {
    totalGenerated: number;
    durationMs: number;
    provider: string;
  };
}

export interface AssertionGenerationResult {
  assertions: Assertion[];
  coverage?: {
    requirements: Array<{
      id: string;
      description: string;
      coverageLevel: 'none' | 'partial' | 'full';
      matchingAssertions: string[];
    }>;
    overallScore: number;
    gaps: string[];
  };
  negativeTests?: Assertion[];
  metadata: {
    totalGenerated: number;
    durationMs: number;
  };
}

export interface TestSuiteGenerationResult {
  dataset?: DatasetGenerationResult;
  assertions?: AssertionGenerationResult;
  metadata: {
    totalDurationMs: number;
    provider: string;
  };
}

export type GenerationResult =
  | DatasetGenerationResult
  | AssertionGenerationResult
  | TestSuiteGenerationResult;

/**
 * Start a dataset generation job.
 */
export async function generateDataset(
  prompts: GenerationPrompt[],
  tests: TestCase[],
  options: DatasetGenerationOptions,
): Promise<{ jobId: string }> {
  const fetchResponse = await callApi('/generation/dataset/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, tests, options }),
  });

  const json = await fetchResponse.json();
  const result = GenerateJobResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.jobId) {
    throw new Error(response.error || 'Failed to start dataset generation');
  }

  return { jobId: response.jobId };
}

/**
 * Start an assertions generation job.
 */
export async function generateAssertions(
  prompts: GenerationPrompt[],
  tests: TestCase[],
  options: AssertionGenerationOptions,
): Promise<{ jobId: string }> {
  const fetchResponse = await callApi('/generation/assertions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, tests, options }),
  });

  const json = await fetchResponse.json();
  const result = GenerateJobResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.jobId) {
    throw new Error(response.error || 'Failed to start assertions generation');
  }

  return { jobId: response.jobId };
}

/**
 * Start a combined test suite generation job.
 */
export async function generateTestSuite(
  prompts: GenerationPrompt[],
  tests: TestCase[],
  options: TestSuiteGenerationOptions,
): Promise<{ jobId: string }> {
  const fetchResponse = await callApi('/generation/tests/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, tests, options }),
  });

  const json = await fetchResponse.json();
  const result = GenerateJobResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.jobId) {
    throw new Error(response.error || 'Failed to start test suite generation');
  }

  return { jobId: response.jobId };
}

/**
 * Get the status of a generation job.
 */
export async function getJobStatus(
  type: 'dataset' | 'assertions' | 'tests',
  jobId: string,
): Promise<GenerationJob> {
  const endpoint = `/generation/${type}/job/${jobId}`;
  const fetchResponse = await callApi(endpoint);

  const json = await fetchResponse.json();
  const result = JobStatusResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.job) {
    throw new Error(response.error || 'Failed to get job status');
  }

  // Cast result to GenerationJob type - the schema validates the structure
  return response.job as GenerationJob;
}

// Synchronous analysis endpoints (for quick insights)

export interface ConceptAnalysis {
  topics: string[];
  entities: string[];
  constraints: string[];
}

export interface DiversityMetrics {
  score: number;
  clusters?: number;
  gaps?: string[];
}

export interface CoverageAnalysis {
  requirements: Array<{
    id: string;
    description: string;
    coverageLevel: 'none' | 'partial' | 'full';
    matchingAssertions: string[];
  }>;
  overallScore: number;
  gaps: string[];
}

// Zod schemas for synchronous analysis responses
const ConceptAnalysisResponseSchema = z.object({
  success: z.boolean(),
  concepts: ConceptAnalysisSchema.optional(),
  error: z.string().optional(),
});

const DiversityMetricsResponseSchema = z.object({
  success: z.boolean(),
  diversity: DiversityMetricsSchema.optional(),
  error: z.string().optional(),
});

const CoverageAnalysisResponseSchema = z.object({
  success: z.boolean(),
  coverage: CoverageAnalysisSchema.optional(),
  error: z.string().optional(),
});

/**
 * Analyze concepts from prompts (synchronous).
 */
export async function analyzeConceptsSync(prompts: string[]): Promise<ConceptAnalysis> {
  const fetchResponse = await callApi('/generation/dataset/analyze-concepts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts }),
  });

  const json = await fetchResponse.json();
  const result = ConceptAnalysisResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.concepts) {
    throw new Error(response.error || 'Failed to analyze concepts');
  }

  return response.concepts;
}

/**
 * Measure diversity of test cases (synchronous).
 * Accepts either flat VarMapping objects or wrapped { vars: ... } objects.
 */
export async function measureDiversitySync(
  testCases: Array<Record<string, string> | { vars: Record<string, string> }>,
): Promise<DiversityMetrics> {
  // Normalize to flat mappings (server expects Array<Record<string, string>>)
  const normalizedTestCases = testCases.map((tc) =>
    'vars' in tc && typeof tc.vars === 'object' ? tc.vars : (tc as Record<string, string>),
  );
  const fetchResponse = await callApi('/generation/dataset/measure-diversity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testCases: normalizedTestCases }),
  });

  const json = await fetchResponse.json();
  const result = DiversityMetricsResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.diversity) {
    throw new Error(response.error || 'Failed to measure diversity');
  }

  return response.diversity;
}

/**
 * Analyze coverage of assertions against prompts (synchronous).
 */
export async function analyzeCoverageSync(
  prompts: string[],
  assertions: Assertion[],
): Promise<CoverageAnalysis> {
  const fetchResponse = await callApi('/generation/assertions/analyze-coverage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts, assertions }),
  });

  const json = await fetchResponse.json();
  const result = CoverageAnalysisResponseSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Invalid response from server: ' + result.error.message);
  }

  const response = result.data;
  if (!response.success || !response.coverage) {
    throw new Error(response.error || 'Failed to analyze coverage');
  }

  return response.coverage;
}
