import invariant from 'tiny-invariant';
import logger from './logger';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai';
import { getNunjucksEngine } from './util';
import { loadApiProvider } from './providers';
import {
  ANSWER_RELEVANCY_GENERATE,
  DEFAULT_GRADING_PROMPT,
  OPENAI_CLOSED_QA_PROMPT,
  OPENAI_FACTUALITY_PROMPT,
} from './prompts';

import type { ApiProvider, GradingConfig, GradingResult, ProviderOptions } from './types';

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

export async function getGradingProvider(
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider | null,
): Promise<ApiProvider | null> {
  let finalProvider: ApiProvider | null;
  if (typeof provider === 'string') {
    finalProvider = await loadApiProvider(provider);
  } else if (
    typeof provider === 'object' &&
    typeof (provider as ApiProvider).callApi === 'function'
  ) {
    // Defined directly as an ApiProvider
    finalProvider = provider as ApiProvider;
  } else if (typeof provider === 'object') {
    // Defined as ProviderOptions
    const providerId = typeof provider.id === 'string' ? provider.id : provider.id?.();
    invariant(providerId, 'Provider supplied to llm-rubric must have an id');
    // TODO(ian): set basepath if invoked from filesystem config
    finalProvider = await loadApiProvider(providerId, { options: provider as ProviderOptions });
  } else {
    finalProvider = defaultProvider;
  }
  return finalProvider;
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  let provider = grading?.provider;
  let finalProvider = await getGradingProvider(provider, DefaultEmbeddingProvider);

  invariant(finalProvider, 'No provider found for similarity check');
  if (typeof finalProvider.callEmbeddingApi !== 'function') {
    logger.warn(
      `Provider ${finalProvider.id} does not implement callEmbeddingApi for similarity check, falling back to default`,
    );
    finalProvider = DefaultEmbeddingProvider;
  }

  invariant(
    typeof finalProvider.callEmbeddingApi === 'function',
    `Provider ${finalProvider.id} must implement callEmbeddingApi for similarity check`,
  );

  const expectedEmbedding = await finalProvider.callEmbeddingApi(expected);
  const outputEmbedding = await finalProvider.callEmbeddingApi(output);

  const tokensUsed = {
    total: (expectedEmbedding.tokenUsage?.total || 0) + (outputEmbedding.tokenUsage?.total || 0),
    prompt: (expectedEmbedding.tokenUsage?.prompt || 0) + (outputEmbedding.tokenUsage?.prompt || 0),
    completion:
      (expectedEmbedding.tokenUsage?.completion || 0) +
      (outputEmbedding.tokenUsage?.completion || 0),
  };

  if (expectedEmbedding.error || outputEmbedding.error) {
    return {
      pass: false,
      score: 0,
      reason:
        expectedEmbedding.error || outputEmbedding.error || 'Unknown error fetching embeddings',
      tokensUsed,
    };
  }

  if (!expectedEmbedding.embedding || !outputEmbedding.embedding) {
    return {
      pass: false,
      score: 0,
      reason: 'Embedding not found',
      tokensUsed,
    };
  }

  const similarity = cosineSimilarity(expectedEmbedding.embedding, outputEmbedding.embedding);
  const pass = inverse ? similarity <= threshold : similarity >= threshold;
  const greaterThanReason = `Similarity ${similarity} is greater than threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity} is less than threshold ${threshold}`;
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
  let provider = grading?.provider;
  let finalProvider = await getGradingProvider(provider, null);

  invariant(finalProvider, 'No provider found for classification check');
  if (typeof finalProvider.callClassificationApi !== 'function') {
    throw new Error(`Provider ${finalProvider.id} does not implement callClassificationApi`);
  }

  invariant(
    typeof finalProvider.callClassificationApi === 'function',
    `Provider ${finalProvider.id} must implement callClassificationApi for classification check`,
  );

  const resp = await finalProvider.callClassificationApi(output);
  if (resp.error || !resp.classification) {
    return {
      pass: false,
      score: 0,
      reason: resp.error || 'Unknown error fetching classification',
    };
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

  let provider = grading.provider;
  let finalProvider = await getGradingProvider(provider, DefaultGradingProvider);
  invariant(finalProvider, 'No provider found for llm-rubric check');
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: resp.error || 'No output',
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }

  invariant(typeof resp.output === 'string', 'llm-rubric produced malformed response');
  try {
    const parsed = JSON.parse(resp.output) as Partial<GradingResult>;
    parsed.tokensUsed = {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
    };
    const pass = parsed.pass ?? (typeof parsed.score === 'undefined' ? true : parsed.score > 0);
    return {
      pass,
      score: parsed.score ?? (pass ? 1.0 : 0.0),
      reason: parsed.reason || (pass ? 'Grading passed' : 'Grading failed'),
    };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `llm-rubric produced malformed response: ${resp.output}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
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

  let provider = grading.provider;
  let finalProvider = await getGradingProvider(provider, DefaultGradingProvider);
  invariant(finalProvider, 'No provider found for model-graded-factuality check');
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: resp.error || 'No output',
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }

  invariant(typeof resp.output === 'string', 'model-graded-factuality produced malformed response');
  try {
    const option = resp.output.trim().charAt(1); // Extract the option character
    let reason = '';

    const scoreLookup: Record<string, number> = {
      A: grading.closedQa?.subset ?? 1,
      B: grading.closedQa?.superset ?? 1,
      C: grading.closedQa?.agree ?? 1,
      D: grading.closedQa?.disagree ?? 0,
      E: grading.closedQa?.differButFactual ?? 1,
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
    return {
      pass: false,
      score: 0,
      reason: `Error parsing output: ${(err as Error).message}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
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

  let provider = grading.provider;
  let finalProvider = await getGradingProvider(provider, DefaultGradingProvider);
  invariant(finalProvider, 'No provider found for model-graded-closedqa check');
  const resp = await finalProvider.callApi(prompt);
  if (resp.error || !resp.output) {
    return {
      pass: false,
      score: 0,
      reason: resp.error || 'No output',
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
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
    return {
      pass: false,
      score: 0,
      reason: `Error parsing output: ${(err as Error).message}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }
}

export async function matchesAnswerRelevance(
  input: string,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  let provider = grading?.provider;
  let finalProvider = await getGradingProvider(provider, DefaultEmbeddingProvider);

  invariant(finalProvider, 'No provider found for answer relevancy check');
  if (typeof finalProvider.callEmbeddingApi !== 'function') {
    logger.warn(
      `Provider ${finalProvider.id} does not implement callEmbeddingApi for similarity check, falling back to default`,
    );
    finalProvider = DefaultEmbeddingProvider;
  }

  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
  };

  const candidateQuestions: string[] = [];
  for (let i=0; i<3; i++) {
    const resp = await finalProvider.callApi(JSON.stringify([
      ANSWER_RELEVANCY_GENERATE,
      {
        role: 'user',
        content: output,
      },
    ]));
    if (resp.error || !resp.output) {
      tokensUsed.total += resp.tokenUsage?.total || 0;
      tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
      tokensUsed.completion += resp.tokenUsage?.completion || 0;
      return {
        pass: false,
        score: 0,
        reason: resp.error || 'No output',
        tokensUsed,
      };
    }
    invariant(typeof resp.output === 'string', 'llm-rubric produced malformed response');
    candidateQuestions.push(resp.output);
  }

  invariant(
    typeof finalProvider.callEmbeddingApi === 'function',
    `Provider ${finalProvider.id} must implement callEmbeddingApi for similarity check`,
  );

  const inputEmbeddingResp = await finalProvider.callEmbeddingApi(input);
  if (inputEmbeddingResp.error || !inputEmbeddingResp.embedding) {
    tokensUsed.total += inputEmbeddingResp.tokenUsage?.total || 0;
    tokensUsed.prompt += inputEmbeddingResp.tokenUsage?.prompt || 0;
    tokensUsed.completion += inputEmbeddingResp.tokenUsage?.completion || 0;
    return {
      pass: false,
      score: 0,
      reason: inputEmbeddingResp.error || 'No embedding',
      tokensUsed,
    };
  }
  const inputEmbedding = inputEmbeddingResp.embedding;

  const similarities: number[] = [];
  for (const question of candidateQuestions) {
    const resp = await finalProvider.callEmbeddingApi(question);
    tokensUsed.total += resp.tokenUsage?.total || 0;
    tokensUsed.prompt += resp.tokenUsage?.prompt || 0;
    tokensUsed.completion += resp.tokenUsage?.completion || 0;
    if (resp.error || !resp.embedding) {
      return {
        pass: false,
        score: 0,
        reason: resp.error || 'No embedding',
        tokensUsed,
      };
    }
    similarities.push(cosineSimilarity(inputEmbedding, resp.embedding));
  }

  const similarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pass = similarity >= threshold;
  const greaterThanReason = `Similarity ${similarity} is greater than threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity} is less than threshold ${threshold}`;
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
