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
  data: z
    .object({
      jobId: z.string(),
    })
    .optional(),
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
  data: z
    .object({
      job: GenerationJobSchema,
    })
    .optional(),
  error: z.string().optional(),
});

const ConceptAnalysisSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      relevance: z.number().optional(),
    }),
  ),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.string().optional(),
      occurrences: z.number().optional(),
    }),
  ),
  constraints: z.array(
    z.object({
      description: z.string(),
      type: z.enum(['format', 'content', 'behavior', 'length', 'style']).optional(),
      source: z.enum(['explicit', 'implied']).optional(),
    }),
  ),
  variableRelationships: z
    .array(
      z.object({
        variables: z.array(z.string()),
        relationship: z.string(),
      }),
    )
    .optional(),
});

const DiversityMetricsSchema = z.object({
  score: z.number(),
  clusters: z.number().optional(),
  gaps: z.array(z.string()).optional(),
});

// Frontend coverage shape (what UI expects)
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

/**
 * Normalize coverage data from backend shape to frontend shape.
 * Backend: { requirement: { id, description, ... }, coveredBy: [...], coverageLevel }
 * Frontend: { id, description, coverageLevel, matchingAssertions }
 */
function normalizeCoverage(coverage: unknown):
  | {
      requirements: Array<{
        id: string;
        description: string;
        coverageLevel: 'none' | 'partial' | 'full';
        matchingAssertions: string[];
      }>;
      overallScore: number;
      gaps: string[];
    }
  | undefined {
  if (!coverage || typeof coverage !== 'object') {
    return undefined;
  }

  const cov = coverage as Record<string, unknown>;
  if (!Array.isArray(cov.requirements)) {
    return undefined;
  }

  const normalizedRequirements = cov.requirements.map((req: unknown) => {
    if (!req || typeof req !== 'object') {
      return { id: '', description: '', coverageLevel: 'none' as const, matchingAssertions: [] };
    }

    const r = req as Record<string, unknown>;

    // Check if it's already in frontend shape
    if ('id' in r && 'description' in r && 'matchingAssertions' in r) {
      return {
        id: String(r.id || ''),
        description: String(r.description || ''),
        coverageLevel: (r.coverageLevel as 'none' | 'partial' | 'full') || 'none',
        matchingAssertions: Array.isArray(r.matchingAssertions) ? r.matchingAssertions : [],
      };
    }

    // Convert from backend shape: { requirement: {...}, coveredBy: [...], coverageLevel }
    const requirement = r.requirement as Record<string, unknown> | undefined;
    return {
      id: String(requirement?.id || requirement?.description?.toString().slice(0, 20) || ''),
      description: String(requirement?.description || ''),
      coverageLevel: (r.coverageLevel as 'none' | 'partial' | 'full') || 'none',
      matchingAssertions: Array.isArray(r.coveredBy) ? r.coveredBy : [],
    };
  });

  return {
    requirements: normalizedRequirements,
    overallScore: typeof cov.overallScore === 'number' ? cov.overallScore : 0,
    gaps: Array.isArray(cov.gaps) ? cov.gaps : [],
  };
}

/**
 * Normalize job result to ensure coverage data is in frontend shape.
 */
function normalizeJobResult(job: unknown): unknown {
  if (!job || typeof job !== 'object') {
    return job;
  }

  const j = job as Record<string, unknown>;
  if (!j.result || typeof j.result !== 'object') {
    return job;
  }

  const result = j.result as Record<string, unknown>;

  // Normalize assertions result coverage
  if (result.coverage) {
    result.coverage = normalizeCoverage(result.coverage);
  }

  // Normalize combined result assertions coverage
  if (result.assertions && typeof result.assertions === 'object') {
    const assertions = result.assertions as Record<string, unknown>;
    if (assertions.coverage) {
      assertions.coverage = normalizeCoverage(assertions.coverage);
    }
  }

  return job;
}

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
  if (!response.success || !response.data?.jobId) {
    throw new Error(response.error || 'Failed to start dataset generation');
  }

  return { jobId: response.data.jobId };
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
  if (!response.success || !response.data?.jobId) {
    throw new Error(response.error || 'Failed to start assertions generation');
  }

  return { jobId: response.data.jobId };
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
  if (!response.success || !response.data?.jobId) {
    throw new Error(response.error || 'Failed to start test suite generation');
  }

  return { jobId: response.data.jobId };
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
  if (!response.success || !response.data?.job) {
    throw new Error(response.error || 'Failed to get job status');
  }

  // Normalize the job result to ensure coverage data is in frontend shape
  const normalizedJob = normalizeJobResult(response.data.job);

  // Cast result to GenerationJob type - the schema validates the structure
  return normalizedJob as GenerationJob;
}

// Synchronous analysis endpoints (for quick insights)

export interface ConceptAnalysis {
  topics: Array<{
    name: string;
    description?: string;
    relevance?: number;
  }>;
  entities: Array<{
    name: string;
    type?: string;
    occurrences?: number;
  }>;
  constraints: Array<{
    description: string;
    type?: 'format' | 'content' | 'behavior' | 'length' | 'style';
    source?: 'explicit' | 'implied';
  }>;
  variableRelationships?: Array<{
    variables: string[];
    relationship: string;
  }>;
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
  data: z
    .object({
      concepts: ConceptAnalysisSchema,
    })
    .optional(),
  error: z.string().optional(),
});

const DiversityMetricsResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      diversity: DiversityMetricsSchema,
    })
    .optional(),
  error: z.string().optional(),
});

const CoverageAnalysisResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      coverage: CoverageAnalysisSchema,
    })
    .optional(),
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
  if (!response.success || !response.data?.concepts) {
    throw new Error(response.error || 'Failed to analyze concepts');
  }

  return response.data.concepts;
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
  if (!response.success || !response.data?.diversity) {
    throw new Error(response.error || 'Failed to measure diversity');
  }

  return response.data.diversity;
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
  if (!response.success || !response.data?.coverage) {
    throw new Error(response.error || 'Failed to analyze coverage');
  }

  // Normalize coverage data to frontend shape
  const normalized = normalizeCoverage(response.data.coverage);
  if (!normalized) {
    throw new Error('Invalid coverage data returned from server');
  }

  return normalized;
}

// =============================================================================
// Capabilities
// =============================================================================

export interface GenerationCapabilities {
  hasPiAccess: boolean;
  defaultAssertionType: 'pi' | 'g-eval' | 'llm-rubric';
}

/**
 * Get available generation capabilities based on server environment.
 */
export async function getGenerationCapabilities(): Promise<GenerationCapabilities> {
  try {
    const response = await callApi('/generation/capabilities');
    const data = await response.json();
    if (!data.success) {
      // Default to llm-rubric if check fails
      return { hasPiAccess: false, defaultAssertionType: 'llm-rubric' };
    }
    return data.data;
  } catch {
    // Default to llm-rubric if request fails
    return { hasPiAccess: false, defaultAssertionType: 'llm-rubric' };
  }
}
