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

// Imports for generateTestSuite function
import { generateAssertions } from './assertions';
import { generateDataset } from './dataset';

import type { Prompt, TestCase } from '../types';
import type {
  ProgressCallback,
  TestSuiteGenerationOptions,
  TestSuiteGenerationResult,
} from './types';

// =============================================================================
// Types
// =============================================================================

export type {
  AssertionGenerateRequest,
  // Assertion types
  AssertionGenerationOptions,
  AssertionGenerationResult,
  AssertionValidationResult,
  // Dataset types
  ConceptAnalysis,
  ConceptExtractionOptions,
  CoverageAnalysis,
  DatasetGenerateRequest,
  DatasetGenerationOptions,
  DatasetGenerationResult,
  DiversityMetrics,
  DiversityOptions,
  EdgeCase,
  EdgeCaseOptions,
  EdgeCaseType,
  // Job types
  GenerationJob,
  GenerationJobStatus,
  GenerationJobType,
  NegativeTestType,
  Persona,
  PersonaDemographics,
  PersonaOptions,
  // Callback types
  ProgressCallback,
  ProgressReporterOptions,
  // API request types
  PromptInput,
  Requirement,
  RequirementCoverage,
  SampleOutput,
  TestCaseInput,
  // Combined types
  TestSuiteGenerationOptions,
  TestSuiteGenerationResult,
  TestsGenerateRequest,
  VariableConstraints,
} from './types';

// =============================================================================
// Dataset Generation
// =============================================================================

export {
  analyzeVariableCoverage,
  // Sub-modules
  extractConcepts,
  extractEntities,
  extractTopics,
  // Main function
  generateDataset,
  generateEdgeCases,
  generateEdgeCasesByType,
  generatePersonas,
  generateSimplePersonas,
  identifyGaps,
  measureDiversity,
  personaToString,
  // Backward-compatible function
  synthesize as synthesizeDataset,
} from './dataset';

// =============================================================================
// Assertion Generation
// =============================================================================

export {
  analyzeCoverage,
  createLengthLimitAssertion,
  createNotContainsAssertion,
  createPiiCheckAssertion,
  // Sub-modules
  extractRequirements,
  filterAssertionsByValidation,
  // Main function
  generateAssertions,
  generateNegativeTests,
  generateSampleOutputs,
  suggestAssertions,
  // Backward-compatible function
  synthesize as synthesizeAssertions,
  validateAssertions,
} from './assertions';

// =============================================================================
// Shared Utilities
// =============================================================================

export {
  addJobLog,
  cleanupOldJobs,
  completeJob,
  // Job management
  createJob,
  deleteJob,
  failJob,
  generationJobs,
  getJob,
  listJobs,
  updateJobProgress,
} from './shared/jobManager';
export {
  createCallbackProgressReporter,
  createCliProgressReporter,
  createJobProgressReporter,
  createNoOpProgressReporter,
  // Progress reporting
  ProgressReporter,
} from './shared/progressReporter';

// =============================================================================
// Combined Test Suite Generation
// =============================================================================

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
