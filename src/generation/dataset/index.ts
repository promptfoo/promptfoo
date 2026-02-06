import dedent from 'dedent';
import cliState from '../../cliState';
import logger from '../../logger';
import { getDefaultProviders } from '../../providers/defaults';
import { loadApiProvider } from '../../providers/index';
import { retryWithDeduplication, sampleArray } from '../../util/generation';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { extractVariablesFromTemplates } from '../../util/templates';
import { ProgressReporter } from '../shared/progressReporter';
import { extractConcepts } from './conceptExtractor';
import { identifyGaps, measureDiversity } from './diversityMeasurement';
import { generateEdgeCases } from './edgeCaseGenerator';
import { generatePersonas, personaToString } from './personaGenerator';

import type { ApiProvider, Prompt, TestCase, VarMapping } from '../../types';
import type {
  ConceptAnalysis,
  DatasetGenerationOptions,
  DatasetGenerationResult,
  DiversityMetrics,
  EdgeCase,
  Persona,
  ProgressCallback,
} from '../types';

// Re-export sub-modules
export { extractConcepts, extractEntities, extractTopics } from './conceptExtractor';
export { analyzeVariableCoverage, identifyGaps, measureDiversity } from './diversityMeasurement';
export { generateEdgeCases, generateEdgeCasesByType } from './edgeCaseGenerator';
export { generatePersonas, generateSimplePersonas, personaToString } from './personaGenerator';

const DEFAULT_OPTIONS: DatasetGenerationOptions = {
  numPersonas: 5,
  numTestCasesPerPersona: 3,
};

/**
 * Generates the prompt for test case generation from a persona.
 */
function generateTestCasesPrompt(
  prompts: string[],
  persona: Persona | string,
  existingTests: TestCase[],
  numTestCases: number,
  variables: string[],
  concepts?: ConceptAnalysis,
  instructions?: string,
): string {
  const promptsString = prompts.map((prompt) => `<Prompt>\n${prompt}\n</Prompt>`).join('\n');

  const personaString = typeof persona === 'string' ? persona : personaToString(persona);

  const existingTestsString =
    existingTests.length > 0
      ? dedent`
          Here are some existing tests to avoid duplicating:
          ${sampleArray(existingTests, 50)
            .map((test) => {
              if (!test.vars) {
                return null;
              }
              return `<Test>\n${JSON.stringify(test.vars, null, 2)}\n</Test>`;
            })
            .filter(Boolean)
            .join('\n')}
        `
      : '';

  const conceptsString = concepts
    ? dedent`

      ## Context from Analysis

      **Topics:** ${concepts.topics.map((t) => t.name).join(', ')}
      **Entities:** ${concepts.entities.map((e) => e.name).join(', ')}
      **Constraints:** ${concepts.constraints.map((c) => c.description).join('; ')}
    `
    : '';

  return dedent`
    Consider ${prompts.length > 1 ? 'these prompts' : 'this prompt'}, which contains {{variables}}:

    ${promptsString}

    This is your persona:
    <Persona>
    ${personaString}
    </Persona>
    ${conceptsString}

    ${existingTestsString}

    Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

    You are a tester, so try to think of ${numTestCases} sets of values that would be interesting or unusual to test.${instructions ? ` ${instructions}` : ''}

    Your response should contain a JSON map of variable names to values, of the form:
    {
      "vars": [
        {${variables.map((v) => `"${v}": "value"`).join(', ')}}
      ]
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Loads the provider for generation.
 */
async function loadProvider(providerString?: string): Promise<ApiProvider> {
  if (typeof providerString === 'undefined') {
    return (await getDefaultProviders()).synthesizeProvider;
  }
  return loadApiProvider(providerString, { basePath: cliState.basePath });
}

/**
 * Main dataset generation function.
 *
 * Generates test cases using:
 * 1. Concept extraction from prompts
 * 2. Grounded persona generation
 * 3. Test case generation per persona
 * 4. Edge case generation (optional)
 * 5. Diversity measurement (optional)
 * 6. Iterative refinement to fill gaps (optional)
 *
 * @param prompts - Array of prompts to generate test cases for
 * @param existingTests - Existing test cases to avoid duplicating
 * @param options - Generation options
 * @param callbacks - Optional callbacks for progress updates
 * @returns Dataset generation result with test cases and metadata
 */
export async function generateDataset(
  prompts: Prompt[],
  existingTests: TestCase[],
  options: Partial<DatasetGenerationOptions> = {},
  callbacks?: { onProgress?: ProgressCallback; jobId?: string },
): Promise<DatasetGenerationResult> {
  const startTime = Date.now();
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (prompts.length === 0) {
    throw new Error('Dataset generation requires at least one prompt');
  }

  const promptStrings = prompts.map((p) => p.raw);

  // Initialize progress reporter with jobId for SSE streaming
  const progress = new ProgressReporter({
    callback: callbacks?.onProgress,
    showCli: !callbacks?.onProgress && logger.level !== 'debug',
    jobId: callbacks?.jobId,
    enableStreaming: !!callbacks?.jobId,
  });

  // Calculate total steps for progress
  const totalSteps = calculateTotalSteps(mergedOptions);
  await progress.start(totalSteps, 'Initializing');

  logger.debug(
    `Starting dataset generation with ${mergedOptions.numPersonas} personas, ` +
      `${mergedOptions.numTestCasesPerPersona} test cases per persona`,
  );

  // Load provider
  const provider = await loadProvider(mergedOptions.provider);
  const providerName = provider.id?.() || mergedOptions.provider || 'default';

  // Extract variables from prompts
  const variables = extractVariablesFromTemplates(promptStrings);
  logger.debug(`Found ${variables.length} template variables: ${variables.join(', ')}`);

  // Phase 1: Concept extraction (optional but recommended)
  let concepts: ConceptAnalysis | undefined;
  if (mergedOptions.concepts) {
    progress.setPhase('Extracting concepts');
    logger.debug('Extracting concepts from prompts');
    concepts = await extractConcepts(promptStrings, provider, mergedOptions.concepts);
    progress.increment();
  }

  // Phase 2: Persona generation
  progress.setPhase('Generating personas');
  logger.debug('Generating personas');
  const personas = await generatePersonas(
    promptStrings,
    provider,
    {
      count: mergedOptions.numPersonas || 5,
      type: mergedOptions.personas?.type || 'mixed',
      grounded: mergedOptions.personas?.grounded ?? true,
      includeEdgeCases: true,
    },
    concepts,
  );
  progress.increment();

  logger.debug(`Generated ${personas.length} personas`);

  // Phase 3: Test case generation
  progress.setPhase('Generating test cases');
  const testCases = await generateTestCasesFromPersonas(
    promptStrings,
    personas,
    existingTests,
    variables,
    provider,
    mergedOptions,
    concepts,
    progress,
  );

  // Phase 4: Edge case generation (optional)
  let edgeCases: EdgeCase[] | undefined;
  if (mergedOptions.edgeCases?.enabled) {
    progress.setPhase('Generating edge cases');
    logger.debug('Generating edge cases');
    edgeCases = await generateEdgeCases(promptStrings, provider, mergedOptions.edgeCases, concepts);
    progress.increment();
    logger.debug(`Generated ${edgeCases.length} edge cases`);
  }

  // Phase 5: Diversity measurement (optional)
  let diversity: DiversityMetrics | undefined;
  if (mergedOptions.diversity?.enabled) {
    progress.setPhase('Measuring diversity');
    logger.debug('Measuring test case diversity');
    diversity = await measureDiversity(testCases, provider);
    progress.increment();
    logger.debug(`Diversity score: ${diversity.score.toFixed(3)}`);
  }

  // Phase 6: Iterative refinement (optional)
  let finalTestCases = testCases;
  let iterationRounds = 0;

  if (mergedOptions.iterative?.enabled && concepts) {
    progress.setPhase('Iterative refinement');
    const maxRounds = mergedOptions.iterative.maxRounds || 2;
    const targetDiversity = mergedOptions.iterative.targetDiversity || 0.7;

    while (iterationRounds < maxRounds) {
      // Check if we need more iterations
      const currentDiversity = diversity || (await measureDiversity(finalTestCases, provider));
      if (currentDiversity.score >= targetDiversity) {
        logger.debug(`Target diversity reached (${currentDiversity.score.toFixed(3)})`);
        break;
      }

      // Identify gaps
      const gaps = await identifyGaps(finalTestCases, concepts, provider);
      if (gaps.length === 0) {
        logger.debug('No coverage gaps identified');
        break;
      }

      logger.debug(`Round ${iterationRounds + 1}: Found ${gaps.length} gaps to fill`);

      // Generate additional test cases to fill gaps
      const additionalCases = await generateTestCasesToFillGaps(
        promptStrings,
        gaps,
        variables,
        provider,
        mergedOptions.instructions,
      );

      finalTestCases = [...finalTestCases, ...additionalCases];
      diversity = await measureDiversity(finalTestCases, provider);

      iterationRounds++;
      progress.increment();
    }
  }

  // Note: Edge cases are NOT merged into testCases here.
  // They are returned separately in the result so callers can decide how to handle them.
  // This avoids duplication when callers merge them back.

  progress.stop();

  const durationMs = Date.now() - startTime;
  logger.debug(`Dataset generation completed in ${durationMs}ms`);

  return {
    testCases: finalTestCases,
    concepts,
    personas,
    diversity,
    edgeCases,
    metadata: {
      totalGenerated: finalTestCases.length,
      durationMs,
      provider: providerName,
      iterationRounds: iterationRounds > 0 ? iterationRounds : undefined,
    },
  };
}

/**
 * Generates test cases from personas.
 */
async function generateTestCasesFromPersonas(
  prompts: string[],
  personas: Persona[],
  existingTests: TestCase[],
  variables: string[],
  provider: ApiProvider,
  options: DatasetGenerationOptions,
  concepts: ConceptAnalysis | undefined,
  progress: ProgressReporter,
): Promise<VarMapping[]> {
  const numTestCasesPerPersona = options.numTestCasesPerPersona || 3;
  const totalTestCases = personas.length * numTestCasesPerPersona;

  // Track batch index separately to ensure persona diversity
  // We cycle through personas with each batch, regardless of test case count
  let batchIndex = 0;

  const generateBatch = async (currentTestCases: VarMapping[]): Promise<VarMapping[]> => {
    const remainingCount = totalTestCases - currentTestCases.length;
    // Generate test cases for one persona at a time (up to numTestCasesPerPersona)
    // This ensures we cycle through all personas before repeating
    const currentBatchSize = Math.min(remainingCount, numTestCasesPerPersona);

    // Use batch index for persona selection, not test case count
    // This ensures we rotate through all personas evenly
    const personaIndex = batchIndex % personas.length;
    const persona = personas[personaIndex];
    batchIndex++;

    logger.debug(
      `Generating ${currentBatchSize} test cases for persona ${personaIndex + 1} of ${personas.length}`,
    );

    const testCasesPrompt = generateTestCasesPrompt(
      prompts,
      persona,
      existingTests,
      currentBatchSize,
      variables,
      concepts,
      options.instructions,
    );

    const response = await provider.callApi(testCasesPrompt);
    invariant(typeof response.output !== 'undefined', 'Provider response must have output');

    const output =
      typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
    const jsonObjects = extractJsonObjects(output);

    invariant(jsonObjects.length >= 1, `Expected at least one JSON object in test case response`);

    const parsed = jsonObjects[0] as { vars: VarMapping[] };
    const newCases = parsed.vars || [];

    // Emit test cases for SSE streaming
    progress.emitTestCases(newCases);
    progress.incrementBy(newCases.length);

    return newCases;
  };

  const testCases = await retryWithDeduplication(generateBatch, totalTestCases);

  logger.debug(`Generated ${testCases.length} test cases`);

  // Trim to exact count if needed
  if (testCases.length > totalTestCases) {
    return sampleArray(testCases, totalTestCases);
  }

  return testCases;
}

/**
 * Generates additional test cases to fill identified gaps.
 */
async function generateTestCasesToFillGaps(
  prompts: string[],
  gaps: string[],
  variables: string[],
  provider: ApiProvider,
  instructions?: string,
): Promise<VarMapping[]> {
  const gapPrompt = dedent`
    You are generating test cases for an LLM application.

    ## Prompts
    ${prompts.map((p) => `<Prompt>\n${p}\n</Prompt>`).join('\n')}

    ## Variables
    ${variables.join(', ')}

    ## Coverage Gaps to Fill
    The following gaps have been identified in the current test coverage:
    ${gaps.map((g) => `- ${g}`).join('\n')}

    Generate ${Math.min(gaps.length * 2, 10)} test cases that specifically address these gaps.
    ${instructions ? `Additional instructions: ${instructions}` : ''}

    Respond with JSON:
    {
      "vars": [
        {${variables.map((v) => `"${v}": "value"`).join(', ')}}
      ]
    }

    Return ONLY the JSON object.
  `;

  const response = await provider.callApi(gapPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response must have output');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  const jsonObjects = extractJsonObjects(output);

  if (jsonObjects.length === 0) {
    logger.warn('No test cases generated to fill gaps');
    return [];
  }

  const parsed = jsonObjects[0] as { vars: VarMapping[] };
  return parsed.vars || [];
}

/**
 * Calculates total progress steps based on options.
 */
function calculateTotalSteps(options: DatasetGenerationOptions): number {
  let steps = 0;

  // Concept extraction
  if (options.concepts) {
    steps += 1;
  }

  // Persona generation
  steps += 1;

  // Test case generation (estimate based on batch size)
  const totalTestCases = (options.numPersonas || 5) * (options.numTestCasesPerPersona || 3);
  steps += totalTestCases;

  // Edge cases
  if (options.edgeCases?.enabled) {
    steps += 1;
  }

  // Diversity measurement
  if (options.diversity?.enabled) {
    steps += 1;
  }

  // Iterative refinement
  if (options.iterative?.enabled) {
    steps += options.iterative.maxRounds || 2;
  }

  return steps;
}

/**
 * Backward-compatible synthesize function.
 * Wraps generateDataset with the old interface.
 */
export async function synthesize(options: {
  prompts: string[];
  instructions?: string;
  tests: TestCase[];
  numPersonas?: number;
  numTestCasesPerPersona?: number;
  provider?: string;
}): Promise<VarMapping[]> {
  const result = await generateDataset(
    options.prompts.map((raw) => ({ raw, label: raw.substring(0, 50) })),
    options.tests,
    {
      instructions: options.instructions,
      numPersonas: options.numPersonas,
      numTestCasesPerPersona: options.numTestCasesPerPersona,
      provider: options.provider,
    },
  );

  return result.testCases;
}
