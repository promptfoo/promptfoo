import path from 'path';

import dedent from 'dedent';
import { loadFromJavaScriptFile } from './assertions/utils';
import cliState from './cliState';
import { getEnvBool, getEnvString } from './envars';
import logger from './logger';
import {
  ANSWER_RELEVANCY_GENERATE,
  CONTEXT_FAITHFULNESS_LONGFORM,
  CONTEXT_FAITHFULNESS_NLI_STATEMENTS,
  CONTEXT_RECALL,
  CONTEXT_RECALL_ATTRIBUTED_TOKEN,
  CONTEXT_RELEVANCE,
  CONTEXT_RELEVANCE_BAD,
  DEFAULT_GRADING_PROMPT,
  GEVAL_PROMPT_EVALUATE,
  GEVAL_PROMPT_STEPS,
  OPENAI_CLOSED_QA_PROMPT,
  PROMPTFOO_FACTUALITY_PROMPT,
  SELECT_BEST_PROMPT,
} from './prompts';
import { loadApiProvider } from './providers';
import { getDefaultProviders } from './providers/defaults';
import { LLAMA_GUARD_REPLICATE_PROVIDER } from './redteam/constants';
import { shouldGenerateRemote } from './redteam/remoteGeneration';
import { doRemoteGrading } from './remoteGrading';
import { doRemoteScoringWithPi } from './remoteScoring';
import { maybeLoadFromExternalFile } from './util/file';
import { isJavascriptFile } from './util/fileExtensions';
import invariant from './util/invariant';
import { extractFirstJsonObject, extractJsonObjects } from './util/json';
import { getNunjucksEngine } from './util/templates';
import { providerMetadataRegistry, registerBuiltInProviders } from './providers/providerMetadataRegistry';

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
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderOptions,
  ProviderResponse,
  ProviderType,
  ProviderTypeMap,
  TokenUsage,
} from './types';

// Initialize the provider metadata registry
registerBuiltInProviders();

class LlmRubricProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRubricProviderError';
  }
}

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

function getProviderConfigHelp(type: ProviderType, defaultProvider?: ApiProvider | null): string {
  const supportedProviders = providerMetadataRegistry.findByOperation(type);
  const examples: string[] = [];
  
  for (const id of supportedProviders.slice(0, 8)) { // Show first 8 examples
    const metadata = providerMetadataRegistry.get(id);
    if (metadata?.exampleConfigs?.[type]) {
      examples.push(metadata.exampleConfigs[type]);
    }
  }

  return dedent`
    Valid ${type} providers include:
      ${examples.join('\n      ')}
    
    For more information on ${type} providers, see: https://promptfoo.dev/docs/providers/
  `;
}

async function getAndCheckProvider<T extends ProviderType>(
  providerType: T,
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
  checkDescription: string,
): Promise<ApiProvider> {
  // Check if provider was explicitly configured
  const isExplicitlyConfigured = provider !== undefined;

  let resolvedProvider: ApiProvider | null = null;

  if (provider) {
    // Use the configured provider
    resolvedProvider = await getGradingProvider(providerType, provider, defaultProvider);
  } else {
    // Use the default provider (implicitly configured)
    resolvedProvider = defaultProvider;
  }

  if (!resolvedProvider) {
    if (isExplicitlyConfigured) {
      // Provider was explicitly configured but failed to load
      const providerId = typeof provider === 'object' && provider.id ? provider.id : String(provider);
      
      logger.error(dedent`
        Failed to load the configured ${providerType} provider: ${providerId}
      `);
      
      const metadata = providerMetadataRegistry.get(providerId);
      logger.info(dedent`
        The provider "${providerId}" ${metadata ? 'requires authentication' : 'may be invalid or the provider may not be installed'}.
        ${metadata?.authentication.helpText || ''}
      `);

      if (defaultProvider) {
        logger.info(`Falling back to default ${providerType} provider: ${defaultProvider.id()}`);
        return defaultProvider;
      }
    }
    throw new Error(`No provider of type ${providerType} found for '${checkDescription}'`);
  }

  // Check if the provider supports the required operation
  const checkProviderSupport = (provider: ApiProvider): boolean => {
    switch (providerType) {
      case 'embedding':
        return 'callEmbeddingApi' in provider;
      case 'classification':
        return 'callClassificationApi' in provider;
      case 'moderation':
        return 'callModerationApi' in provider;
      case 'text':
        return 'callApi' in provider;
      default:
        return false;
    }
  };

  if (!checkProviderSupport(resolvedProvider)) {
    const errorMsg = dedent`
      Provider "${resolvedProvider.id()}" does not support ${providerType} operations.
      ${getProviderConfigHelp(providerType)}
    `;

    if (isExplicitlyConfigured) {
      // Provider was explicitly configured with wrong type
      logger.error(errorMsg);
      logger.info(`The configured provider "${resolvedProvider.id()}" cannot perform ${providerType} operations.`);

      if (defaultProvider) {
        logger.info(`Falling back to default ${providerType} provider: ${defaultProvider.id()}`);
        return defaultProvider;
      } else {
        throw new Error(errorMsg);
      }
    } else {
      // Silently fallback for implicit default provider
      if (defaultProvider) {
        return defaultProvider;
      } else {
        throw new Error(`No provider of type ${providerType} found for '${checkDescription}'`);
      }
    }
  }

  return resolvedProvider;
}

function fail(reason: string, tokensUsed?: Partial<TokenUsage>): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: {
      total: tokensUsed?.total || 0,
      prompt: tokensUsed?.prompt || 0,
      completion: tokensUsed?.completion || 0,
      cached: tokensUsed?.cached || 0,
      completionDetails: tokensUsed?.completionDetails,
    },
  };
}

function accumulateTokens(target: Partial<TokenUsage>, update?: Partial<TokenUsage>) {
  if (!update || !target) {
    return;
  }

  target.total = (target.total || 0) + (update.total || 0);
  target.prompt = (target.prompt || 0) + (update.prompt || 0);
  target.completion = (target.completion || 0) + (update.completion || 0);
  target.cached = (target.cached || 0) + (update.cached || 0);

  if (update.completionDetails) {
    if (!target.completionDetails) {
      target.completionDetails = {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      };
    }
    target.completionDetails.reasoning =
      (target.completionDetails.reasoning || 0) + (update.completionDetails.reasoning || 0);
    target.completionDetails.acceptedPrediction =
      (target.completionDetails.acceptedPrediction || 0) +
      (update.completionDetails.acceptedPrediction || 0);
    target.completionDetails.rejectedPrediction =
      (target.completionDetails.rejectedPrediction || 0) +
      (update.completionDetails.rejectedPrediction || 0);
  }
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
    completionDetails: {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };

  if ('callSimilarityApi' in finalProvider) {
    const similarityResp = await finalProvider.callSimilarityApi(expected, output);
    tokensUsed.total = similarityResp.tokenUsage?.total || 0;
    tokensUsed.prompt = similarityResp.tokenUsage?.prompt || 0;
    tokensUsed.completion = similarityResp.tokenUsage?.completion || 0;
    tokensUsed.cached = similarityResp.tokenUsage?.cached || 0;
    tokensUsed.completionDetails = similarityResp.tokenUsage?.completionDetails;
    if (similarityResp.error) {
      return fail(similarityResp.error, tokensUsed);
    }
    if (similarityResp.similarity == null) {
      return fail('Unknown error fetching similarity', tokensUsed);
    }
    similarity = similarityResp.similarity;
  } else if ('callEmbeddingApi' in finalProvider) {
    let expectedEmbedding, outputEmbedding;

    try {
      expectedEmbedding = await finalProvider.callEmbeddingApi(expected);
      outputEmbedding = await finalProvider.callEmbeddingApi(output);
    } catch (error) {
      const errorMessage = String(error);

      // Check for API key errors and provide helpful guidance
      if (errorMessage.includes('API key') && errorMessage.includes('must be set')) {
        // Check if the user explicitly configured an embedding provider
        const isExplicitlyConfigured =
          grading?.provider !== undefined && grading?.provider !== null;
        const helpMessage = getApiKeyErrorHelp(
          finalProvider.id(),
          'embedding',
          errorMessage,
          isExplicitlyConfigured,
        );
        return fail(helpMessage, tokensUsed);
      }

      // Re-throw other errors
      throw error;
    }

    tokensUsed.total =
      (expectedEmbedding.tokenUsage?.total || 0) + (outputEmbedding.tokenUsage?.total || 0);
    tokensUsed.prompt =
      (expectedEmbedding.tokenUsage?.prompt || 0) + (outputEmbedding.tokenUsage?.prompt || 0);
    tokensUsed.completion =
      (expectedEmbedding.tokenUsage?.completion || 0) +
      (outputEmbedding.tokenUsage?.completion || 0);
    tokensUsed.cached =
      (expectedEmbedding.tokenUsage?.cached || 0) + (outputEmbedding.tokenUsage?.cached || 0);
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

export function getApiKeyErrorHelp(
  providerId: string,
  providerType: ProviderType,
  originalError: string,
  isExplicitlyConfigured: boolean = false,
): string {
  const metadata = providerMetadataRegistry.get(providerId);
  
  if (isExplicitlyConfigured) {
    if (metadata) {
      // Provider was explicitly configured and has metadata
      return dedent`
        ${originalError}
        
        Your configured ${providerType} provider "${providerId}" requires authentication.
        
        ${metadata.authentication.helpText || `To authenticate with ${metadata.name}, check the documentation.`}
        
        ${metadata.documentation?.notes ? `\n${metadata.documentation.notes}` : ''}
        
        ${metadata.documentation?.url ? `For more information, see: ${metadata.documentation.url}` : ''}
      `;
    } else {
      // Provider was explicitly configured but no metadata found
      return dedent`
        ${originalError}
        
        Your configured ${providerType} provider "${providerId}" requires authentication.
        
        Please check your provider configuration and ensure the necessary API keys or credentials are set.
        
        For more information on providers, see: https://promptfoo.dev/docs/providers/
      `;
    }
  }

  // Using default provider or no metadata available
  const availableAlternatives = providerMetadataRegistry.getAvailableAlternatives(
    providerId.split(':')[0],
    providerType
  );

  if (availableAlternatives.size > 0) {
    const alternativeNames: string[] = [];
    const alternativeExamples: string[] = [];
    
    for (const [id, _envVars] of availableAlternatives) {
      const altMetadata = providerMetadataRegistry.get(id);
      if (altMetadata) {
        alternativeNames.push(altMetadata.name);
        const example = altMetadata.exampleConfigs?.[providerType];
        if (example) {
          alternativeExamples.push(`  ${example}`);
        }
      }
    }

    return dedent`
      ${originalError}
      
      It looks like you have credentials for: ${alternativeNames.join(', ')}
      
      You can use one of these providers instead:
      ${alternativeExamples.join('\n')}
      
      Example configuration:
      \`\`\`yaml
      defaultTest:
        options:
          provider:
            ${providerType}: ${alternativeExamples[0]?.trim() || 'provider-id-here'}
      \`\`\`
      
      Or set the required credentials for the default provider.
    `;
  }

  // No alternatives available, provide generic help
  const supportedProviders = providerMetadataRegistry.findByOperation(providerType);
  const examples: string[] = [];
  
  for (const id of supportedProviders.slice(0, 5)) { // Show first 5 examples
    const metadata = providerMetadataRegistry.get(id);
    if (metadata?.exampleConfigs?.[providerType]) {
      examples.push(`  ${metadata.exampleConfigs[providerType]}`);
    }
  }

  return dedent`
    ${originalError}
    
    Available ${providerType} providers:
    ${examples.join('\n')}
    
    To use a specific provider, configure it in your test:
    \`\`\`yaml
    defaultTest:
      options:
        provider:
          ${providerType}: provider-id-here
    \`\`\`
    
    For more information on providers, see: https://promptfoo.dev/docs/providers/
  `;
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
  if (
    !rubricPrompt ||
    (typeof rubricPrompt === 'object' && Object.keys(rubricPrompt ?? {}).length === 0)
  ) {
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
  context: Record<string, string | object>,
  enableObjectAccess: boolean,
): Record<string, string | object> {
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
  context: Record<string, string | object>,
) {
  const enableObjectAccess = getEnvBool('PROMPTFOO_DISABLE_OBJECT_STRINGIFY', false);
  const processedContext = processContextForTemplating(context, enableObjectAccess);

  try {
    // Render every string scalar within the JSON
    // Does not render object keys (only values)
    const parsed = JSON.parse(rubricPrompt, (k, v) =>
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
  vars?: Record<string, string | object>,
  assertion?: Assertion | null,
  options?: {
    throwOnError?: boolean;
  },
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  if (!grading.rubricPrompt && cliState.config?.redteam && shouldGenerateRemote()) {
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
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    if (options?.throwOnError) {
      throw new LlmRubricProviderError(resp.error || 'No output');
    }
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  let jsonObjects: any[] = [];
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
      completionDetails: parsed.tokensUsed?.completionDetails || {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    },
  };
}

export async function matchesPiScore(
  renderedValue: string,
  llmInput: string,
  llmOutput: string,
  assertion?: Assertion | null,
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
  vars?: Record<string, string | object>,
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

  const resp = await finalProvider.callApi(prompt);
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
  vars?: Record<string, string | object>,
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
  const resp = await finalProvider.callApi(prompt);
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

  const tokensUsed: Partial<TokenUsage> = {
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

  // Step 1: Get evaluation steps using renderLlmRubricPrompt
  const stepsRubricPrompt =
    typeof grading?.rubricPrompt === 'object' && !Array.isArray(grading?.rubricPrompt)
      ? grading?.rubricPrompt?.['steps']
      : undefined;
  const stepsPrompt = await loadRubricPrompt(stepsRubricPrompt, GEVAL_PROMPT_STEPS);
  const promptSteps = await renderLlmRubricPrompt(stepsPrompt, { criteria });

  const respSteps = await textProvider.callApi(promptSteps);
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

  const resp = await textProvider.callApi(promptText);
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
    const resp = await textProvider.callApi(promptText);
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
  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    accumulateTokens(tokensUsed, resp.tokenUsage);
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
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context,
    groundTruth,
    ...(vars || {}),
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-recall produced malformed response');
  const sentences = splitIntoSentences(resp.output);
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
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    context,
    query: question,
  });

  const resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-relevance produced malformed response');
  const sentences = splitIntoSentences(resp.output);
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

  const tokensUsed: Partial<TokenUsage> = {
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

  let promptText = await renderLlmRubricPrompt(longformPrompt, {
    question: query,
    answer: tryParse(output),
    ...(vars || {}),
  });

  let resp = await textProvider.callApi(promptText);
  accumulateTokens(tokensUsed, resp.tokenUsage);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', tokensUsed);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  const statements = splitIntoSentences(resp.output);
  promptText = await renderLlmRubricPrompt(nliPrompt, {
    context,
    statements,
    ...(vars || {}),
  });

  resp = await textProvider.callApi(promptText);
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
  const promptText = await renderLlmRubricPrompt(rubricPrompt, {
    criteria,
    outputs: outputs.map((o) => tryParse(o)),
    ...(vars || {}),
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
