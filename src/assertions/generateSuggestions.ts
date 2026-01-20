import dedent from 'dedent';
import logger from '../logger';
import { getDefaultProviders } from '../providers/defaults';
import { loadApiProvider } from '../providers/index';
import { sampleArray } from '../util/generation';
import invariant from '../util/invariant';
import { extractJsonObjects } from '../util/json';

import type { ApiProvider, Assertion } from '../types/index';

interface GenerateSuggestionsOptions {
  prompts: string[];
  outputs: string[];
  existingAssertions?: Assertion[];
  numAssertions?: number;
  type?: 'llm-rubric' | 'g-eval';
  provider?: string;
  instructions?: string;
}

interface GeneratedQuestion {
  label: string;
  question: string;
  question_source: string;
  question_type: string;
}

function generateSuggestionsPrompt(
  prompts: string[],
  outputs: string[],
  existingAssertions: Assertion[],
  numAssertions: number,
): string {
  return dedent`
    Role: You are a senior data scientist specializing in metric design for AI systems.
    Your task is to analyze LLM prompts and their outputs, then generate evaluation assertions that can be used to assess response quality.

    You will be given:
    1. System prompts that define what the LLM should do
    2. Sample outputs from the LLM
    3. Any existing assertions already in place

    Generate evaluation questions that:
    - Assess individual AI responses based on the prompt requirements
    - Are objective and measurable where possible
    - Are atomic (test one thing each)
    - Don't overlap with existing assertions
    - Focus on what makes a good response for this specific use case

    Core Requirements:
    1. Questions should be phrased so "Yes" or higher scores indicate compliance with desired behavior
    2. Replace ambiguous terms with quantifiable criteria where possible
    3. Each question should test one attribute or relationship
    4. Questions should be self-contained (answerable from the output alone)

    Question Types:
    - CORE_FOR_APPLICATION: Essential checks specific to this application
    - FORMAT_CHECK: Output structure and format validation
    - HORIZONTAL: Generic quality checks (clarity, safety, etc.)

    <Prompts>
${prompts.map((prompt, i) => `    <Prompt${i + 1}>\n      ${prompt}\n    </Prompt${i + 1}>`).join('\n')}
    </Prompts>

    <SampleOutputs>
${outputs
  .slice(0, 5)
  .map(
    (output, i) =>
      `    <Output${i + 1}>\n      ${output.slice(0, 1000)}${output.length > 1000 ? '...' : ''}\n    </Output${i + 1}>`,
  )
  .join('\n')}
    </SampleOutputs>

    <ExistingAssertions>
      ${JSON.stringify(existingAssertions, null, 2)}
    </ExistingAssertions>

    Generate ${numAssertions} evaluation questions. Respond ONLY with JSON in this format:
    {
      "questions": [
        {
          "label": "Short Title",
          "question": "Does the response...?",
          "question_source": "implied_in_instructions" | "fully_newly_generated",
          "question_type": "core_for_application" | "format_check" | "horizontal"
        }
      ]
    }`;
}

export async function generateAssertionSuggestions({
  prompts,
  outputs,
  existingAssertions = [],
  numAssertions = 5,
  type = 'llm-rubric',
  provider,
  instructions,
}: GenerateSuggestionsOptions): Promise<Assertion[]> {
  if (prompts.length < 1) {
    throw new Error('At least one prompt is required for assertion generation.');
  }

  if (outputs.length < 1) {
    throw new Error('At least one output is required for assertion generation.');
  }

  logger.debug(
    `[generateAssertionSuggestions] Starting with ${prompts.length} prompts, ${outputs.length} outputs`,
  );

  let providerModel: ApiProvider;
  if (typeof provider === 'undefined') {
    providerModel = (await getDefaultProviders()).synthesizeProvider;
  } else {
    providerModel = await loadApiProvider(provider);
  }

  let suggestionPrompt = generateSuggestionsPrompt(
    prompts,
    outputs,
    existingAssertions,
    numAssertions,
  );

  if (instructions) {
    suggestionPrompt = `${suggestionPrompt}\n\nAdditional instructions: ${instructions}`;
  }

  logger.debug(`[generateAssertionSuggestions] Generated prompt:\n${suggestionPrompt}`);

  const resp = await providerModel.callApi(suggestionPrompt);

  logger.debug(`[generateAssertionSuggestions] Received response:\n${resp.output}`);

  invariant(typeof resp.output !== 'undefined', 'Provider response must have output');

  const output = typeof resp.output === 'string' ? resp.output : JSON.stringify(resp.output);
  const respObjects = extractJsonObjects(output);

  invariant(
    respObjects.length >= 1,
    `Expected at least one JSON object in the response, got ${respObjects.length}`,
  );

  const questionsWrapper = respObjects[0] as { questions: GeneratedQuestion[] };
  const questions = sampleArray(questionsWrapper.questions, numAssertions);

  logger.debug(
    `[generateAssertionSuggestions] Generated ${questions.length} questions:\n${questions.map((q) => `  - ${q.question}`).join('\n')}`,
  );

  // Convert questions to assertions
  const assertions: Assertion[] = questions.map((q) => ({
    type,
    metric: q.label,
    value: q.question,
  }));

  return assertions;
}
