import dedent from 'dedent';
import path from 'path';
import { loadFromJavaScriptFile } from './assertions/utils';
import cliState from './cliState';
import { getEnvString } from './envars';
import logger from './logger';
import {
  ANSWER_RELEVANCY_GENERATE,
  SELECT_BEST_PROMPT,
  CONTEXT_FAITHFULNESS_LONGFORM,
  CONTEXT_FAITHFULNESS_NLI_STATEMENTS,
  CONTEXT_RECALL,
  CONTEXT_RECALL_ATTRIBUTED_TOKEN,
  CONTEXT_RELEVANCE,
  CONTEXT_RELEVANCE_BAD,
  DEFAULT_GRADING_PROMPT,
  OPENAI_CLOSED_QA_PROMPT,
  OPENAI_FACTUALITY_PROMPT,
} from './prompts';
import { loadApiProvider } from './providers';
import { getDefaultProviders } from './providers/defaults';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from './redteam/constants';
import { shouldGenerateRemote } from './redteam/remoteGeneration';
import { doRemoteGrading } from './remoteGrading';
import type {
  ApiClassificationProvider,
  ApiEmbeddingProvider,
  ApiProvider,
  ApiSimilarityProvider,
  GradingConfig,
  GradingResult,
  ProviderOptions,
  ProviderTypeMap,
  TokenUsage,
  ProviderType,
  ApiModerationProvider,
} from './types';
import { maybeLoadFromExternalFile } from './util';
import { isJavascriptFile } from './util/file';
import invariant from './util/invariant';
import { extractJsonObjects } from './util/json';
import { getNunjucksEngine } from './util/templates';

const nunjucks = getNunjucksEngine(undefined, false, true);

function cosineSimilarity(vecA: number[], vecB: number[]) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

function fromVars(vars?: Record<string, string | object>) {
  if (!vars) {
    return {};
  }

  const ret: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (typeof value === 'object') {
      ret[key] = JSON.stringify(value);
    } else {
      ret[key] = JSON.stringify(value).slice(1, -1);
    }
  }

  return ret;
}

async function loadFromProviderOptions(provider: ProviderOptions) {
  invariant(
    typeof provider === 'object',
    `Provider must be an object, but received a ${typeof provider}: ${provider}`,
  );
  invariant(
    !Array.isArray(provider),
    `Provider must be an object, but received an array: ${JSON.stringify(provider)}`,
  );
  invariant(provider.id, 'Provider supplied to assertion must have an id');
  // TODO(ian): set basepath if invoked from filesystem config
  return loadApiProvider(provider.id, { options: provider as ProviderOptions });
}

export async function getGradingProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
): Promise<ApiProvider | null> {
  let finalProvider: ApiProvider | null;
  if (typeof provider === 'string') {
    // Defined as a string
    finalProvider = await loadApiProvider(provider);
  } else if (typeof provider === 'object' && typeof (provider as ApiProvider).id === 'function') {
    // Defined as an ApiProvider interface
    finalProvider = provider as ApiProvider;
  } else if (typeof provider === 'object') {
    const typeValue = (provider as ProviderTypeMap)[type];
    if (typeValue) {
      // Defined as embedding, classification, or text record
      finalProvider = await getGradingProvider(type, typeValue, defaultProvider);
    } else if ((provider as ProviderOptions).id) {
      // Defined as ProviderOptions
      finalProvider = await loadFromProviderOptions(provider as ProviderOptions);
    } else if (Array.isArray(provider)) {
      throw new Error(
        `Provider must be an object or string, but received an array.\n\nCheck that the provider ${JSON.stringify(
          provider[0],
          null,
          2,
        )} is not nested in an array.`,
      );
    } else {
      throw new Error(
        `Invalid provider definition for output type '${type}': ${JSON.stringify(
          provider,
          null,
          2,
        )}`,
      );
    }
  } else {
    finalProvider = defaultProvider;
  }
  return finalProvider;
}

export async function getAndCheckProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
  checkName: string,
): Promise<ApiProvider> {
  const matchedProvider = await getGradingProvider(type, provider, defaultProvider);
  if (!matchedProvider) {
    if (defaultProvider) {
      logger.warn(`No provider of type ${type} found for '${checkName}', falling back to default`);
      return defaultProvider;
    } else {
      throw new Error(`No provider of type ${type} found for '${checkName}'`);
    }
  }

  let isValidProviderType = true;
  if (type === 'embedding') {
    isValidProviderType =
      'callEmbeddingApi' in matchedProvider || 'callSimilarityApi' in matchedProvider;
  } else if (type === 'classification') {
    isValidProviderType = 'callClassificationApi' in matchedProvider;
  } else if (type === 'moderation') {
    isValidProviderType = 'callModerationApi' in matchedProvider;
  }

  if (!isValidProviderType) {
    if (defaultProvider) {
      logger.warn(
        `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}', falling back to default`,
      );
      return defaultProvider;
    } else {
      throw new Error(
        `Provider ${matchedProvider.id()} is not a valid ${type} provider for '${checkName}'`,
      );
    }
  }

  return matchedProvider;
}

function fail(reason: string, tokensUsed?: Partial<TokenUsage>): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    score: 0,
    reason,
    tokensUsed: {
      total: tokensUsed?.total || 0,
      prompt: tokensUsed?.prompt || 0,
      completion: tokensUsed?.completion || 0,
      cached: tokensUsed?.cached || 0,
      completionDetails: tokensUsed?.completionDetails,
    },
  };
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (cliState.config?.redteam && shouldGenerateRemote()) {
    try {
      return doRemoteGrading({
        task: 'similar',
        expected,
        output,
        threshold,
        inverse,
      });
    } catch (error) {
      return fail(`Could not perform remote grading: ${error}`);
    }
  }

  const finalProvider = (await getAndCheckProvider(
    'embedding',
    grading?.provider,
    (await getDefaultProviders()).embeddingProvider,
    'similarity check',
  )) as ApiEmbeddingProvider | ApiSimilarityProvider;

  let similarity: number;
  let tokensUsed: TokenUsage = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  if ('callSimilarityApi' in finalProvider) {
    const similarityResp = await finalProvider.callSimilarityApi(expected, output);
    tokensUsed = {
      ...tokensUsed,
      ...similarityResp.tokenUsage,
    };
    if (similarityResp.error) {
      return fail(similarityResp.error, tokensUsed);
    }
    if (similarityResp.similarity == null) {
      return fail('Unknown error fetching similarity', tokensUsed);
    }
    similarity = similarityResp.similarity;
  } else if ('callEmbeddingApi' in finalProvider) {
    const expectedEmbedding = await finalProvider.callEmbeddingApi(expected);
    const outputEmbedding = await finalProvider.callEmbeddingApi(output);

    tokensUsed = {
      total: (expectedEmbedding.tokenUsage?.total || 0) + (outputEmbedding.tokenUsage?.total || 0),
      prompt:
        (expectedEmbedding.tokenUsage?.prompt || 0) + (outputEmbedding.tokenUsage?.prompt || 0),
      completion:
        (expectedEmbedding.tokenUsage?.completion || 0) +
        (outputEmbedding.tokenUsage?.completion || 0),
      cached:
        (expectedEmbedding.tokenUsage?.cached || 0) + (outputEmbedding.tokenUsage?.cached || 0),
      completionDetails: {
        reasoning:
          (expectedEmbedding.tokenUsage?.completionDetails?.reasoning || 0) +
          (outputEmbedding.tokenUsage?.completionDetails?.reasoning || 0),
        acceptedPrediction:
          (expectedEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0) +
          (outputEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0),
        rejectedPrediction:
          (expectedEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0) +
          (outputEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0),
      },
    };

    if (expectedEmbedding.error || outputEmbedding.error) {
      return fail(
        expectedEmbedding.error || outputEmbedding.error || 'Unknown error fetching embeddings',
        tokensUsed,
      );
    }

    if (!expectedEmbedding.embedding || !outputEmbedding.embedding) {
      return fail('Embedding not found', tokensUsed);
    }

    similarity = cosineSimilarity(expectedEmbedding.embedding, outputEmbedding.embedding);
  } else {
    throw new Error('Provider must implement callSimilarityApi or callEmbeddingApi');
  }
  const pass = inverse
    ? similarity <= threshold + Number.EPSILON
    : similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Similarity ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity.toFixed(2)} is less than threshold ${threshold}`;
  if (pass) {
    return {
      pass: true,
      score: inverse ? 1 - similarity : similarity,
      reason: inverse ? lessThanReason : greaterThanReason,
      tokensUsed,
    };
  }
  return {
    pass: false,
    score: inverse ? 1 - similarity : similarity,
    reason: inverse ? greaterThanReason : lessThanReason,
    tokensUsed,
  };
}

/**
 *
 * @param expected Expected classification. If undefined, matches any classification.
 * @param output Text to classify.
 * @param threshold Value between 0 and 1. If the expected classification is undefined, the threshold is the minimum score for any classification. If the expected classification is defined, the threshold is the minimum score for that classification.
 * @param grading
 * @returns Pass if the output matches the classification with a score greater than or equal to the threshold.
 */
export async function matchesClassification(
  expected: string | undefined,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const finalProvider = (await getAndCheckProvider(
    'classification',
    grading?.provider,
    null,
    'classification check',
  )) as ApiClassificationProvider;

  const resp = await finalProvider.callClassificationApi(output);

  if (!resp.classification) {
    return fail(resp.error || 'Unknown error fetching classification');
  }
  let score;
  if (expected === undefined) {
    score = Math.max(...Object.values(resp.classification));
  } else {
    score = resp.classification[expected] || 0;
  }

  if (score >= threshold - Number.EPSILON) {
    const reason =
      expected === undefined
        ? `Maximum classification score ${score.toFixed(2)} >= ${threshold}`
        : `Classification ${expected} has score ${score.toFixed(2)} >= ${threshold}`;
    return {
      pass: true,
      score,
      reason,
    };
  }
  return {
    pass: false,
    score,
    reason: `Classification ${expected} has score ${score.toFixed(2)} < ${threshold}`,
  };
}

async function loadRubricPrompt(
  rubricPrompt: string | object | undefined,
  defaultPrompt: string,
): Promise<string> {
  if (!rubricPrompt) {
    return defaultPrompt;
  }

  if (
    typeof rubricPrompt === 'string' &&
    rubricPrompt.startsWith('file://') &&
    isJavascriptFile(rubricPrompt)
  ) {
    const basePath = cliState.basePath || '';
    let filePath = rubricPrompt.slice('file://'.length);

    const [pathPart, functionName] = filePath.split(':');
    filePath = path.resolve(basePath, pathPart);
    rubricPrompt = await loadFromJavaScriptFile(filePath, functionName, []);
  } else {
    // Load from external file if needed
    rubricPrompt = maybeLoadFromExternalFile(rubricPrompt);
  }

  // Stringify if it's an object
  if (typeof rubricPrompt === 'object') {
    rubricPrompt = JSON.stringify(rubricPrompt);
  }

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  return rubricPrompt;
}

export async function renderLlmRubricPrompt(
  rubric: string,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
) {
  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DEFAULT_GRADING_PROMPT);

  return nunjucks.renderString(rubricPrompt, {
    output: JSON.stringify(llmOutput).slice(1, -1),
    rubric: JSON.stringify(rubric).slice(1, -1),
    ...fromVars(vars),
  });
}

export async function matchesLlmRubric(
  rubric: string,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  if (!grading.rubricPrompt && cliState.config?.redteam && shouldGenerateRemote()) {
    return doRemoteGrading({
      task: 'llm-rubric',
      rubric,
      output: llmOutput,
      vars: vars || {},
    });
  }

  const prompt = await renderLlmRubricPrompt(rubric, llmOutput, grading, vars);

  const defaultProviders = await getDefaultProviders();
  const defaultProvider =
    defaultProviders.llmRubricProvider || defaultProviders.gradingJsonProvider;
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    'llm-rubric check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'llm-rubric produced malformed response');
  try {
    const jsonObjects = extractJsonObjects(resp.output);
    if (jsonObjects.length === 0) {
      return fail('Could not extract JSON from llm-rubric response', resp.tokenUsage);
    }
    const parsed = jsonObjects[0] as Partial<GradingResult>;
    const pass = parsed.pass ?? (typeof parsed.score === 'undefined' ? true : parsed.score > 0);
    return {
      pass,
      score: parsed.score ?? (pass ? 1.0 : 0.0),
      reason: parsed.reason || (pass ? 'Grading passed' : 'Grading failed'),
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
        completionDetails: parsed.tokensUsed?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  } catch (err) {
    return fail(
      `llm-rubric produced malformed response: ${err}\n\n${resp.output}`,
      resp.tokenUsage,
    );
  }
}

export async function matchesFactuality(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_FACTUALITY_PROMPT);
  const prompt = nunjucks.renderString(rubricPrompt, {
    input: JSON.stringify(input).slice(1, -1),
    ideal: JSON.stringify(expected).slice(1, -1),
    completion: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'factuality check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'factuality produced malformed response');
  try {
    const output = resp.output;
    // The preferred output starts like "(A)...", but we also support leading whitespace, lowercase letters, and omitting the first parenthesis.
    const answerMatch = output.match(/\s*\(?([a-eA-E])\)/);
    if (!answerMatch) {
      return fail(
        `Factuality checker output did not match expected format: ${output}`,
        resp.tokenUsage,
      );
    }
    const option = answerMatch[1].toUpperCase();

    let reason = '';

    const scoreLookup: Record<string, number> = {
      A: grading.factuality?.subset ?? 1,
      B: grading.factuality?.superset ?? 1,
      C: grading.factuality?.agree ?? 1,
      D: grading.factuality?.disagree ?? 0,
      E: grading.factuality?.differButFactual ?? 1,
    };

    // Passing is defined as scores with value >0, and failing as scores with value 0.
    const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
    const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);

    let pass = passing.includes(option) && !failing.includes(option);
    const optionReasons: Record<string, string> = {
      A: `The submitted answer is a subset of the expert answer and is fully consistent with it.`,
      B: `The submitted answer is a superset of the expert answer and is fully consistent with it.`,
      C: `The submitted answer contains all the same details as the expert answer.`,
      D: `There is a disagreement between the submitted answer and the expert answer.`,
      E: `The answers differ, but these differences don't matter from the perspective of factuality.`,
    };
    if (optionReasons[option]) {
      reason = optionReasons[option];
    } else {
      pass = false;
      reason = `Invalid option: ${option}. Full response from factuality checker: ${resp.output}`;
    }

    let score = pass ? 1 : 0;
    if (typeof scoreLookup[option] !== 'undefined') {
      score = scoreLookup[option];
    }

    return {
      pass,
      score,
      reason,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}

export async function matchesClosedQa(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_CLOSED_QA_PROMPT);
  const prompt = nunjucks.renderString(rubricPrompt, {
    input: JSON.stringify(input).slice(1, -1),
    criteria: JSON.stringify(expected).slice(1, -1),
    completion: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'model-graded-closedqa check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'model-graded-closedqa produced malformed response');
  try {
    const pass = resp.output.trimEnd().endsWith('Y');
    let reason;
    if (pass) {
      reason = 'The submission meets the criterion';
    } else if (resp.output.trimEnd().endsWith('N')) {
      reason = `The submission does not meet the criterion:\n${resp.output}`;
    } else {
      reason = `Model grader produced a malformed response:\n${resp.output}`;
    }
    return {
      pass,
      score: pass ? 1 : 0,
      reason,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
        cached: resp.tokenUsage?.cached || 0,
        completionDetails: resp.tokenUsage?.completionDetails || {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}

export async function matchesGEval(
  criteria: string,
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!input) {
    throw Error('No source text to estimate reply');
  }

  const maxScore = 10;
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'reply geval check',
  );

  const promptSteps = dedent`
    Given an evaluation criteria which outlines how you should judge some text, generate 3-4 concise evaluation steps for any text based on the criteria below.

    Evaluation Criteria:
    ${criteria}

    **
    IMPORTANT: Please make sure to only return in minified JSON format, with the "steps" key as a list of strings. No additional words, explanation or formatting is needed.
    Example JSON:
    {"steps": <list_of_strings>}
    **

    JSON:
    `;

  const respSteps = await textProvider.callApi(promptSteps);
  let steps;

  try {
    // NOTE: use regexp for reliable, because sometimes LLM wraps response to markdown format ```json...```
    steps = JSON.parse(respSteps.output.match(/\{"steps".+\}/g)[0]).steps;

    if (!steps.length) {
      return fail('LLM does not propose any evaluation step');
    }
  } catch {
    return fail(`LLM-proposed evaluation steps are not in JSON format: ${respSteps.output}`);
  }

  const promptText = dedent`
    You will be given one Reply for a Source Text below. Your task is to rate the Reply on one metric.
    Please make sure you read and understand these instructions carefully. Please keep this document open while reviewing, and refer to it as needed.

    Evaluation Criteria:
    ${criteria}

    Evaluation Steps:
    - ${steps.join('\n- ')}
    - Given the evaluation steps, return a JSON with two keys: 1) a "score" key ranging from 0 - ${maxScore}, with ${maxScore} being that it follows the Evaluation Criteria outlined in the Evaluation Steps and 0 being that it does not; 2) a "reason" key, a reason for the given score, but DO NOT QUOTE THE SCORE in your reason. Please mention specific information from Source Text and Reply in your reason, but be very concise with it!

    Source Text:
    ${input}

    Reply:
    ${output}

    **
    IMPORTANT: Please make sure to only return in minified JSON format, with the "score" and "reason" key. No additional words, explanation or formatting is needed.

    Example JSON:
    {"score":0,"reason":"The text does not follow the evaluation steps provided."}
    **

    JSON:
    `;

  const resp = await textProvider.callApi(promptText);
  let result;

  try {
    result = JSON.parse(resp.output.match(/\{.+\}/g)[0]);
  } catch {
    return fail(`LLM-proposed evaluation result is not in JSON format: ${resp.output}`);
  }

  return {
    pass: result.score / maxScore >= threshold,
    score: result.score / maxScore,
    reason: result.reason,
  };
}

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const embeddingProvider = await getAndCheckProvider(
    'embedding',
    grading?.provider,
    (await getDefaultProviders()).embeddingProvider,
    'answer relevancy check',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'answer relevancy check',
  );

  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  const candidateQuestions: string[] = [];
  for (let i = 0; i < 3; i++) {
    // TODO(ian): Parallelize
    const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, ANSWER_RELEVANCY_GENERATE);
    const promptText = nunjucks.renderString(rubricPrompt, {
      answer: JSON.stringify(output).slice(1, -1),
    });
    const resp = await textProvider.callApi(promptText);
    if (resp.error || !resp.output) {
      tokensUsed.total += resp.tokenUsage?.total || 0;
      tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
      tokensUsed.completion += resp.tokenUsage?.completion || 0;
      tokensUsed.cached += resp.tokenUsage?.cached || 0;
      tokensUsed.completionDetails = {
        reasoning:
          (tokensUsed.completionDetails?.reasoning || 0) +
          (resp.tokenUsage?.completionDetails?.reasoning || 0),
        acceptedPrediction:
          (tokensUsed.completionDetails?.acceptedPrediction || 0) +
          (resp.tokenUsage?.completionDetails?.acceptedPrediction || 0),
        rejectedPrediction:
          (tokensUsed.completionDetails?.rejectedPrediction || 0) +
          (resp.tokenUsage?.completionDetails?.rejectedPrediction || 0),
      };
      return fail(resp.error || 'No output', tokensUsed);
    }

    invariant(
      typeof resp.output === 'string',
      'answer relevancy check produced malformed response',
    );
    candidateQuestions.push(resp.output);
  }

  invariant(
    typeof embeddingProvider.callEmbeddingApi === 'function',
    `Provider ${embeddingProvider.id} must implement callEmbeddingApi for similarity check`,
  );

  const inputEmbeddingResp = await embeddingProvider.callEmbeddingApi(input);
  if (inputEmbeddingResp.error || !inputEmbeddingResp.embedding) {
    tokensUsed.total += inputEmbeddingResp.tokenUsage?.total || 0;
    tokensUsed.prompt += inputEmbeddingResp.tokenUsage?.prompt || 0;
    tokensUsed.completion += inputEmbeddingResp.tokenUsage?.completion || 0;
    tokensUsed.cached += inputEmbeddingResp.tokenUsage?.cached || 0;
    tokensUsed.completionDetails = {
      reasoning:
        (tokensUsed.completionDetails?.reasoning || 0) +
        (inputEmbeddingResp.tokenUsage?.completionDetails?.reasoning || 0),
      acceptedPrediction:
        (tokensUsed.completionDetails?.acceptedPrediction || 0) +
        (inputEmbeddingResp.tokenUsage?.completionDetails?.acceptedPrediction || 0),
      rejectedPrediction:
        (tokensUsed.completionDetails?.rejectedPrediction || 0) +
        (inputEmbeddingResp.tokenUsage?.completionDetails?.rejectedPrediction || 0),
    };
    return fail(inputEmbeddingResp.error || 'No embedding', tokensUsed);
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    tokensUsed.total += resp.tokenUsage?.total || 0;
    tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
    tokensUsed.completion += resp.tokenUsage?.completion || 0;
    tokensUsed.cached += resp.tokenUsage?.cached || 0;
    tokensUsed.completionDetails = {
      reasoning:
        (tokensUsed.completionDetails?.reasoning || 0) +
        (resp.tokenUsage?.completionDetails?.reasoning || 0),
      acceptedPrediction:
        (tokensUsed.completionDetails?.acceptedPrediction || 0) +
        (resp.tokenUsage?.completionDetails?.acceptedPrediction || 0),
      rejectedPrediction:
        (tokensUsed.completionDetails?.rejectedPrediction || 0) +
        (resp.tokenUsage?.completionDetails?.rejectedPrediction || 0),
    };
    if (resp.error || !resp.embedding) {
      return fail(resp.error || 'No embedding', tokensUsed);
    }
    similarities.push(cosineSimilarity(inputEmbedding, resp.embedding));
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Relevance ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Relevance ${similarity.toFixed(2)} is less than threshold ${threshold}`;
  if (pass) {
    return {
      pass: true,
      score: similarity,
      reason: greaterThanReason,
      tokensUsed,
    };
  }
  return {
    pass: false,
    score: similarity,
    reason: lessThanReason,
    tokensUsed,
  };
}

export async function matchesContextRecall(
  context: string,
  groundTruth: string,
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context recall check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RECALL);
  const promptText = nunjucks.renderString(rubricPrompt, {
    context: JSON.stringify(context).slice(1, -1),
    groundTruth: JSON.stringify(groundTruth).slice(1, -1),
    ...fromVars(vars),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-recall produced malformed response');
  const sentences = resp.output.split('\n');
  const numerator = sentences.reduce(
    (acc, sentence) => acc + (sentence.includes(CONTEXT_RECALL_ATTRIBUTED_TOKEN) ? 1 : 0),
    0,
  );
  const score = numerator / sentences.length;
  const pass = score >= threshold - Number.EPSILON;
  return {
    pass,
    score,
    reason: pass
      ? `Recall ${score.toFixed(2)} is >= ${threshold}`
      : `Recall ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesContextRelevance(
  question: string,
  context: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context relevance check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RELEVANCE);
  const promptText = nunjucks.renderString(rubricPrompt, {
    context: JSON.stringify(context).slice(1, -1),
    query: JSON.stringify(question).slice(1, -1),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-relevance produced malformed response');
  const sentences = resp.output.split('\n');
  const numerator = sentences.reduce(
    (acc, sentence) => acc + (sentence.includes(CONTEXT_RELEVANCE_BAD) ? 0 : 1),
    0,
  );
  const score = numerator / sentences.length;
  const pass = score >= threshold - Number.EPSILON;
  return {
    pass,
    score,
    reason: pass
      ? `Relevance ${score.toFixed(2)} is >= ${threshold}`
      : `Relevance ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesContextFaithfulness(
  query: string,
  output: string,
  context: string,
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'faithfulness check',
  );

  if (grading?.rubricPrompt) {
    invariant(Array.isArray(grading.rubricPrompt), 'rubricPrompt must be an array');
  }
  const longformPrompt: string =
    (typeof grading?.rubricPrompt?.[0] === 'string'
      ? grading?.rubricPrompt?.[0]
      : grading?.rubricPrompt?.[0].content) || CONTEXT_FAITHFULNESS_LONGFORM;
  const nliPrompt: string =
    (typeof grading?.rubricPrompt?.[1] === 'string'
      ? grading?.rubricPrompt?.[1]
      : grading?.rubricPrompt?.[1].content) || CONTEXT_FAITHFULNESS_NLI_STATEMENTS;

  let promptText = nunjucks.renderString(longformPrompt, {
    question: JSON.stringify(query).slice(1, -1),
    answer: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  let resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  const statements = resp.output.split('\n');
  promptText = nunjucks.renderString(nliPrompt, {
    context: JSON.stringify(context).slice(1, -1),
    statements: JSON.stringify(statements.join('\n')).slice(1, -1),
    ...fromVars(vars),
  });

  resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  let finalAnswer = 'Final verdict for each statement in order:';
  finalAnswer = finalAnswer.toLowerCase();
  let verdicts = resp.output.toLowerCase().trim();
  let score: number;
  if (verdicts.includes(finalAnswer)) {
    verdicts = verdicts.slice(verdicts.indexOf(finalAnswer) + finalAnswer.length);
    score =
      verdicts.split('.').filter((answer) => answer.trim() !== '' && !answer.includes('yes'))
        .length / statements.length;
  } else {
    score = (verdicts.split('verdict: no').length - 1) / statements.length;
  }
  score = 1 - score;
  const pass = score >= threshold - Number.EPSILON;
  return {
    pass,
    score,
    reason: pass
      ? `Faithfulness ${score.toFixed(2)} is >= ${threshold}`
      : `Faithfulness ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesSelectBest(
  criteria: string,
  outputs: string[],
  grading?: GradingConfig,
  vars?: Record<string, string | object>,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'select-best assertion must have at least two outputs to compare between',
  );
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'select-best check',
  );

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, SELECT_BEST_PROMPT);
  const promptText = nunjucks.renderString(rubricPrompt, {
    criteria: JSON.stringify(criteria).slice(1, -1),
    outputs: outputs.map((output) => JSON.stringify(output).slice(1, -1)),
    ...fromVars(vars),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return new Array(outputs.length).fill(fail(resp.error || 'No output', resp.tokenUsage));
  }

  invariant(typeof resp.output === 'string', 'select-best produced malformed response');

  const firstDigitMatch = resp.output.trim().match(/\d/);
  const verdict = firstDigitMatch ? Number.parseInt(firstDigitMatch[0], 10) : Number.NaN;

  if (Number.isNaN(verdict) || verdict < 0 || verdict >= outputs.length) {
    return new Array(outputs.length).fill(fail(`Invalid select-best verdict: ${verdict}`));
  }

  const tokensUsed = {
    total: resp.tokenUsage?.total || 0,
    prompt: resp.tokenUsage?.prompt || 0,
    completion: resp.tokenUsage?.completion || 0,
    cached: resp.tokenUsage?.cached || 0,
    completionDetails: resp.tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
  return outputs.map((output, index) => {
    if (index === verdict) {
      return {
        pass: true,
        score: 1,
        reason: `Output selected as the best: ${criteria}`,
        tokensUsed,
      };
    } else {
      return {
        pass: false,
        score: 0,
        reason: `Output not selected: ${criteria}`,
        tokensUsed,
      };
    }
  });
}

interface ModerationMatchOptions {
  userPrompt: string;
  assistantResponse: string;
  categories?: string[];
}

export async function matchesModeration(
  { userPrompt, assistantResponse, categories = [] }: ModerationMatchOptions,
  grading?: GradingConfig,
) {
  if (!assistantResponse) {
    return {
      pass: true,
      score: 1,
      reason: 'No output to moderate',
    };
  }

  // Get default providers
  const defaultProviders = await getDefaultProviders();

  // Only try to use Replicate if OpenAI is not available
  const hasOpenAiKey = getEnvString('OPENAI_API_KEY');
  const hasReplicateKey =
    !hasOpenAiKey && (getEnvString('REPLICATE_API_KEY') || getEnvString('REPLICATE_API_TOKEN'));
  const defaultModerationProvider = hasReplicateKey
    ? await loadApiProvider(LLAMA_GUARD_REPLICATE_PROVIDER)
    : defaultProviders.moderationProvider;

  const moderationProvider = (await getAndCheckProvider(
    'moderation',
    grading?.provider,
    defaultModerationProvider,
    'moderation check',
  )) as ApiModerationProvider;

  invariant(moderationProvider, 'Moderation provider must be defined');

  const resp = await moderationProvider.callModerationApi(userPrompt, assistantResponse);
  if (resp.error) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation API error: ${resp.error}`,
    };
  }

  const { flags } = resp;
  if (!flags || flags.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: 'No moderation flags detected',
    };
  }
  const filteredFlags =
    categories.length === 0 ? flags : flags.filter((flag) => categories.includes(flag.code));
  if (filteredFlags.length > 0) {
    return {
      pass: false,
      score: 0,
      reason: `Moderation flags detected: ${filteredFlags
        .map((flag) => flag.description)
        .join(', ')}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: 'No relevant moderation flags detected',
  };
}
