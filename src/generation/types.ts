import { z } from 'zod';

import type { Assertion, VarMapping } from '../types';

// =============================================================================
// Concept Extraction Types
// =============================================================================

export const ConceptAnalysisSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      relevance: z.number().min(0).max(1).optional(),
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

export type ConceptAnalysis = z.infer<typeof ConceptAnalysisSchema>;

export const ConceptExtractionOptionsSchema = z.object({
  maxTopics: z.number().int().positive().default(5),
  maxEntities: z.number().int().positive().default(10),
  includeConstraints: z.boolean().default(true),
  includeVariableRelationships: z.boolean().default(true),
});

export type ConceptExtractionOptions = z.infer<typeof ConceptExtractionOptionsSchema>;

// =============================================================================
// Persona Types
// =============================================================================

export const PersonaDemographicsSchema = z.object({
  ageRange: z.string().optional(),
  region: z.string().optional(),
  expertise: z.enum(['novice', 'intermediate', 'expert']).optional(),
  occupation: z.string().optional(),
});

export type PersonaDemographics = z.infer<typeof PersonaDemographicsSchema>;

export const PersonaSchema = z.object({
  name: z.string(),
  description: z.string(),
  demographics: PersonaDemographicsSchema.optional(),
  goals: z.array(z.string()).optional(),
  behaviors: z.array(z.string()).optional(),
  edge: z.string().optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const PersonaOptionsSchema = z.object({
  type: z.enum(['demographic', 'behavioral', 'role-based', 'mixed']).default('mixed'),
  grounded: z.boolean().default(true),
  count: z.number().int().positive().default(5),
  includeEdgeCases: z.boolean().default(true),
});

export type PersonaOptions = z.infer<typeof PersonaOptionsSchema>;

// =============================================================================
// Edge Case Types
// =============================================================================

export const EdgeCaseTypeSchema = z.enum([
  'boundary',
  'format',
  'empty',
  'special-chars',
  'adversarial',
  'length',
]);

export type EdgeCaseType = z.infer<typeof EdgeCaseTypeSchema>;

export const EdgeCaseSchema = z.object({
  vars: z.record(z.string(), z.string()),
  type: EdgeCaseTypeSchema,
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']).optional(),
});

export type EdgeCase = z.infer<typeof EdgeCaseSchema>;

export const EdgeCaseOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  types: z.array(EdgeCaseTypeSchema).default(['boundary', 'format', 'empty', 'special-chars']),
  count: z.number().int().nonnegative().default(10),
  includeAdversarial: z.boolean().default(false),
});

export type EdgeCaseOptions = z.infer<typeof EdgeCaseOptionsSchema>;

// =============================================================================
// Diversity Measurement Types
// =============================================================================

export const DiversityMetricsSchema = z.object({
  score: z.number().min(0).max(1),
  averageDistance: z.number(),
  minDistance: z.number(),
  maxDistance: z.number(),
  clusterCount: z.number().int().optional(),
  coverageGaps: z.array(z.string()).optional(),
  distribution: z
    .object({
      byTopic: z.record(z.string(), z.number()).optional(),
      byVariable: z
        .record(
          z.string(),
          z.object({
            uniqueValues: z.number(),
            coverage: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type DiversityMetrics = z.infer<typeof DiversityMetricsSchema>;

export const DiversityOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  targetScore: z.number().min(0).max(1).default(0.7),
  embeddingProvider: z.string().optional(),
  measureMethod: z.enum(['embedding', 'text', 'hybrid']).default('embedding'),
});

export type DiversityOptions = z.infer<typeof DiversityOptionsSchema>;

// =============================================================================
// Variable Validation Types
// =============================================================================

export const VariableConstraintsSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
  enum: z.array(z.string()).optional(),
  type: z.enum(['string', 'number', 'email', 'url', 'date']).optional(),
});

export type VariableConstraints = z.infer<typeof VariableConstraintsSchema>;

// =============================================================================
// Dataset Generation Types
// =============================================================================

export const DatasetGenerationOptionsSchema = z.object({
  // Backward compatible options
  instructions: z.string().optional(),
  numPersonas: z.number().int().positive().default(5),
  numTestCasesPerPersona: z.number().int().positive().default(3),
  provider: z.string().optional(),

  // New concept options
  concepts: z
    .object({
      maxTopics: z.number().int().positive().default(5),
      maxEntities: z.number().int().positive().default(10),
      extractRelationships: z.boolean().default(true),
    })
    .optional(),

  // New persona options
  personas: z
    .object({
      type: z.enum(['demographic', 'behavioral', 'role-based', 'mixed']).default('mixed'),
      grounded: z.boolean().default(true),
    })
    .optional(),

  // Edge case options
  edgeCases: EdgeCaseOptionsSchema.optional(),

  // Diversity options
  diversity: DiversityOptionsSchema.optional(),

  // Iterative refinement options
  iterative: z
    .object({
      enabled: z.boolean().default(false),
      maxRounds: z.number().int().positive().default(2),
      targetDiversity: z.number().min(0).max(1).default(0.7),
    })
    .optional(),

  // Validation options
  validation: z
    .object({
      schemas: z.record(z.string(), z.any()).optional(),
      constraints: z.record(z.string(), VariableConstraintsSchema).optional(),
    })
    .optional(),
});

export type DatasetGenerationOptions = z.infer<typeof DatasetGenerationOptionsSchema>;

export interface DatasetGenerationResult {
  testCases: VarMapping[];
  concepts?: ConceptAnalysis;
  personas?: Persona[];
  diversity?: DiversityMetrics;
  edgeCases?: EdgeCase[];
  metadata: {
    totalGenerated: number;
    durationMs: number;
    provider: string;
    iterationRounds?: number;
  };
}

// =============================================================================
// Assertion Generation Types
// =============================================================================

export const RequirementSchema = z.object({
  id: z.string(),
  description: z.string(),
  source: z.enum(['explicit', 'implied']),
  testability: z.enum(['objective', 'subjective']),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  category: z.string().optional(),
});

export type Requirement = z.infer<typeof RequirementSchema>;

export const RequirementCoverageSchema = z.object({
  requirement: RequirementSchema,
  coveredBy: z.array(z.string()),
  coverageLevel: z.enum(['full', 'partial', 'none']),
  gaps: z.array(z.string()).optional(),
});

export type RequirementCoverage = z.infer<typeof RequirementCoverageSchema>;

export const CoverageAnalysisSchema = z.object({
  requirements: z.array(RequirementCoverageSchema),
  overallScore: z.number().min(0).max(1),
  gaps: z.array(z.string()),
  suggestions: z.array(z.string()).optional(),
});

export type CoverageAnalysis = z.infer<typeof CoverageAnalysisSchema>;

export const AssertionValidationResultSchema = z.object({
  assertion: z.any(),
  accuracy: z.number().min(0).max(1),
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
  truePositives: z.number().int().nonnegative(),
  trueNegatives: z.number().int().nonnegative(),
  issues: z.array(z.string()).optional(),
  recommendation: z.enum(['keep', 'modify', 'remove']).optional(),
});

export type AssertionValidationResult = z.infer<typeof AssertionValidationResultSchema>;

export const NegativeTestTypeSchema = z.enum([
  'should-not-contain',
  'should-not-hallucinate',
  'should-not-expose',
  'should-not-repeat',
  'should-not-exceed-length',
]);

export type NegativeTestType = z.infer<typeof NegativeTestTypeSchema>;

export const AssertionGenerationOptionsSchema = z.object({
  // Backward compatible options
  instructions: z.string().optional(),
  // Accept both numQuestions (legacy) and numAssertions (preferred)
  // Consumers should use getNumAssertions() helper to get the effective value
  numQuestions: z.number().int().positive().optional(),
  numAssertions: z.number().int().positive().optional(),
  provider: z.string().optional(),
  type: z.enum(['pi', 'g-eval', 'llm-rubric']).default('pi'),

  // Coverage options
  coverage: z
    .object({
      enabled: z.boolean().default(true),
      extractRequirements: z.boolean().default(true),
      minCoverageScore: z.number().min(0).max(1).default(0.8),
    })
    .optional(),

  // Validation options
  validation: z
    .object({
      enabled: z.boolean().default(false),
      sampleOutputs: z
        .array(
          z.object({
            output: z.string(),
            expectedPass: z.boolean(),
          }),
        )
        .optional(),
      autoGenerateSamples: z.boolean().default(false),
      sampleCount: z.number().int().positive().default(5),
    })
    .optional(),

  // Negative tests options
  negativeTests: z
    .object({
      enabled: z.boolean().default(false),
      types: z.array(NegativeTestTypeSchema).default(['should-not-contain']),
      count: z.number().int().nonnegative().default(3),
    })
    .optional(),

  // Output assertion types
  assertionTypes: z
    .array(z.enum(['pi', 'g-eval', 'llm-rubric', 'python', 'similar', 'json-schema']))
    .default(['pi']),
});

export type AssertionGenerationOptions = z.infer<typeof AssertionGenerationOptionsSchema>;

/**
 * Get the effective number of assertions from options.
 * Supports both numAssertions (preferred) and numQuestions (legacy) with fallback to 5.
 */
export function getNumAssertions(options: Partial<AssertionGenerationOptions>): number {
  return options.numAssertions ?? options.numQuestions ?? 5;
}

export interface AssertionGenerationResult {
  assertions: Assertion[];
  coverage?: CoverageAnalysis;
  validation?: AssertionValidationResult[];
  negativeTests?: Assertion[];
  metadata: {
    totalGenerated: number;
    pythonConverted: number;
    durationMs: number;
    provider: string;
  };
}

// =============================================================================
// Job Types
// =============================================================================

export const GenerationJobStatusSchema = z.enum(['pending', 'in-progress', 'complete', 'error']);

export type GenerationJobStatus = z.infer<typeof GenerationJobStatusSchema>;

export const GenerationJobSchema = z.object({
  id: z.string(),
  type: z.enum(['dataset', 'assertions', 'combined']),
  status: GenerationJobStatusSchema,
  progress: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  phase: z.string().optional(),
  result: z.any().optional(),
  error: z.string().optional(),
  logs: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GenerationJob = z.infer<typeof GenerationJobSchema>;

export type GenerationJobType = 'dataset' | 'assertions' | 'combined';

// =============================================================================
// Progress Callback Types
// =============================================================================

export type ProgressCallback = (current: number, total: number, phase: string) => void;

/** Callback for streaming individual test cases as they're generated */
export type TestCaseStreamCallback = (testCase: VarMapping, index: number) => void;

/** Callback for streaming individual assertions as they're generated */
export type AssertionStreamCallback = (assertion: Assertion, index: number) => void;

export interface ProgressReporterOptions {
  callback?: ProgressCallback;
  showCli?: boolean;
  jobId?: string;
  /** Enable streaming of individual items */
  enableStreaming?: boolean;
}

// =============================================================================
// Sample Output Types
// =============================================================================

export const SampleOutputSchema = z.object({
  output: z.string(),
  expectedPass: z.boolean(),
  reason: z.string().optional(),
});

export type SampleOutput = z.infer<typeof SampleOutputSchema>;

// =============================================================================
// Combined Test Suite Generation Types
// =============================================================================

export const TestSuiteGenerationOptionsSchema = z.object({
  dataset: DatasetGenerationOptionsSchema.partial().optional(),
  assertions: AssertionGenerationOptionsSchema.partial().optional(),
  parallel: z
    .boolean()
    .optional()
    .default(false)
    .describe('Run dataset and assertion generation in parallel'),
  skipDataset: z.boolean().optional().default(false),
  skipAssertions: z.boolean().optional().default(false),
});

export type TestSuiteGenerationOptions = z.infer<typeof TestSuiteGenerationOptionsSchema>;

export interface TestSuiteGenerationResult {
  dataset?: DatasetGenerationResult;
  assertions?: AssertionGenerationResult;
  metadata: {
    totalDurationMs: number;
    provider: string;
  };
}

// =============================================================================
// API Request/Response Schemas
// =============================================================================

export const PromptInputSchema = z.union([
  z.string(),
  z.object({
    raw: z.string(),
    label: z.string().optional(),
  }),
]);

export type PromptInput = z.infer<typeof PromptInputSchema>;

export const TestCaseInputSchema = z.object({
  vars: z.record(z.string(), z.any()).optional(),
  assert: z.array(z.any()).optional(),
  description: z.string().optional(),
});

export type TestCaseInput = z.infer<typeof TestCaseInputSchema>;

export const DatasetGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional(),
  options: DatasetGenerationOptionsSchema.optional(),
});

export type DatasetGenerateRequest = z.infer<typeof DatasetGenerateRequestSchema>;

export const AssertionGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional(),
  options: AssertionGenerationOptionsSchema.optional(),
});

export type AssertionGenerateRequest = z.infer<typeof AssertionGenerateRequestSchema>;

export const TestsGenerateRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  tests: z.array(TestCaseInputSchema).optional(),
  options: TestSuiteGenerationOptionsSchema.optional(),
});

export type TestsGenerateRequest = z.infer<typeof TestsGenerateRequestSchema>;

export const AnalyzeConceptsRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  options: ConceptExtractionOptionsSchema.optional(),
});

export type AnalyzeConceptsRequest = z.infer<typeof AnalyzeConceptsRequestSchema>;

export const MeasureDiversityRequestSchema = z.object({
  testCases: z.array(z.record(z.string(), z.string())).min(1),
  options: DiversityOptionsSchema.optional(),
});

export type MeasureDiversityRequest = z.infer<typeof MeasureDiversityRequestSchema>;

export const AnalyzeCoverageRequestSchema = z.object({
  prompts: z.array(PromptInputSchema).min(1),
  assertions: z.array(z.any()).min(1),
});

export type AnalyzeCoverageRequest = z.infer<typeof AnalyzeCoverageRequestSchema>;

export const ValidateAssertionsRequestSchema = z.object({
  assertions: z.array(z.any()).min(1),
  samples: z.array(SampleOutputSchema).min(1),
});

export type ValidateAssertionsRequest = z.infer<typeof ValidateAssertionsRequestSchema>;
