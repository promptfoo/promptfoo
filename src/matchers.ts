import invariant from 'tiny-invariant';
import logger from './logger';
import {
  DefaultEmbeddingProvider,
  DefaultGradingJsonProvider,
  DefaultGradingProvider,
} from './providers/openai';
import { getNunjucksEngine } from './util';
import { loadApiProvider } from './providers';
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
} from './types';

const nunjucks = getNunjucksEngine();

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
      ret[key] = value;
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
  type: 'embedding' | 'classification' | 'text',
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
  type: 'embedding' | 'classification' | 'text',
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
  checkName: string,
): Promise<ApiProvider> {
  let matchedProvider = await getGradingProvider(type, provider, defaultProvider);
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
  let finalProvider = (await getAndCheckProvider(
    'embedding',
    grading?.provider,
    DefaultEmbeddingProvider,
    'similarity check',
  )) as ApiEmbeddingProvider | ApiSimilarityProvider;

  let similarity: number;
  let tokensUsed: TokenUsage = {
    total: 0,
    prompt: 0,
    completion: 0,
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
  const pass = inverse ? similarity <= threshold : similarity >= threshold;
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

export async function matchesClassification(
  expected: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  let finalProvider = (await getAndCheckProvider(
    'classification',
    grading?.provider,
    null,
    'classification check',
  )) as ApiClassificationProvider;

  const resp = await finalProvider.callClassificationApi(output);

  if (!resp.classification) {
    return fail(resp.error || 'Unknown error fetching classification');
  }

  const score = resp.classification[expected] || 0;
  if (score >= threshold) {
    return {
      pass: true,
      score,
      reason: `Classification ${expected} has score ${score} >= ${threshold}`,
    };
  }
  return {
    pass: false,
    score,
    reason: `Classification ${expected} has score ${score} < ${threshold}`,
  };
}

export async function matchesLlmRubric(
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

  const prompt = nunjucks.renderString(grading.rubricPrompt || DEFAULT_GRADING_PROMPT, {
    output: JSON.stringify(output).slice(1, -1),
    rubric: JSON.stringify(expected).slice(1, -1),
    ...fromVars(vars),
  });

  let finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    DefaultGradingJsonProvider,
    'llm-rubric check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'llm-rubric produced malformed response');
  try {
    const parsed = JSON.parse(resp.output) as Partial<GradingResult>;
    const pass = parsed.pass ?? (typeof parsed.score === 'undefined' ? true : parsed.score > 0);
    return {
      pass,
      score: parsed.score ?? (pass ? 1.0 : 0.0),
      reason: parsed.reason || (pass ? 'Grading passed' : 'Grading failed'),
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  } catch (err) {
    return fail(`llm-rubric produced malformed response: ${resp.output}`, resp.tokenUsage);
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

  const prompt = nunjucks.renderString(grading.rubricPrompt || OPENAI_FACTUALITY_PROMPT, {
    input: JSON.stringify(input).slice(1, -1),
    ideal: JSON.stringify(expected).slice(1, -1),
    completion: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  let finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    DefaultGradingProvider,
    'factuality check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'factuality produced malformed response');
  try {
    const option = resp.output.trim().charAt(1).toUpperCase();
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
      reason = `Invalid option: ${option}`;
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

  const prompt = nunjucks.renderString(grading.rubricPrompt || OPENAI_CLOSED_QA_PROMPT, {
    input: JSON.stringify(input).slice(1, -1),
    criteria: JSON.stringify(expected).slice(1, -1),
    completion: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  let finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    DefaultGradingProvider,
    'model-graded-closedqa check',
  );
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'model-graded-closedqa produced malformed response');
  try {
    const pass = resp.output.endsWith('Y');
    let reason;
    if (pass) {
      reason = 'The submission meets the criterion';
    } else if (resp.output.endsWith('N')) {
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
      },
    };
  } catch (err) {
    return fail(`Error parsing output: ${(err as Error).message}`, resp.tokenUsage);
  }
}

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  let embeddingProvider = await getAndCheckProvider(
    'embedding',
    grading?.provider,
    DefaultEmbeddingProvider,
    'answer relevancy check',
  );
  let textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    DefaultGradingProvider,
    'answer relevancy check',
  );

  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
  };

  const candidateQuestions: string[] = [];
  for (let i = 0; i < 3; i++) {
    // TODO(ian): Parallelize
    const resp = await textProvider.callApi(
      JSON.stringify([
        ANSWER_RELEVANCY_GENERATE,
        {
          role: 'user',
          content: output,
        },
      ]),
    );
    if (resp.error || !resp.output) {
      tokensUsed.total += resp.tokenUsage?.total || 0;
      tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
      tokensUsed.completion += resp.tokenUsage?.completion || 0;
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
    return fail(inputEmbeddingResp.error || 'No embedding', tokensUsed);
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  for (const question of candidateQuestions) {
    const resp = await embeddingProvider.callEmbeddingApi(question);
    tokensUsed.total += resp.tokenUsage?.total || 0;
    tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
    tokensUsed.completion += resp.tokenUsage?.completion || 0;
    if (resp.error || !resp.embedding) {
      return fail(resp.error || 'No embedding', tokensUsed);
    }
    similarities.push(cosineSimilarity(inputEmbedding, resp.embedding));
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold;
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
  let textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    DefaultGradingProvider,
    'context recall check',
  );

  const promptText = nunjucks.renderString(CONTEXT_RECALL, {
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
  const pass = score >= threshold;
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
    },
  };
}

export async function matchesContextRelevance(
  question: string,
  context: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  let textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    DefaultGradingProvider,
    'context relevance check',
  );

  const promptText = nunjucks.renderString(CONTEXT_RELEVANCE, {
    context: JSON.stringify(context).slice(1, -1),
    question: JSON.stringify(question).slice(1, -1),
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
  const pass = score >= threshold;
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
  let textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    DefaultGradingProvider,
    'faithfulness check',
  );

  let promptText = nunjucks.renderString(CONTEXT_FAITHFULNESS_LONGFORM, {
    question: JSON.stringify(query).slice(1, -1),
    answer: JSON.stringify(output).slice(1, -1),
    ...fromVars(vars),
  });

  let resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return fail(resp.error || 'No output', resp.tokenUsage);
  }

  invariant(typeof resp.output === 'string', 'context-faithfulness produced malformed response');

  let statements = resp.output.split('\n');
  promptText = nunjucks.renderString(CONTEXT_FAITHFULNESS_NLI_STATEMENTS, {
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
  let pass = score >= threshold;
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
  let textProvider = await getAndCheckProvider(
    'text',
    grading?.provider,
    DefaultGradingProvider,
    'select-best check',
  );

  let promptText = nunjucks.renderString(grading?.rubricPrompt || SELECT_BEST_PROMPT, {
    criteria: JSON.stringify(criteria).slice(1, -1),
    outputs: outputs.map((output) => JSON.stringify(output).slice(1, -1)),
    ...fromVars(vars),
  });

  let resp = await textProvider.callApi(promptText);
  if (resp.error || !resp.output) {
    return new Array(outputs.length).fill(fail(resp.error || 'No output', resp.tokenUsage));
  }

  invariant(typeof resp.output === 'string', 'select-best produced malformed response');

  const firstDigitMatch = resp.output.trim().match(/\d/);
  const verdict = firstDigitMatch ? parseInt(firstDigitMatch[0], 10) : NaN;

  if (isNaN(verdict) || verdict < 0 || verdict >= outputs.length) {
    return new Array(outputs.length).fill(fail(`Invalid select-best verdict: ${verdict}`));
  }

  const tokensUsed = {
    total: resp.tokenUsage?.total || 0,
    prompt: resp.tokenUsage?.prompt || 0,
    completion: resp.tokenUsage?.completion || 0,
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
