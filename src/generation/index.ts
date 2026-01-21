/**
 * Generation module for dataset and assertion generation.
 *
 * This module provides improved dataset and assertion generation with:
 * - Concept-driven diversification
 * - Edge case generation
 * - Semantic diversity measurement
 * - Coverage analysis
 * - Assertion validation
 *
 * @example
 * ```typescript
 * import { generation } from 'promptfoo';
 *
 * // Generate dataset with diversity optimization
 * const result = await generation.generateDataset(prompts, existingTests, {
 *   numPersonas: 5,
 *   numTestCasesPerPersona: 3,
 *   edgeCases: { enabled: true },
 *   diversity: { enabled: true, targetScore: 0.7 },
 * });
 *
 * // Generate assertions with coverage analysis
 * const assertionResult = await generation.generateAssertions(prompts, existingTests, {
 *   numQuestions: 5,
 *   coverage: { enabled: true },
 *   negativeTests: { enabled: true },
 * });
 * ```
 *
 * @module generation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Dataset types
  ConceptAnalysis,
  ConceptExtractionOptions,
  DatasetGenerationOptions,
  DatasetGenerationResult,
  DiversityMetrics,
  DiversityOptions,
  EdgeCase,
  EdgeCaseOptions,
  EdgeCaseType,
  Persona,
  PersonaDemographics,
  PersonaOptions,
  VariableConstraints,
  // Assertion types
  AssertionGenerationOptions,
  AssertionGenerationResult,
  AssertionValidationResult,
  CoverageAnalysis,
  NegativeTestType,
  Requirement,
  RequirementCoverage,
  SampleOutput,
  // Combined types
  TestSuiteGenerationOptions,
  TestSuiteGenerationResult,
  // Job types
  GenerationJob,
  GenerationJobStatus,
  GenerationJobType,
  // Callback types
  ProgressCallback,
  ProgressReporterOptions,
  // API request types
  PromptInput,
  TestCaseInput,
  DatasetGenerateRequest,
  AssertionGenerateRequest,
  TestsGenerateRequest,
} from './types';

// =============================================================================
// Dataset Generation
// =============================================================================

export {
  // Main function
  generateDataset,
  // Backward-compatible function
  synthesize as synthesizeDataset,
  // Sub-modules
  extractConcepts,
  extractTopics,
  extractEntities,
  generatePersonas,
  generateSimplePersonas,
  personaToString,
  generateEdgeCases,
  generateEdgeCasesByType,
  measureDiversity,
  identifyGaps,
  analyzeVariableCoverage,
} from './dataset';

// =============================================================================
// Assertion Generation
// =============================================================================

export {
  // Main function
  generateAssertions,
  // Backward-compatible function
  synthesize as synthesizeAssertions,
  // Sub-modules
  extractRequirements,
  analyzeCoverage,
  suggestAssertions,
  validateAssertions,
  generateSampleOutputs,
  filterAssertionsByValidation,
  generateNegativeTests,
  createNotContainsAssertion,
  createPiiCheckAssertion,
  createLengthLimitAssertion,
} from './assertions';

// =============================================================================
// Shared Utilities
// =============================================================================

export {
  // Job management
  createJob,
  getJob,
  updateJobProgress,
  completeJob,
  failJob,
  addJobLog,
  deleteJob,
  listJobs,
  cleanupOldJobs,
  generationJobs,
} from './shared/jobManager';

export {
  // Progress reporting
  ProgressReporter,
  createNoOpProgressReporter,
  createCallbackProgressReporter,
  createCliProgressReporter,
  createJobProgressReporter,
} from './shared/progressReporter';

// =============================================================================
// Combined Test Suite Generation
// =============================================================================

import { generateDataset } from './dataset';
import { generateAssertions } from './assertions';
import type { Prompt, TestCase } from '../types';
import type {
  ProgressCallback,
  TestSuiteGenerationOptions,
  TestSuiteGenerationResult,
} from './types';

/**
 * Generates a complete test suite including both datasets and assertions.
 *
 * This function orchestrates both dataset and assertion generation, optionally
 * running them in parallel. When running sequentially, the generated test cases
 * can inform assertion generation for better coverage.
 *
 * @example
 * ```typescript
 * const result = await generateTestSuite(prompts, existingTests, {
 *   dataset: { numPersonas: 5, edgeCases: { enabled: true } },
 *   assertions: { coverage: { enabled: true } },
 *   parallel: false,
 * });
 * ```
 *
 * @param prompts - Array of prompts to generate test suite for
 * @param existingTests - Existing test cases to build upon
 * @param options - Generation options for dataset and assertions
 * @param callbacks - Optional callbacks for progress updates
 * @returns Combined test suite generation result
 */
export async function generateTestSuite(
  prompts: Prompt[],
  existingTests: TestCase[],
  options: Partial<TestSuiteGenerationOptions> = {},
  callbacks?: { onProgress?: ProgressCallback },
): Promise<TestSuiteGenerationResult> {
  const startTime = Date.now();

  // Apply defaults
  const parallel = options.parallel ?? false;
  const skipDataset = options.skipDataset ?? false;
  const skipAssertions = options.skipAssertions ?? false;

  let datasetResult: TestSuiteGenerationResult['dataset'];
  let assertionsResult: TestSuiteGenerationResult['assertions'];

  const datasetProvider = options.dataset?.provider;
  const assertionProvider = options.assertions?.provider;
  const provider = datasetProvider || assertionProvider || 'default';

  if (parallel && !skipDataset && !skipAssertions) {
    // Run both in parallel
    [datasetResult, assertionsResult] = await Promise.all([
      generateDataset(prompts, existingTests, options.dataset || {}, callbacks),
      generateAssertions(prompts, existingTests, options.assertions || {}, callbacks),
    ]);
  } else {
    // Run sequentially (default)
    if (!skipDataset) {
      datasetResult = await generateDataset(
        prompts,
        existingTests,
        options.dataset || {},
        callbacks,
      );
    }

    if (!skipAssertions) {
      // Use generated test cases for assertion coverage if available
      const testsForAssertions = datasetResult
        ? [...existingTests, ...datasetResult.testCases.map((vars) => ({ vars }))]
        : existingTests;

      assertionsResult = await generateAssertions(
        prompts,
        testsForAssertions,
        options.assertions || {},
        callbacks,
      );
    }
  }

  return {
    dataset: datasetResult,
    assertions: assertionsResult,
    metadata: {
      totalDurationMs: Date.now() - startTime,
      provider,
    },
  };
}
