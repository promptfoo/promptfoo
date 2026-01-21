import dedent from 'dedent';
import logger from '../../logger';
import { runPythonCode } from '../../python/wrapper';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';

import type { ApiProvider, Assertion } from '../../types';
import type { AssertionValidationResult, SampleOutput } from '../types';

/**
 * Executes a Python assertion against a sample output.
 * Returns true if the assertion passes, false otherwise.
 */
async function executePythonAssertion(
  pythonCode: string,
  output: string,
): Promise<{ pass: boolean; score: number }> {
  try {
    // Detect indentation style
    const isMultiline = pythonCode.includes('\n');
    let indentStyle = '    ';
    if (isMultiline) {
      const match = pythonCode.match(/^(?!\s*$)\s+/m);
      if (match) {
        indentStyle = match[0];
      }
    }

    // Wrap the assertion code in a main function
    const pythonScript = dedent`
      import json

      def main(output, context):
      ${
        isMultiline
          ? pythonCode
              .split('\n')
              .map((line) => `${indentStyle}${line}`)
              .join('\n')
          : `    return ${pythonCode}`
      }
    `;

    const result = await runPythonCode<{ pass?: boolean; score?: number } | boolean>(
      pythonScript,
      'main',
      [output, {}],
    );

    if (typeof result === 'object' && result !== null) {
      return {
        pass: Boolean(result.pass),
        score: Number(result.score) || 0,
      };
    }

    if (typeof result === 'boolean') {
      return { pass: result, score: result ? 1 : 0 };
    }

    return { pass: false, score: 0 };
  } catch (error) {
    logger.debug(`Python assertion execution failed: ${error}`);
    return { pass: false, score: 0 };
  }
}

/**
 * Evaluates an LLM-based assertion against a sample output.
 */
async function evaluateLlmAssertion(
  assertion: Assertion,
  output: string,
  provider: ApiProvider,
): Promise<{ pass: boolean; score: number }> {
  const assertionValue = typeof assertion.value === 'string' ? assertion.value : '';

  const evaluationPrompt = dedent`
    You are evaluating an LLM output against a specific criterion.

    ## Output to Evaluate
    <output>
    ${output}
    </output>

    ## Evaluation Criterion
    ${assertionValue}

    ## Task
    Determine if the output meets the criterion.

    Respond with JSON:
    {
      "pass": true/false,
      "score": 0.0-1.0,
      "reasoning": "Brief explanation"
    }
  `;

  const response = await provider.callApi(evaluationPrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response must have output');

  const responseOutput =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  const jsonObjects = extractJsonObjects(responseOutput);

  if (jsonObjects.length === 0) {
    return { pass: false, score: 0 };
  }

  const result = jsonObjects[0] as { pass?: boolean; score?: number };
  return {
    pass: Boolean(result.pass),
    score: Number(result.score) || (result.pass ? 1 : 0),
  };
}

/**
 * Validates a single assertion against a sample output.
 */
async function validateSingleAssertion(
  assertion: Assertion,
  sample: SampleOutput,
  provider: ApiProvider,
): Promise<{ actualPass: boolean; expectedPass: boolean; score: number }> {
  let actualPass = false;
  let score = 0;

  switch (assertion.type) {
    case 'python': {
      const pythonCode = typeof assertion.value === 'string' ? assertion.value : '';
      const result = await executePythonAssertion(pythonCode, sample.output);
      actualPass = result.pass;
      score = result.score;
      break;
    }

    case 'contains':
    case 'equals':
    case 'icontains': {
      const assertionValue = typeof assertion.value === 'string' ? assertion.value : '';
      const outputLower = sample.output.toLowerCase();
      const valueLower = assertionValue.toLowerCase();

      if (assertion.type === 'equals') {
        actualPass = sample.output === assertionValue;
      } else if (assertion.type === 'icontains') {
        actualPass = outputLower.includes(valueLower);
      } else {
        actualPass = sample.output.includes(assertionValue);
      }
      score = actualPass ? 1 : 0;
      break;
    }

    case 'regex': {
      try {
        const pattern = typeof assertion.value === 'string' ? assertion.value : '';
        const regex = new RegExp(pattern);
        actualPass = regex.test(sample.output);
        score = actualPass ? 1 : 0;
      } catch {
        actualPass = false;
        score = 0;
      }
      break;
    }

    case 'pi':
    case 'g-eval':
    case 'llm-rubric': {
      const result = await evaluateLlmAssertion(assertion, sample.output, provider);
      actualPass = result.pass;
      score = result.score;
      break;
    }

    default: {
      // For unknown types, try LLM evaluation
      const result = await evaluateLlmAssertion(assertion, sample.output, provider);
      actualPass = result.pass;
      score = result.score;
    }
  }

  return { actualPass, expectedPass: sample.expectedPass, score };
}

/**
 * Validates assertions against sample outputs.
 *
 * Tests each assertion against each sample and calculates:
 * - Accuracy: % of samples correctly classified
 * - False positives: Samples that should fail but passed
 * - False negatives: Samples that should pass but failed
 *
 * @param assertions - Array of assertions to validate
 * @param samples - Array of sample outputs with expected results
 * @param provider - LLM provider for evaluating LLM-based assertions
 * @returns Validation results for each assertion
 */
export async function validateAssertions(
  assertions: Assertion[],
  samples: SampleOutput[],
  provider: ApiProvider,
): Promise<AssertionValidationResult[]> {
  if (assertions.length === 0) {
    return [];
  }

  if (samples.length === 0) {
    logger.warn('No samples provided for assertion validation');
    return assertions.map((assertion) => ({
      assertion,
      accuracy: 0,
      falsePositives: 0,
      falseNegatives: 0,
      truePositives: 0,
      trueNegatives: 0,
      issues: ['No samples provided for validation'],
      recommendation: 'keep' as const,
    }));
  }

  logger.debug(`Validating ${assertions.length} assertions against ${samples.length} samples`);

  const results: AssertionValidationResult[] = [];

  for (const assertion of assertions) {
    let truePositives = 0;
    let trueNegatives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    const issues: string[] = [];

    for (const sample of samples) {
      const result = await validateSingleAssertion(assertion, sample, provider);

      if (result.actualPass && result.expectedPass) {
        truePositives++;
      } else if (!result.actualPass && !result.expectedPass) {
        trueNegatives++;
      } else if (result.actualPass && !result.expectedPass) {
        falsePositives++;
        issues.push(`False positive on sample: "${sample.output.substring(0, 50)}..."`);
      } else {
        falseNegatives++;
        issues.push(`False negative on sample: "${sample.output.substring(0, 50)}..."`);
      }
    }

    const total = samples.length;
    const accuracy = (truePositives + trueNegatives) / total;

    // Determine recommendation
    let recommendation: 'keep' | 'modify' | 'remove' = 'keep';
    if (accuracy < 0.5) {
      recommendation = 'remove';
    } else if (accuracy < 0.8 || falsePositives > 0) {
      recommendation = 'modify';
    }

    results.push({
      assertion,
      accuracy,
      falsePositives,
      falseNegatives,
      truePositives,
      trueNegatives,
      issues: issues.length > 0 ? issues.slice(0, 5) : undefined, // Limit issues
      recommendation,
    });

    logger.debug(
      `Assertion "${assertion.metric || assertion.type}" validation: ` +
        `accuracy=${(accuracy * 100).toFixed(1)}%, ` +
        `TP=${truePositives}, TN=${trueNegatives}, FP=${falsePositives}, FN=${falseNegatives}`,
    );
  }

  return results;
}

/**
 * Generates sample outputs for validation testing.
 *
 * @param prompts - Application prompts
 * @param provider - LLM provider
 * @param count - Number of samples to generate
 * @returns Array of sample outputs with expected pass/fail labels
 */
export async function generateSampleOutputs(
  prompts: string[],
  provider: ApiProvider,
  count: number = 5,
): Promise<SampleOutput[]> {
  logger.debug(`Generating ${count} sample outputs for validation`);

  const samplePrompt = dedent`
    You are generating sample LLM outputs for testing purposes.

    ## Application Prompts
    ${prompts.map((p) => `<Prompt>\n${p}\n</Prompt>`).join('\n')}

    ## Task
    Generate ${count} sample outputs that an LLM might produce for these prompts.
    Include a mix of:
    - Good outputs that meet all requirements (expectedPass: true)
    - Poor outputs that fail some requirements (expectedPass: false)

    For each sample, explain why it should pass or fail.

    Respond with JSON:
    {
      "samples": [
        {
          "output": "The actual LLM output text...",
          "expectedPass": true/false,
          "reason": "Why this should pass/fail"
        }
      ]
    }

    Generate exactly ${count} samples with roughly half passing and half failing.
    Return ONLY the JSON object.
  `;

  const response = await provider.callApi(samplePrompt);
  invariant(typeof response.output !== 'undefined', 'Provider response must have output');

  const output =
    typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  const jsonObjects = extractJsonObjects(output);

  if (jsonObjects.length === 0) {
    logger.warn('No samples generated');
    return [];
  }

  const result = jsonObjects[0] as { samples: unknown[] };
  if (!Array.isArray(result.samples)) {
    return [];
  }

  const samples: SampleOutput[] = [];

  for (const rawSample of result.samples) {
    if (typeof rawSample !== 'object' || rawSample === null) {
      continue;
    }

    const sample = rawSample as Record<string, unknown>;
    if (typeof sample.output !== 'string' || typeof sample.expectedPass !== 'boolean') {
      continue;
    }

    samples.push({
      output: sample.output,
      expectedPass: sample.expectedPass,
      reason: typeof sample.reason === 'string' ? sample.reason : undefined,
    });
  }

  logger.debug(`Generated ${samples.length} valid samples`);

  return samples;
}

/**
 * Filters assertions based on validation results.
 *
 * @param assertions - Original assertions
 * @param validationResults - Validation results
 * @param minAccuracy - Minimum accuracy to keep (default: 0.7)
 * @returns Filtered assertions that meet the accuracy threshold
 */
export function filterAssertionsByValidation(
  assertions: Assertion[],
  validationResults: AssertionValidationResult[],
  minAccuracy: number = 0.7,
): Assertion[] {
  return assertions.filter((_assertion, index) => {
    const result = validationResults[index];
    return result && result.accuracy >= minAccuracy;
  });
}
