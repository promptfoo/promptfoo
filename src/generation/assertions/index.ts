import dedent from 'dedent';
import cliState from '../../cliState';
import logger from '../../logger';
import { getDefaultProviders } from '../../providers/defaults';
import { loadApiProvider } from '../../providers/index';
import { sampleArray } from '../../util/generation';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { ProgressReporter } from '../shared/progressReporter';
import { getNumAssertions } from '../types';
import { generateSampleOutputs, validateAssertions } from './assertionValidator';
import { analyzeCoverage, extractRequirements } from './coverageAnalyzer';
import { generateNegativeTests } from './negativeTestGenerator';

import type { ApiProvider, Assertion, AssertionSet, Prompt, TestCase } from '../../types';
import type {
  AssertionGenerationOptions,
  AssertionGenerationResult,
  AssertionValidationResult,
  CoverageAnalysis,
  ProgressCallback,
} from '../types';

/**
 * Filters assertion array to only include regular assertions (not AssertionSets).
 * AssertionSets have type 'assert-set' and contain nested assertions.
 */
function filterToAssertions(items: (Assertion | AssertionSet)[]): Assertion[] {
  return items.filter((item): item is Assertion => item.type !== 'assert-set');
}

export {
  filterAssertionsByValidation,
  generateSampleOutputs,
  validateAssertions,
} from './assertionValidator';
// Re-export sub-modules
export {
  analyzeCoverage,
  extractRequirements,
  suggestAssertions,
} from './coverageAnalyzer';
export {
  createLengthLimitAssertion,
  createNotContainsAssertion,
  createPiiCheckAssertion,
  generateNegativeTests,
} from './negativeTestGenerator';

// Default options - numQuestions/numAssertions are handled by getNumAssertions()
const DEFAULT_OPTIONS: Partial<AssertionGenerationOptions> = {
  type: 'pi',
  assertionTypes: ['pi'],
};

interface GeneratedQuestion {
  label: string;
  question: string;
  question_source: string;
  question_type: string;
}

/**
 * Generates the prompt for evaluation questions.
 * Adapted from src/assertions/synthesis.ts with improvements.
 */
function generateQuestionsPrompt(
  prompts: string[],
  existingAssertions: Assertion[],
  numQuestions: number,
  instructions?: string,
): string {
  const promptsString = prompts
    .map((prompt, i) => `<Prompt index="${i + 1}">\n${prompt}\n</Prompt>`)
    .join('\n');

  const existingAssertionsString =
    existingAssertions.length > 0
      ? dedent`
          <existing_assertions>
          ${JSON.stringify(existingAssertions, null, 2)}
          </existing_assertions>
        `
      : '';

  return dedent`
    You are a senior data scientist specializing in LLM evaluation metrics.
    Analyze the application prompts and generate evaluation questions.

    ## Application Prompts

    <Prompts>
    ${promptsString}
    </Prompts>

    ${existingAssertionsString}

    ## Requirements

    1. Generate ${numQuestions} unique evaluation questions
    2. Prioritize questions implied by the prompts (question_source: "implied_in_instructions")
    3. Include both objective and subjective questions
    4. Avoid overlap with existing assertions
    5. Make questions specific and measurable

    ## Question Types

    - **core_for_application**: Essential for this specific application
    - **horizontal**: Generic quality checks (clarity, coherence, safety)
    - **format_check**: Output format and structure

    ${instructions ? `## Additional Instructions\n${instructions}` : ''}

    ## Output Format

    Respond with JSON:
    {
      "questions": [
        {
          "label": "Metric Name (3 words max)",
          "question": "The evaluation question",
          "question_source": "implied_in_instructions | fully_newly_generated",
          "question_type": "core_for_application | horizontal | format_check"
        }
      ]
    }

    Return ONLY the JSON object, no additional text.
  `;
}

/**
 * Generates the prompt to convert a question to Python code.
 * Adapted from src/assertions/synthesis.ts with full prompt for better results.
 */
function generatePythonConversionPrompt(prompts: string[], question: string): string {
  return dedent`
    You are a specialized system that analyzes an LLM evaluation question and generates a Python function to automatically check LLM responses against the specific criterion.
    Your task is to determine if the given evaluation question can be reliably answered using a deterministic Python function.

    ## Input Format
    You will be provided with:
    1. A description of the LLM application (string)
    2. A single evaluation question used to assess LLM responses (string)

    ## Output Format
    For the evaluation question, you must:

    - Determine if the question can be reliably answered with a deterministic Python function using ONLY the LLM response
    - If YES: Return only the Python function body (without the function signature) that:
      - Assumes the LLM's response text is available as a string variable named \`output\`
      - Returns a dictionary with two keys:
        - \`'pass'\`: boolean value (True if criterion is met, False if not)
        - \`'score'\`: float value (1.0 if criterion is met, 0.0 if not)
      - The Answer "Yes" to the question should correspond to \`{'pass': True, 'score': 1.0}\`
      - The answer "No" to the question should correspond to \`{'pass': False, 'score': 0.0}\`
      - Includes clear comments
      - Handles edge cases gracefully (e.g., empty responses, invalid formats)
      - Performs any necessary parsing of the response string (JSON parsing, text extraction, etc.)
    - If NO: Return the string "None" (when the question requires semantic understanding, subjective judgment, domain expertise, or requires examining the original prompt/input)

    ## Critical Requirements
    - The function must evaluate ONLY the LLM response itself, which will always be provided as a string
    - The evaluation question might refer to the LLM output by domain-specific terms (e.g., "story", "recipe", "code", "answer") based on the application description, rather than generic terms like "response" or "output"
    - Regardless of terminology used in the question, the variable name in your code must be "output".
    - If evaluation requires comparing the response to the original prompt/input, return "None"
    - If evaluation requires external knowledge, context, or resources, return "None"
    - When in doubt, return "None" rather than an unreliable function
    - Any required parsing (JSON, XML, etc.) must be handled within the function

    ## IMPORTANT
    - Return "None" for any evaluation that requires semantic understanding or could have multiple valid expressions
    - For questions about greetings, politeness, tone, style, or other subjective language features, return "None"
    - Avoid creating functions that rely on hardcoded lists of phrases, expressions, or patterns when the concept being evaluated could be expressed in many different ways
    - Only create functions for criteria that can be evaluated through standardized, unambiguous patterns or clear structural properties

    ## Guidelines for Function Generation

    ### Questions Suitable for Functions (return a function):
    - Counting elements (words, sentences, lines, items)
    - Checking for presence of specific strings, patterns, or structures within the response
    - Validating formats (JSON, dates, emails, etc.)
    - Measuring response length in characters/bytes etc
    - Checking for code syntax, structure, or presence of specific elements
    - Verifying mathematical properties or numerical ranges

    ### Questions NOT Suitable for Functions (return "None"):
    - Any evaluation requiring comparison to the original prompt
    - Evaluating relevance, accuracy, or helpfulness
    - Assessing tone, intent, style, sentiment or semantics
    - Checking factual correctness
    - Determining completeness of explanations
    - Evaluating creativity or originality
    - Assessing logical coherence or reasoning quality
    - Any judgment requiring domain expertise
    - Any evaluation that would require an exhaustive list of possible expressions (like apologies, call-to-action etc.)

    Please provide only the Python function body without markdown formatting or function signature.
    The function body should assume the LLM's response is available as a variable named \`output\`.
    Also include the necessary import statements within the function body itself.

    ## Example Input/Output Pairs

    ### Example 1:
    **Application Description:** A JSON API documentation system
    **Evaluation Question:** "Does the response contain valid JSON?"

    **Output:**
    import json
    import re

    # Try to find JSON blocks in the output
    json_block_pattern = r'\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`'
    json_blocks = re.findall(json_block_pattern, output)

    # Also look for content within curly braces that might be JSON
    potential_json = re.findall(r'(\\{[\\s\\S]*?\\})', output)

    # Combine all potential JSON content
    all_potential_json = json_blocks + potential_json

    # If we don't find any potential JSON patterns, return False
    if not all_potential_json:
        return {'pass': False, 'score': 0.0}

    # Try to parse each potential JSON block
    for json_str in all_potential_json:
        try:
            json.loads(json_str)
            return {'pass': True, 'score': 1.0}  # Valid JSON found
        except json.JSONDecodeError:
            continue

    return {'pass': False, 'score': 0.0}  # No valid JSON found

    ### Example 2:
    **Application Description:** A customer service chatbot
    **Evaluation Question:** "Does the response address the customer's initial query?"

    **Output:**
    None

    ### Example 3:
    **Application Description:** A code assistant that generates SQL queries.
    **Evaluation Question:** "Does the SQL query use a JOIN statement?"

    **Output:**
    import re

    # Convert to lowercase for case-insensitive matching
    output_lower = output.lower()

    # Extract code blocks if present
    code_blocks = re.findall(r'\`\`\`(?:sql)?([^\`]+)\`\`\`', output_lower)

    # If code blocks are found, check them first
    if code_blocks:
        for block in code_blocks:
            # Check for JOIN keyword with word boundaries
            if re.search(r'\\b(join|inner\\s+join|left\\s+join|right\\s+join|full\\s+join|cross\\s+join)\\b', block):
                return {'pass': True, 'score': 1.0}

    # If no code blocks or no JOIN found in code blocks, check the entire output
    join_patterns = [
        r'\\b(join)\\b',
        r'\\b(inner\\s+join)\\b',
        r'\\b(left\\s+join)\\b',
        r'\\b(right\\s+join)\\b',
        r'\\b(full\\s+join)\\b',
        r'\\b(cross\\s+join)\\b'
    ]

    for pattern in join_patterns:
        if re.search(pattern, output_lower):
            return {'pass': True, 'score': 1.0}

    return {'pass': False, 'score': 0.0}

    ### Example 4:
    **Application Description:** An eval agent that can plan weekend trips.
    **Evaluation Question:** "Does the response exceed 1500 words?"

    **Output:**
    # Split the output into words
    words = output.split()

    # Count the number of words
    word_count = len(words)

    # Check if the word count exceeds 1500
    if word_count > 1500:
        return {'pass': True, 'score': 1.0}
    return {'pass': False, 'score': 0.0}

    ### Example 5:
    **Application Description:** A customer service chatbot
    **Evaluation Question:** "Does the response start with a greeting?"

    **Output:**
    None

    Remember: When in doubt, return "None". It's better to use some other evaluation mechanism than to generate an unreliable function.

    <application_description>
      <Prompts>
    ${prompts.map((p, i) => `      ${i > 0 ? '  ' : ''}<Prompt>\n        ${p}\n      </Prompt>`).join('\n')}
      </Prompts>
    </application_description>
    <question>
    ${question}
    </question>
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
 * Main assertion generation function.
 *
 * Generates assertions using:
 * 1. Question extraction from prompts
 * 2. Python conversion for deterministic checks
 * 3. Coverage analysis (optional)
 * 4. Assertion validation (optional)
 * 5. Negative test generation (optional)
 *
 * @param prompts - Array of prompts to generate assertions for
 * @param existingTests - Existing test cases with assertions
 * @param options - Generation options
 * @param callbacks - Optional callbacks for progress updates
 * @returns Assertion generation result
 */
export async function generateAssertions(
  prompts: Prompt[],
  existingTests: TestCase[],
  options: Partial<AssertionGenerationOptions> = {},
  callbacks?: { onProgress?: ProgressCallback; jobId?: string },
): Promise<AssertionGenerationResult> {
  const startTime = Date.now();
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (prompts.length === 0) {
    throw new Error('Assertion generation requires at least one prompt');
  }

  const promptStrings = prompts.map((p) => p.raw);

  // Extract existing assertions
  const existingAssertions = existingTests.flatMap((t) => t.assert || []);

  // Initialize progress reporter with jobId for SSE streaming
  const progress = new ProgressReporter({
    callback: callbacks?.onProgress,
    showCli: !callbacks?.onProgress && logger.level !== 'debug',
    jobId: callbacks?.jobId,
    enableStreaming: !!callbacks?.jobId,
  });

  // Calculate total steps
  const totalSteps = calculateTotalSteps(mergedOptions);
  await progress.start(totalSteps, 'Initializing');

  const numQuestions = getNumAssertions(mergedOptions);
  logger.debug(`Starting assertion generation with ${numQuestions} questions`);

  // Load provider
  const provider = await loadProvider(mergedOptions.provider);
  const providerName = provider.id?.() || mergedOptions.provider || 'default';

  // Phase 1: Coverage analysis (optional)
  let coverage: CoverageAnalysis | undefined;
  if (mergedOptions.coverage?.enabled) {
    progress.setPhase('Analyzing coverage');
    logger.debug('Extracting requirements and analyzing coverage');

    if (mergedOptions.coverage.extractRequirements) {
      const requirements = await extractRequirements(promptStrings, provider);
      // Filter to only regular assertions (not AssertionSets)
      coverage = await analyzeCoverage(requirements, filterToAssertions(existingAssertions));
      progress.increment();
    }
  }

  // Phase 2: Generate questions
  progress.setPhase('Generating questions');
  logger.debug('Generating evaluation questions');

  const questionsPrompt = generateQuestionsPrompt(
    promptStrings,
    filterToAssertions(existingAssertions),
    numQuestions,
    mergedOptions.instructions,
  );

  const questionsResponse = await provider.callApi(questionsPrompt);
  invariant(typeof questionsResponse.output !== 'undefined', 'Provider response must have output');

  const questionsOutput =
    typeof questionsResponse.output === 'string'
      ? questionsResponse.output
      : JSON.stringify(questionsResponse.output);

  const questionObjects = extractJsonObjects(questionsOutput);
  invariant(questionObjects.length >= 1, 'Expected at least one JSON object in questions response');

  const questionsWrapper = questionObjects[0] as { questions: GeneratedQuestion[] };
  const questions = sampleArray(questionsWrapper.questions, numQuestions);

  logger.debug(`Generated ${questions.length} evaluation questions`);
  progress.increment();

  // Phase 3: Convert questions to assertions
  progress.setPhase('Converting to assertions');
  const assertions: Assertion[] = [];
  let pythonConverted = 0;

  // Set max tokens for Python conversion
  if (provider.config) {
    provider.config.maxTokens = 3000;
  }

  for (const question of questions) {
    const pythonPrompt = generatePythonConversionPrompt(promptStrings, question.question);
    const pythonResponse = await provider.callApi(pythonPrompt);
    let pythonOutput = String(pythonResponse.output || '');

    progress.increment();

    // Strip markdown code blocks if present
    const pythonCodeBlockMatch = pythonOutput.match(/```(?:python)?\s*([\s\S]*?)```/);
    if (pythonCodeBlockMatch) {
      pythonOutput = pythonCodeBlockMatch[1].trim();
    }

    // Check for various forms of "None" response
    const normalizedOutput = pythonOutput.toLowerCase().trim();
    const isNoneResponse =
      normalizedOutput === 'none' ||
      normalizedOutput === '"none"' ||
      normalizedOutput === "'none'" ||
      normalizedOutput.startsWith('{"none"') ||
      normalizedOutput.includes('"none":') ||
      // Check if it doesn't look like valid Python (no return statement, no imports, no assignments)
      (!pythonOutput.includes('return') &&
        !pythonOutput.includes('import') &&
        pythonOutput.length < 50);

    if (isNoneResponse) {
      // Use LLM-based assertion
      assertions.push({
        type: mergedOptions.type || 'pi',
        metric: question.label,
        value: question.question,
      });
    } else {
      // Use Python assertion
      pythonConverted++;
      assertions.push({
        type: 'python',
        metric: question.label,
        value: pythonOutput,
      });
    }
  }

  logger.debug(`Converted ${pythonConverted} questions to Python assertions`);

  // Phase 4: Validation (optional)
  let validation: AssertionValidationResult[] | undefined;
  if (mergedOptions.validation?.enabled) {
    progress.setPhase('Validating assertions');
    logger.debug('Validating assertions');

    let samples = mergedOptions.validation.sampleOutputs || [];

    if (samples.length === 0 && mergedOptions.validation.autoGenerateSamples) {
      const sampleCount = mergedOptions.validation.sampleCount || 5;
      samples = await generateSampleOutputs(promptStrings, provider, sampleCount);
      progress.increment();
    }

    if (samples.length > 0) {
      validation = await validateAssertions(assertions, samples, provider);
      progress.increment();
    }
  }

  // Phase 5: Negative tests (optional)
  let negativeTests: Assertion[] | undefined;
  if (mergedOptions.negativeTests?.enabled) {
    progress.setPhase('Generating negative tests');
    logger.debug('Generating negative test assertions');

    negativeTests = await generateNegativeTests(promptStrings, provider, {
      types: mergedOptions.negativeTests.types,
      count: mergedOptions.negativeTests.count,
    });

    progress.increment();
    logger.debug(`Generated ${negativeTests.length} negative tests`);
  }

  // Update coverage with new assertions
  if (coverage && mergedOptions.coverage?.enabled) {
    coverage = await analyzeCoverage(
      coverage.requirements.map((r) => r.requirement),
      [...filterToAssertions(existingAssertions), ...assertions, ...(negativeTests || [])],
    );
  }

  progress.stop();

  const durationMs = Date.now() - startTime;
  logger.debug(`Assertion generation completed in ${durationMs}ms`);

  return {
    assertions,
    coverage,
    validation,
    negativeTests,
    metadata: {
      totalGenerated: assertions.length,
      pythonConverted,
      durationMs,
      provider: providerName,
    },
  };
}

/**
 * Calculates total progress steps based on options.
 */
function calculateTotalSteps(options: Partial<AssertionGenerationOptions>): number {
  let steps = 0;

  // Coverage analysis
  if (options.coverage?.enabled) {
    steps += 1;
  }

  // Question generation
  steps += 1;

  // Python conversion (one per question)
  steps += getNumAssertions(options);

  // Validation
  if (options.validation?.enabled) {
    steps += options.validation.autoGenerateSamples ? 2 : 1;
  }

  // Negative tests
  if (options.negativeTests?.enabled) {
    steps += 1;
  }

  return steps;
}

/**
 * Backward-compatible synthesize function.
 * Wraps generateAssertions with the old interface.
 */
export async function synthesize(options: {
  prompts: string[];
  instructions?: string;
  tests: TestCase[];
  numQuestions?: number;
  provider?: string;
  type?: 'pi' | 'g-eval' | 'llm-rubric';
}): Promise<Assertion[]> {
  const result = await generateAssertions(
    options.prompts.map((raw) => ({ raw, label: raw.substring(0, 50) })),
    options.tests,
    {
      instructions: options.instructions,
      numQuestions: options.numQuestions,
      provider: options.provider,
      type: options.type,
    },
  );

  return result.assertions;
}
