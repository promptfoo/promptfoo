import nunjucks from 'nunjucks';

import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai.js';
import { cosineSimilarity } from './util.js';
import { loadApiProvider } from './providers.js';
import { DEFAULT_GRADING_PROMPT } from './prompts.js';

import type { EvaluateOptions, GradingConfig, TokenUsage } from './types.js';

interface GradingResult {
  pass: boolean;
  reason: string;
  tokensUsed: TokenUsage;
}

const SIMILAR_REGEX = /similar(?::|\((\d+(\.\d+)?)\):)/;

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

export async function matchesExpectedValue(
  expected: string,
  output: string,
  options: EvaluateOptions,
): Promise<{ pass: boolean; reason?: string }> {
  const match = expected.match(SIMILAR_REGEX);

  if (match) {
    const threshold = parseFloat(match[1]) || DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD;
    const rest = expected.replace(SIMILAR_REGEX, '').trim();
    return matchesSimilarity(rest, output, threshold);
  } else if (expected.startsWith('fn:') || expected.startsWith('eval:')) {
    // TODO(1.0): delete eval: legacy option
    const sliceLength = expected.startsWith('fn:') ? 'fn:'.length : 'eval:'.length;
    const functionBody = expected.slice(sliceLength);

    const customFunction = new Function('output', `return ${functionBody}`);
    return { pass: customFunction(output) };
  } else if (expected.startsWith('grade:')) {
    return matchesLlmRubric(expected.slice(6), output, options.grading);
  } else {
    const pass = expected === output;
    return {
      pass,
      reason: pass ? undefined : `Expected: ${expected}, Output: ${output}`,
    };
  }
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
): Promise<GradingResult> {
  const expectedEmbedding = await DefaultEmbeddingProvider.callEmbeddingApi(expected);
  const outputEmbedding = await DefaultEmbeddingProvider.callEmbeddingApi(output);

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
      reason:
        expectedEmbedding.error || outputEmbedding.error || 'Unknown error fetching embeddings',
      tokensUsed,
    };
  }

  if (!expectedEmbedding.embedding || !outputEmbedding.embedding) {
    return {
      pass: false,
      reason: 'Embedding not found',
      tokensUsed,
    };
  }

  const similarity = cosineSimilarity(expectedEmbedding.embedding, outputEmbedding.embedding);
  if (similarity < threshold) {
    return {
      pass: false,
      reason: `Similarity ${similarity} is less than threshold ${threshold}`,
      tokensUsed,
    };
  }
  return {
    pass: true,
    reason: `Similarity ${similarity} is greater than threshold ${threshold}`,
    tokensUsed,
  };
}

export async function matchesLlmRubric(
  expected: string,
  output: string,
  options?: GradingConfig,
): Promise<GradingResult> {
  if (!options) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const prompt = nunjucks.renderString(options.prompt || DEFAULT_GRADING_PROMPT, {
    content: output,
    rubric: expected,
  });

  let provider = options.provider || DefaultGradingProvider;
  if (typeof provider === 'string') {
    provider = await loadApiProvider(provider);
  }
  const resp = await provider.callApi(prompt);
  if (resp.error || !resp.output) {
    return {
      pass: false,
      reason: resp.error || 'No output',
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }

  try {
    const parsed = JSON.parse(resp.output) as GradingResult;
    parsed.tokensUsed = {
      total: resp.tokenUsage?.total || 0,
      prompt: resp.tokenUsage?.prompt || 0,
      completion: resp.tokenUsage?.completion || 0,
    };
    return parsed;
  } catch (err) {
    return {
      pass: false,
      reason: `Output is not valid JSON: ${resp.output}`,
      tokensUsed: {
        total: resp.tokenUsage?.total || 0,
        prompt: resp.tokenUsage?.prompt || 0,
        completion: resp.tokenUsage?.completion || 0,
      },
    };
  }
}

export default {
  matchesSimilarity,
  matchesLlmRubric,
};
