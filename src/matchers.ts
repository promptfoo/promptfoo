import * as fs from 'fs';
import path from 'path';

import { serializeContext } from './assertions/contextUtils';
import { loadFromJavaScriptFile } from './assertions/utils';
import cliState from './cliState';
import { getEnvBool, getEnvString } from './envars';
import logger from './logger';
import { DEFAULT_WEB_SEARCH_PROMPT } from './prompts/grading';
import {
  ANSWER_RELEVANCY_GENERATE,
  CONTEXT_FAITHFULNESS_LONGFORM,
  CONTEXT_FAITHFULNESS_NLI_STATEMENTS,
  CONTEXT_RECALL,
  CONTEXT_RECALL_ATTRIBUTED_TOKEN,
  CONTEXT_RECALL_NOT_ATTRIBUTED_TOKEN,
  CONTEXT_RELEVANCE,
  CONTEXT_RELEVANCE_BAD,
  DEFAULT_GRADING_PROMPT,
  GEVAL_PROMPT_EVALUATE,
  GEVAL_PROMPT_STEPS,
  OPENAI_CLOSED_QA_PROMPT,
  PROMPTFOO_FACTUALITY_PROMPT,
  SELECT_BEST_PROMPT,
} from './prompts/index';
import { getDefaultProviders } from './providers/defaults';
import { loadApiProvider } from './providers/index';
import { hasWebSearchCapability, loadWebSearchProvider } from './providers/webSearchUtils';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from './redteam/constants';
import { shouldGenerateRemote } from './redteam/remoteGeneration';
import { doRemoteGrading } from './remoteGrading';
import { doRemoteScoringWithPi } from './remoteScoring';
import { getNunjucksEngineForFilePath, maybeLoadFromExternalFile } from './util/file';
import { isJavascriptFile } from './util/fileExtensions';
import { parseFileUrl } from './util/functions/loadFunction';
import invariant from './util/invariant';
import { extractFirstJsonObject, extractJsonObjects } from './util/json';
import { getNunjucksEngine } from './util/templates';
import { accumulateTokenUsage } from './util/tokenUsageUtils';

import type {
  ApiClassificationProvider,
  ApiEmbeddingProvider,
  ApiModerationProvider,
  ApiProvider,
  ApiSimilarityProvider,
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderOptions,
  ProviderResponse,
  ProviderType,
  ProviderTypeMap,
  TestCase,
  TokenUsage,
  VarValue,
} from './types/index';

class LlmRubricProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRubricProviderError';
  }
}

const nunjucks = getNunjucksEngine(undefined, false, true);

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  return vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
}

function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const sumSquaredDiff = vecA.reduce((acc, val, idx) => {
    const diff = val - vecB[idx];
    return acc + diff * diff;
  }, 0);
  return Math.sqrt(sumSquaredDiff);
}

/**
 * Helper to call provider with consistent context propagation pattern.
 * Spreads the optional context and merges with prompt label and vars.
 *
 * IMPORTANT: Spread order matters - context is spread first, then prompt/vars
 * override. This ensures originalProvider from context is preserved while
 * allowing this call to specify its own prompt metadata.
 */
export function callProviderWithContext(
  provider: ApiProvider,
  prompt: string,
  label: string,
  vars: Record<string, VarValue>,
  context?: CallApiContextParams,
): Promise<ProviderResponse> {
  return provider.callApi(prompt, {
    ...context,
    prompt: {
      raw: prompt,
      label,
    },
    vars,
  });
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
  return loadApiProvider(provider.id, {
    options: provider as ProviderOptions,
    basePath: cliState.basePath,
  });
}

export async function getGradingProvider(
  type: ProviderType,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
): Promise<ApiProvider | null> {
  let finalProvider: ApiProvider | null;
  if (typeof provider === 'string') {
    // Defined as a string
    finalProvider = await loadApiProvider(provider, { basePath: cliState.basePath });
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
    // No provider specified - check defaultTest.options.provider as fallback
    const defaultTest = cliState.config?.defaultTest;
    const defaultTestObj = typeof defaultTest === 'object' ? (defaultTest as TestCase) : null;
    const cfg =
      defaultTestObj?.provider ||
      defaultTestObj?.options?.provider?.text ||
      defaultTestObj?.options?.provider ||
      undefined;

    if (cfg) {
      // Recursively call getGradingProvider to handle all provider types (string, object, etc.)
      finalProvider = await getGradingProvider(type, cfg, defaultProvider);
      if (finalProvider) {
        logger.debug(
          `[Grading] Using provider from defaultTest.options.provider: ${finalProvider.id()}`,
        );
      }
    } else {
      finalProvider = defaultProvider;
    }
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

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: {
      total: tokensUsed?.total || 0,
      prompt: tokensUsed?.prompt || 0,
      completion: tokensUsed?.completion || 0,
      cached: tokensUsed?.cached || 0,
      numRequests: tokensUsed?.numRequests || 0,
      completionDetails: tokensUsed?.completionDetails,
    },
  };
}

function accumulateTokens(target: TokenUsage, update?: Partial<TokenUsage>) {
  accumulateTokenUsage(target, update);
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
  grading?: GradingConfig,
  metric: 'cosine' | 'dot_product' | 'euclidean' = 'cosine',
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

  const defaults = await getDefaultProviders();
  const finalProvider = (await getAndCheckProvider(
    'embedding',
    grading?.provider,
    defaults.embeddingProvider,
    'similarity check',
  )) as ApiEmbeddingProvider | ApiSimilarityProvider;

  let similarity: number;
  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  // For providers with native similarity API, only cosine is supported
  if ('callSimilarityApi' in finalProvider) {
    if (metric !== 'cosine') {
      return fail(
        `Provider ${finalProvider.id()} only supports cosine similarity via callSimilarityApi`,
        tokensUsed,
      );
    }
    const similarityResp = await finalProvider.callSimilarityApi(expected, output);
    tokensUsed.total = similarityResp.tokenUsage?.total || 0;
    tokensUsed.prompt = similarityResp.tokenUsage?.prompt || 0;
    tokensUsed.completion = similarityResp.tokenUsage?.completion || 0;
    tokensUsed.cached = similarityResp.tokenUsage?.cached || 0;
    tokensUsed.numRequests = similarityResp.tokenUsage?.numRequests || 0;
    tokensUsed.completionDetails = similarityResp.tokenUsage?.completionDetails;
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

    tokensUsed.total =
      (expectedEmbedding.tokenUsage?.total || 0) + (outputEmbedding.tokenUsage?.total || 0);
    tokensUsed.prompt =
      (expectedEmbedding.tokenUsage?.prompt || 0) + (outputEmbedding.tokenUsage?.prompt || 0);
    tokensUsed.completion =
      (expectedEmbedding.tokenUsage?.completion || 0) +
      (outputEmbedding.tokenUsage?.completion || 0);
    tokensUsed.cached =
      (expectedEmbedding.tokenUsage?.cached || 0) + (outputEmbedding.tokenUsage?.cached || 0);
    tokensUsed.numRequests =
      (expectedEmbedding.tokenUsage?.numRequests || 0) +
      (outputEmbedding.tokenUsage?.numRequests || 0);
    tokensUsed.completionDetails = {
      reasoning:
        (expectedEmbedding.tokenUsage?.completionDetails?.reasoning || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.reasoning || 0),
      acceptedPrediction:
        (expectedEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.acceptedPrediction || 0),
      rejectedPrediction:
        (expectedEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0) +
        (outputEmbedding.tokenUsage?.completionDetails?.rejectedPrediction || 0),
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

    // Compute metric based on the selected type
    switch (metric) {
      case 'cosine':
        similarity = cosineSimilarity(expectedEmbedding.embedding, outputEmbedding.embedding);
        break;
      case 'dot_product':
        similarity = dotProduct(expectedEmbedding.embedding, outputEmbedding.embedding);
        break;
      case 'euclidean':
        // For euclidean distance, we store it in similarity variable but handle it differently below
        similarity = euclideanDistance(expectedEmbedding.embedding, outputEmbedding.embedding);
        break;
      default:
        return fail(`Unsupported metric: ${metric}`, tokensUsed);
    }
  } else {
    throw new Error('Provider must implement callSimilarityApi or callEmbeddingApi');
  }

  // Handle different semantics for distance vs similarity metrics
  const isDistanceMetric = metric === 'euclidean';

  let pass: boolean;
  let score: number;
  let reason: string;

  if (isDistanceMetric) {
    // For distance metrics: lower is better, threshold is maximum distance
    const distance = similarity; // We stored distance in similarity variable
    pass = inverse
      ? distance >= threshold - Number.EPSILON
      : distance <= threshold + Number.EPSILON;

    // Convert distance to a 0-1 score where lower distance = higher score
    // Using formula: score = 1 / (1 + distance)
    const normalizedScore = 1 / (1 + distance);
    score = inverse ? 1 - normalizedScore : normalizedScore;

    const belowThresholdReason = `Distance ${distance.toFixed(2)} is less than or equal to threshold ${threshold}`;
    const aboveThresholdReason = `Distance ${distance.toFixed(2)} is greater than threshold ${threshold}`;
    reason = pass
      ? inverse
        ? aboveThresholdReason
        : belowThresholdReason
      : inverse
        ? belowThresholdReason
        : aboveThresholdReason;
  } else {
    // For similarity metrics: higher is better, threshold is minimum similarity
    pass = inverse
      ? similarity <= threshold + Number.EPSILON
      : similarity >= threshold - Number.EPSILON;

    score = inverse ? 1 - similarity : similarity;

    const greaterThanReason = `Similarity ${similarity.toFixed(2)} is greater than or equal to threshold ${threshold}`;
    const lessThanReason = `Similarity ${similarity.toFixed(2)} is less than threshold ${threshold}`;
    reason = pass
      ? inverse
        ? lessThanReason
        : greaterThanReason
      : inverse
        ? greaterThanReason
        : lessThanReason;
  }

  return {
    pass,
    score,
    reason,
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

export async function loadRubricPrompt(
  rubricPrompt: string | object | undefined,
  defaultPrompt: string,
): Promise<string> {
  if (
    !rubricPrompt ||
    (typeof rubricPrompt === 'object' && Object.keys(rubricPrompt ?? {}).length === 0)
  ) {
    return defaultPrompt;
  }

  if (typeof rubricPrompt === 'string' && rubricPrompt.startsWith('file://')) {
    const basePath = cliState.basePath || '';

    // Render Nunjucks templates in the file path (e.g., file://{{ env.RUBRIC_PATH }}/rubric.json)
    const renderedFilePath = getNunjucksEngineForFilePath().renderString(rubricPrompt, {});

    // Parse the file URL to extract file path and function name
    // This handles colon splitting correctly, including Windows drive letters and :functionName suffix
    const { filePath, functionName } = parseFileUrl(renderedFilePath);
    const resolvedPath = path.resolve(basePath, filePath);

    if (isJavascriptFile(filePath)) {
      rubricPrompt = await loadFromJavaScriptFile(resolvedPath, functionName, []);
    } else {
      // For non-JS files (including .json, .yaml, .txt), load as raw text
      // to allow Nunjucks templating before JSON/YAML parsing.
      // This fixes the issue where .json files with Nunjucks templates
      // would fail to parse before rendering.
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }
      rubricPrompt = fs.readFileSync(resolvedPath, 'utf8');
    }
  } else {
    // Load from external file if needed (for non file:// references)
    rubricPrompt = maybeLoadFromExternalFile(rubricPrompt);
  }

  if (typeof rubricPrompt === 'object') {
    rubricPrompt = JSON.stringify(rubricPrompt);
  }

  invariant(typeof rubricPrompt === 'string', 'rubricPrompt must be a string');
  return rubricPrompt;
}

function tryParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {}
  return content;
}

function splitIntoSentences(text: string) {
  return text.split('\n').filter((sentence) => sentence.trim() !== '');
}

function processContextForTemplating(
  context: Record<string, VarValue>,
  enableObjectAccess: boolean,
): Record<string, VarValue> {
  if (enableObjectAccess) {
    return context;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          return [
            key,
            value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : item)),
          ];
        }
        return [key, JSON.stringify(value)];
      }
      return [key, value];
    }),
  );
}

export async function renderLlmRubricPrompt(
  rubricPrompt: string,
  context: Record<string, VarValue>,
) {
  const enableObjectAccess = getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY', false);
  const processedContext = processContextForTemplating(context, enableObjectAccess);

  try {
    // Render every string scalar within the JSON
    // Does not render object keys (only values)
    const parsed = JSON.parse(rubricPrompt, (_k, v) =>
      typeof v === 'string' ? nunjucks.renderString(v, processedContext) : v,
    );
    return JSON.stringify(parsed);
  } catch {
    // not valid JSON...
    // output a warning?
  }

  // Legacy rendering for non-JSON prompts
  return nunjucks.renderString(rubricPrompt, processedContext);
}

export async function matchesLlmRubric(
  rubric: string | object,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  options?: {
    throwOnError?: boolean;
  },
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  // Use remote grading only if no provider is explicitly configured and remote generation is enabled
  if (
    !grading.rubricPrompt &&
    !cliState.config?.redteam?.provider &&
    cliState.config?.redteam &&
    shouldGenerateRemote()
  ) {
    return {
      ...(await doRemoteGrading({
        task: 'llm-rubric',
        rubric,
        output: llmOutput,
        vars: vars || {},
      })),
      assertion,
    };
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DEFAULT_GRADING_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    output: tryParse(llmOutput),
    rubric,
    ...(vars || {}),
  });

  const defaultProviders = await getDefaultProviders();
  const defaultProvider =
    defaultProviders.llmRubricProvider || defaultProviders.gradingJsonProvider;
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    'llm-rubric check',
  );
  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    'llm-rubric',
    {
      output: tryParse(llmOutput),
      rubric,
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    if (options?.throwOnError) {
      throw new LlmRubricProviderError(resp.error || 'No output');
    }
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  let jsonObjects: object[] = [];
  if (typeof resp.output === 'string') {
    try {
      jsonObjects = extractJsonObjects(resp.output);
      if (jsonObjects.length === 0) {
        return fail('Could not extract JSON from llm-rubric response', resp.tokenUsage);
      }
    } catch (err) {
      return fail(
        `llm-rubric produced malformed response: ${err}\n\n${resp.output}`,
        resp.tokenUsage,
      );
    }
  } else if (typeof resp.output === 'object') {
    jsonObjects = [resp.output];
  } else {
    return fail(
      `llm-rubric produced malformed response - output must be string or object. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  if (!Array.isArray(jsonObjects) || jsonObjects.length === 0) {
    return fail(
      `llm-rubric produced malformed response - We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  // expects properties pass, score, and reason
  const parsed = jsonObjects[0] as Partial<GradingResult>;

  if (typeof parsed !== 'object' || parsed === null || parsed === undefined) {
    return fail(
      `llm-rubric produced malformed response. We were not able to parse the response as JSON. Output: ${JSON.stringify(resp.output)}`,
      resp.tokenUsage,
    );
  }

  let pass = parsed.pass ?? true;
  if (typeof pass !== 'boolean') {
    pass = /^(true|yes|pass|y)$/i.test(String(pass));
  }

  let score = parsed.score;
  if (typeof score !== 'number') {
    score = Number.isFinite(Number(score)) ? Number(score) : Number(pass);
  }

  const threshold =
    typeof assertion?.threshold === 'string' ? Number(assertion.threshold) : assertion?.threshold;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    pass = pass && score >= threshold;
  }

  const reason =
    parsed.reason || (pass ? 'Grading passed' : `Score ${score} below threshold ${threshold}`);

  return {
    assertion,
    pass,
    score,
    reason,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: parsed.tokensUsed?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
    metadata: {
      renderedGradingPrompt: prompt,
    },
  };
}

export async function matchesPiScore(
  renderedValue: string,
  llmInput: string,
  llmOutput: string,
  assertion?: Assertion,
): Promise<GradingResult> {
  return {
    ...(await doRemoteScoringWithPi(
      {
        llm_input: llmInput,
        llm_output: llmOutput,
        scoring_spec: [
          {
            question: renderedValue,
          },
        ],
      },
      assertion?.threshold,
    )),
    assertion,
  };
}

export async function matchesFactuality(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, PROMPTFOO_FACTUALITY_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    ideal: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

  // Get the appropriate provider
  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'factuality check',
  );

  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    'factuality',
    {
      input,
      ideal: expected,
      completion: tryParse(output),
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'factuality produced malformed response');

  // Copied from standard factuality grading prompt
  const categoryDescriptions: Record<string, string> = {
    A: 'The submitted answer is a subset of the expert answer and is fully consistent with it.',
    B: 'The submitted answer is a superset of the expert answer and is fully consistent with it.',
    C: 'The submitted answer contains all the same details as the expert answer.',
    D: 'There is a disagreement between the submitted answer and the expert answer.',
    E: "The answers differ, but these differences don't matter from the perspective of factuality.",
  };

  // Try to parse as JSON first
  let jsonData: { category?: string; reason?: string } | null = null;
  let jsonError: Error | null = null;

  try {
    jsonData = extractFirstJsonObject<{ category?: string; reason?: string }>(resp.output);
  } catch (err) {
    jsonError = err as Error;
    logger.debug(`JSON parsing failed: ${jsonError.message}`);
  }

  // If JSON parsing succeeded and provided a valid category
  if (jsonData && jsonData.category && typeof jsonData.category === 'string') {
    const option = jsonData.category.trim().toUpperCase();

    if (!/^[A-E]$/.test(option)) {
      return fail(`Invalid category value: ${option}`, resp.tokenUsage);
    }

    const scoreLookup: Record<string, number> = {
      A: grading.factuality?.subset ?? 1,
      B: grading.factuality?.superset ?? 1,
      C: grading.factuality?.agree ?? 1,
      D: grading.factuality?.disagree ?? 0,
      E: grading.factuality?.differButFactual ?? 1,
    };

    // Determine if this option passes or fails
    const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
    const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);
    const pass = passing.includes(option) && !failing.includes(option);

    // Use the model's reason if available, otherwise fall back to the category description
    const modelReason = jsonData.reason?.trim();
    const reason = modelReason || `Category ${option}: ${categoryDescriptions[option]}`;

    const score = scoreLookup[option] ?? (pass ? 1 : 0);

    return {
      pass,
      score,
      reason,
      tokensUsed: resp.tokenUsage || {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    };
  }

  // Fallback to old pattern matching format
  logger.info('Falling back to legacy pattern matching for factuality check');
  const responseText = resp.output;
  // The preferred output starts like "(A)...", but we also support leading whitespace, lowercase letters, and omitting the first parenthesis.
  const answerMatch = responseText.match(/\s*\(?([a-eA-E])\)/);
  if (!answerMatch) {
    return fail(
      `Factuality checker output did not match expected format: ${responseText}`,
      resp.tokenUsage,
    );
  }

  const option = answerMatch[1].toUpperCase();

  let modelReason = responseText;
  const reasonMatch = responseText.match(/\)\s*(.*)/s);
  if (reasonMatch && reasonMatch[1]) {
    modelReason = reasonMatch[1].trim();
  }

  const scoreLookup: Record<string, number> = {
    A: grading.factuality?.subset ?? 1,
    B: grading.factuality?.superset ?? 1,
    C: grading.factuality?.agree ?? 1,
    D: grading.factuality?.disagree ?? 0,
    E: grading.factuality?.differButFactual ?? 1,
  };

  const passing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] > 0);
  const failing = Object.keys(scoreLookup).filter((key) => scoreLookup[key] === 0);
  const pass = passing.includes(option) && !failing.includes(option);
  const score = scoreLookup[option] ?? (pass ? 1 : 0);

  return {
    pass,
    score,
    reason: modelReason,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesClosedQa(
  input: string,
  expected: string,
  output: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, OPENAI_CLOSED_QA_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    input,
    criteria: expected,
    completion: tryParse(output),
    ...(vars || {}),
  });

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    (await getDefaultProviders()).gradingProvider,
    'model-graded-closedqa check',
  );
  const resp = await callProviderWithContext(
    finalProvider,
    prompt,
    'model-graded-closedqa',
    {
      input,
      criteria: expected,
      completion: tryParse(output),
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'model-graded-closedqa produced malformed response');
  try {
    const pass = resp.output.trimEnd().endsWith('Y');
    let reason;
    if (pass) {
      reason = `The submission meets the criterion:\n${resp.output}`;
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
        numRequests: resp.tokenUsage?.numRequests || 0,
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
  providerCallContext?: CallApiContextParams,
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

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  // Step 1: Get evaluation steps using renderLlmRubricPrompt
  const stepsRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['steps']
      : undefined;
  const stepsPrompt = await loadRubricPrompt(stepsRubricPrompt, GEVAL_PROMPT_STEPS);
  const promptSteps = await renderLlmRubricPrompt(stepsPrompt, { criteria });

  const respSteps = await callProviderWithContext(
    textProvider,
    promptSteps,
    'g-eval-steps',
    {
      criteria,
    },
    providerCallContext,
  );
  accumulateTokens(tokensUsed, respSteps.tokenUsage);
  let steps;

  try {
    // NOTE: use regexp for reliable, because sometimes LLM wraps response to markdown format ```json...```
    steps = JSON.parse(respSteps.output.match(/\{"steps".+\}/g)[0]).steps;

    if (!steps.length) {
      return fail('LLM does not propose any evaluation step', tokensUsed);
    }
  } catch {
    return fail(
      `LLM-proposed evaluation steps are not in JSON format: ${respSteps.output}`,
      tokensUsed,
    );
  }

  // Step 2: Use steps to evaluate using renderLlmRubricPrompt
  const evalRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['evaluate']
      : undefined;
  const evalPrompt = await loadRubricPrompt(evalRubricPrompt, GEVAL_PROMPT_EVALUATE);
  const promptText = await renderLlmRubricPrompt(evalPrompt, {
    criteria,
    steps: steps.join('\n- '),
    maxScore: maxScore.toString(),
    input: tryParse(input),
    output: tryParse(output),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'g-eval',
    {
      criteria,
      steps: steps.join('\n- '),
      maxScore: maxScore.toString(),
      input: tryParse(input),
      output: tryParse(output),
    },
    providerCallContext,
  );
  accumulateTokens(tokensUsed, resp.tokenUsage);
  let result;

  try {
    result = JSON.parse(resp.output.match(/\{.+\}/g)[0]);
  } catch {
    return fail(`LLM-proposed evaluation result is not in JSON format: ${resp.output}`, tokensUsed);
  }

  return {
    pass: result.score / maxScore >= threshold,
    score: result.score / maxScore,
    reason: result.reason,
    tokensUsed,
  };
}

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
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

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
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
    const promptText = await renderLlmRubricPrompt(rubricPrompt, { answer: tryParse(output) });
    const resp = await callProviderWithContext(
      textProvider,
      promptText,
      'answer-relevance',
      {
        answer: tryParse(output),
      },
      providerCallContext,
    );
    accumulateTokens(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.output) {
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
  accumulateTokens(tokensUsed, inputEmbeddingResp.tokenUsage);
  if (inputEmbeddingResp.error || !inputEmbeddingResp.embedding) {
    return fail(inputEmbeddingResp.error || 'No embedding', tokensUsed);
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  const questionsWithScores: { question: string; similarity: number }[] = [];

  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    accumulateTokens(tokensUsed, resp.tokenUsage);
    if (resp.error || !resp.embedding) {
      return fail(resp.error || 'No embedding', tokensUsed);
    }
    const questionSimilarity = cosineSimilarity(inputEmbedding, resp.embedding);
    similarities.push(questionSimilarity);
    questionsWithScores.push({ question, similarity: questionSimilarity });
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold - Number.EPSILON;
  const greaterThanReason = `Relevance ${similarity.toFixed(
    2,
  )} is greater than threshold ${threshold}`;
  const lessThanReason = `Relevance ${similarity.toFixed(2)} is less than threshold ${threshold}`;

  const metadata = {
    generatedQuestions: questionsWithScores,
    averageSimilarity: similarity,
    threshold,
  };

  if (pass) {
    return {
      pass: true,
      score: similarity,
      reason: greaterThanReason,
      tokensUsed,
      metadata,
    };
  }
  return {
    pass: false,
    score: similarity,
    reason: lessThanReason,
    tokensUsed,
    metadata,
  };
}

export async function matchesContextRecall(
  context: string | string[],
  groundTruth: string,
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context recall check',
  );

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RECALL);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    groundTruth,
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-recall',
    {
      context: contextString,
      groundTruth,
      ...(vars || {}),
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-recall produced malformed response');

  // Filter to only include lines that contain attribution markers.
  // This handles cases where LLMs add preamble text before the classification list.
  // See: https://github.com/promptfoo/promptfoo/issues/1506
  const attributedTokenLower = CONTEXT_RECALL_ATTRIBUTED_TOKEN.toLowerCase();
  const notAttributedTokenLower = CONTEXT_RECALL_NOT_ATTRIBUTED_TOKEN.toLowerCase();
  const sentences = splitIntoSentences(resp.output).filter((line) => {
    const lowerLine = line.toLowerCase();
    return lowerLine.includes(attributedTokenLower) || lowerLine.includes(notAttributedTokenLower);
  });

  const sentenceAttributions: { sentence: string; attributed: boolean }[] = [];
  let numerator = 0;

  for (const sentence of sentences) {
    // Case-insensitive check for attribution - handles [ATTRIBUTED], [Attributed], etc.
    const isAttributed = sentence.toLowerCase().includes(attributedTokenLower);
    if (isAttributed) {
      numerator++;
    }
    // Extract the actual sentence content without the classification part
    const sentenceMatch = sentence.match(/^\d+\.\s*([^\.]+\.)/);
    const cleanSentence = sentenceMatch ? sentenceMatch[1].trim() : sentence.split('.')[0].trim();
    sentenceAttributions.push({
      sentence: cleanSentence,
      attributed: isAttributed,
    });
  }

  const score = sentences.length > 0 ? numerator / sentences.length : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    sentenceAttributions,
    totalSentences: sentences.length,
    attributedSentences: numerator,
    score,
  };

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
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
    metadata,
  };
}

export async function matchesContextRelevance(
  question: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'context relevance check',
  );

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, CONTEXT_RELEVANCE);
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context: contextString,
    query: question,
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-relevance',
    {
      context: contextString,
      query: question,
    },
    providerCallContext,
  );
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-relevance produced malformed response');

  // Split context into units: use chunks if provided, otherwise split into sentences
  const contextUnits = Array.isArray(context)
    ? context.filter((chunk) => chunk.trim().length > 0)
    : splitIntoSentences(context);
  const totalContextUnits = contextUnits.length;

  // Parse the LLM's response to get relevant sentences
  const extractedSentences = splitIntoSentences(resp.output);
  const relevantSentences: string[] = [];
  const insufficientInformation = resp.output.includes(CONTEXT_RELEVANCE_BAD);

  let numerator = 0;
  if (insufficientInformation) {
    // If the entire response is "Insufficient Information", no sentences are relevant
    numerator = 0;
  } else {
    // Count the extracted sentences as relevant
    numerator = extractedSentences.length;
    relevantSentences.push(...extractedSentences);
  }

  // RAGAS CONTEXT RELEVANCE FORMULA: relevant units / total context units
  const score = totalContextUnits > 0 ? numerator / totalContextUnits : 0;
  const pass = score >= threshold - Number.EPSILON;

  const metadata = {
    extractedSentences: relevantSentences,
    totalContextUnits,
    totalContextSentences: totalContextUnits, // Backward compatibility
    contextUnits: contextUnits,
    relevantSentenceCount: numerator,
    insufficientInformation,
    score,
  };

  return {
    pass,
    score,
    reason: pass
      ? `Context relevance ${score.toFixed(2)} is >= ${threshold}`
      : `Context relevance ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed: {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
      cached: resp.tokenUsage?.cached || 0,
      numRequests: resp.tokenUsage?.numRequests || 0,
      completionDetails: resp.tokenUsage?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
    metadata,
  };
}

export async function matchesContextFaithfulness(
  query: string,
  output: string,
  context: string | string[],
  threshold: number,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
): Promise<Omit<GradingResult, 'assertion'>> {
  const textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    (await getDefaultProviders()).gradingProvider,
    'faithfulness check',
  );

  const tokensUsed: Partial<TokenUsage> = {
    total: 0,
    prompt: 0,
    completion: 0,
    cached: 0,
    numRequests: 0,
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  if (grading?.rubricPrompt) {
    invariant(Array.isArray(grading.rubricPrompt), 'rubricPrompt must be an array');
  }
  // Load rubric prompts using loadRubricPrompt to support file:// references with templates
  const rawLongformPrompt =
    typeof grading?.rubricPrompt?.[0] === 'string'
      ? grading?.rubricPrompt?.[0]
      : grading?.rubricPrompt?.[0]?.content;
  const rawNliPrompt =
    typeof grading?.rubricPrompt?.[1] === 'string'
      ? grading?.rubricPrompt?.[1]
      : grading?.rubricPrompt?.[1]?.content;
  const longformPrompt = await loadRubricPrompt(rawLongformPrompt, CONTEXT_FAITHFULNESS_LONGFORM);
  const nliPrompt = await loadRubricPrompt(rawNliPrompt, CONTEXT_FAITHFULNESS_NLI_STATEMENTS);

  let promptText = await renderLlmRubricPrompt(longformPrompt, {
    question: query,
    answer: tryParse(output),
    ...(vars || {}),
  });

  let resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-faithfulness-longform',
    {
      question: query,
      answer: tryParse(output),
      ...(vars || {}),
    },
    providerCallContext,
  );
  accumulateTokens(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  // Convert context to string for LLM prompt
  const contextString = serializeContext(context);

  const statements = splitIntoSentences(resp.output);
  promptText = await renderLlmRubricPrompt(nliPrompt, {
    context: contextString,
    statements,
    ...(vars || {}),
  });

  resp = await callProviderWithContext(
    textProvider,
    promptText,
    'context-faithfulness-nli',
    {
      context: contextString,
      statements,
      ...(vars || {}),
    },
    providerCallContext,
  );
  accumulateTokens(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
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
    tokensUsed,
  };
}

export async function matchesSelectBest(
  criteria: string,
  outputs: string[],
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  providerCallContext?: CallApiContextParams,
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
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    criteria,
    outputs: outputs.map((o) => tryParse(o)),
    ...(vars || {}),
  });

  const resp = await callProviderWithContext(
    textProvider,
    promptText,
    'select-best',
    {
      criteria,
      outputs: outputs.map((o) => tryParse(o)),
      ...(vars || {}),
    },
    providerCallContext,
  );
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
    numRequests: resp.tokenUsage?.numRequests || 0,
    completionDetails: resp.tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
  return outputs.map((_output, index) => {
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

export async function selectMaxScore(
  outputs: string[],
  resultsWithGradingResults: Array<{
    gradingResult?: { componentResults?: GradingResult[] } | null;
  }>,
  assertion: Assertion,
): Promise<Omit<GradingResult, 'assertion'>[]> {
  invariant(
    outputs.length >= 2,
    'max-score assertion must have at least two outputs to compare between',
  );

  // Parse options from assertion value
  const value = assertion.value || {};
  const options = {
    method: (typeof value === 'object' && 'method' in value ? value.method : 'average') as
      | 'average'
      | 'sum',
    weights: (typeof value === 'object' && 'weights' in value ? value.weights : {}) as Record<
      string,
      number
    >,
    threshold:
      typeof value === 'object' && 'threshold' in value ? (value.threshold as number) : undefined,
  };

  // Calculate aggregate score for each output
  const scores = resultsWithGradingResults.map((result, index) => {
    // Get component results from gradingResult if available
    const componentResults = result.gradingResult?.componentResults || [];

    // Filter out max-score and select-best assertions
    const relevantResults = componentResults.filter(
      (r: GradingResult) =>
        r.assertion && r.assertion.type !== 'max-score' && r.assertion.type !== 'select-best',
    );

    if (relevantResults.length === 0) {
      throw new Error(
        'max-score requires at least one other assertion (besides max-score or select-best) to aggregate scores from',
      );
    }

    // Calculate weighted scores for each assertion
    let totalWeightedScore = 0;
    let totalWeight = 0;

    relevantResults.forEach((componentResult: GradingResult) => {
      const assertionType = componentResult.assertion?.type || 'unknown';
      const weight =
        options.weights[assertionType] !== undefined ? options.weights[assertionType] : 1.0; // Default weight is 1

      const score = componentResult.score || 0;
      totalWeightedScore += score * weight;
      totalWeight += weight;
    });

    // Calculate aggregate score based on method
    let aggregateScore: number;
    if (options.method === 'sum') {
      aggregateScore = totalWeightedScore;
    } else {
      // Average method (default)
      aggregateScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    }

    return {
      index,
      score: aggregateScore,
      componentCount: relevantResults.length,
      totalWeight,
    };
  });

  // Find max score (with deterministic tie-breaking by index)
  let maxScore = -Infinity;
  let winnerIndex = 0;

  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score > maxScore) {
      maxScore = scores[i].score;
      winnerIndex = i;
    }
  }

  // Apply threshold if specified
  const meetsThreshold = options.threshold === undefined || maxScore >= options.threshold;

  // Return results for each output
  return scores.map(({ index, score, componentCount, totalWeight }) => {
    const isWinner = index === winnerIndex && meetsThreshold;

    return {
      pass: isWinner,
      score: isWinner ? 1 : 0,
      reason: isWinner
        ? `Selected as highest scoring output (score: ${score.toFixed(3)})`
        : score === maxScore && !meetsThreshold
          ? `Not selected - score ${score.toFixed(3)} below threshold ${options.threshold}`
          : `Not selected (score: ${score.toFixed(3)}, max: ${maxScore.toFixed(3)})`,
      namedScores: {
        maxScore: score,
        assertionCount: componentCount,
        totalWeight,
      },
    };
  });
}

interface ModerationMatchOptions {
  userPrompt: string;
  assistantResponse: string;
  categories?: string[];
}

export async function matchesSearchRubric(
  rubric: string,
  llmOutput: string,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  _provider?: ApiProvider,
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  // Search rubric assertion is like llm-rubric but with web search capabilities
  const defaultProviders = await getDefaultProviders();

  // Get a provider with web search capabilities
  let searchProvider =
    grading.provider ||
    defaultProviders.webSearchProvider ||
    defaultProviders.llmRubricProvider ||
    defaultProviders.gradingProvider;

  // Check if current provider has web search, if not try to load one
  if (!hasWebSearchCapability(searchProvider)) {
    // Try to load a provider with web search capabilities
    // For search-rubric assertion, prefer Anthropic first (pass true)
    const webSearchProvider = await loadWebSearchProvider(true);
    if (webSearchProvider) {
      searchProvider = webSearchProvider;
    }
  }

  // Ensure we have a provider with web search capabilities
  if (!searchProvider || !hasWebSearchCapability(searchProvider)) {
    throw new Error(
      'search-rubric assertion requires a grading provider with web search capabilities. ' +
        'Use --grader with a web search provider (e.g., anthropic:messages:claude-sonnet-4, openai:responses:o4-mini with tools configured, perplexity:sonar) or configure one in defaultTest.options.provider',
    );
  }

  // Load the web search rubric prompt
  const rubricPrompt = await loadRubricPrompt(grading?.rubricPrompt, DEFAULT_WEB_SEARCH_PROMPT);
  const prompt = await renderLlmRubricPrompt(rubricPrompt, {
    output: tryParse(llmOutput),
    rubric,
    ...(vars || {}),
  });

  // Get the evaluation from the search provider
  const resp = await callProviderWithContext(
    searchProvider,
    prompt,
    'search-rubric',
    { output: tryParse(llmOutput), rubric, ...(vars || {}) },
    providerCallContext,
  );

  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: `Search rubric evaluation failed: ${resp.error || 'No output'}`,
      tokensUsed: resp.tokenUsage,
      assertion,
    };
  }

  // Parse the response
  try {
    const result = extractFirstJsonObject(String(resp.output)) as {
      pass?: boolean;
      score?: number;
      reason?: string;
      searchResults?: unknown;
    };

    // Apply threshold if specified
    let pass = result.pass ?? false;
    const score = typeof result.score === 'number' ? result.score : pass ? 1 : 0;

    if (assertion?.threshold !== undefined) {
      pass = pass && score >= assertion.threshold;
    }

    return {
      pass,
      score,
      reason: result.reason || 'No reason provided',
      tokensUsed: resp.tokenUsage,
      assertion,
      metadata: {
        searchResults: result.searchResults || [],
        searchProvider: searchProvider.id(),
      },
    };
  } catch {
    // Try to parse as a simple pass/fail
    const outputLower = String(resp.output).toLowerCase();
    const pass = outputLower.includes('"pass":true') || outputLower.includes('"pass": true');

    return {
      pass,
      score: pass ? 1 : 0,
      reason: resp.output as string,
      tokensUsed: resp.tokenUsage,
      assertion,
    };
  }
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
