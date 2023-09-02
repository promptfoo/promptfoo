import invariant from 'tiny-invariant';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai';
import { cosineSimilarity, getNunjucksEngine } from './util';
import { loadApiProvider } from './providers';
import { DEFAULT_GRADING_PROMPT, OPENAI_FACTUALITY_PROMPT } from './prompts';

import type { ApiProvider, GradingConfig, GradingResult, ProviderOptions } from './types';

const nunjucks = getNunjucksEngine();

export async function getGradingProvider(
  provider: GradingConfig['provider'],
  defaultProvider: ApiProvider,
): Promise<ApiProvider> {
  let finalProvider: ApiProvider;
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

  invariant(
    finalProvider.callEmbeddingApi,
    'Provider must implement callEmbeddingApi for similarity check',
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

export async function matchesLlmRubric(
  expected: string,
  output: string,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const prompt = nunjucks.renderString(grading.rubricPrompt || DEFAULT_GRADING_PROMPT, {
    output: output.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
    rubric: expected.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
  });

  let provider = grading.provider;
  let finalProvider = await getGradingProvider(provider, DefaultGradingProvider);
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

  try {
    const parsed = JSON.parse(resp.output) as Omit<GradingResult, 'score'>;
    parsed.tokensUsed = {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
    };
    return { ...parsed, score: parsed.pass ? 1 : 0 };
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Output is not valid JSON: ${resp.output}`,
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
): Promise<Omit<GradingResult, 'assertion'>> {
  if (!grading) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const prompt = nunjucks.renderString(grading.rubricPrompt || OPENAI_FACTUALITY_PROMPT, {
    input: input.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
    ideal: expected.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
    completion: output.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
  });

  let provider = grading.provider;
  let finalProvider = await getGradingProvider(provider, DefaultGradingProvider);
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

  try {
    const option = resp.output.trim().charAt(1); // Extract the option character
    let pass = false;
    let reason = '';

    switch (option) {
      case 'A':
        pass = true;
        reason = `The submitted answer is a subset of the expert answer and is fully consistent with it.`;
        break;
      case 'B':
        pass = true;
        reason = `The submitted answer is a superset of the expert answer and is fully consistent with it.`;
        break;
      case 'C':
        pass = true;
        reason = `The submitted answer contains all the same details as the expert answer.`;
        break;
      case 'D':
        pass = false;
        reason = `There is a disagreement between the submitted answer and the expert answer.`;
        break;
      case 'E':
        pass = false;
        reason = `The answers differ, but these differences don't matter from the perspective of factuality.`;
        break;
      default:
        reason = `Invalid option: ${option}`;
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
      reason: `Error parsing output: ${err.message}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }
}
