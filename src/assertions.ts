import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';

import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai.js';
import { cosineSimilarity } from './util.js';
import { loadApiProvider } from './providers.js';
import { DEFAULT_GRADING_PROMPT } from './prompts.js';

import type { Assertion, GradingConfig, TestCase, TokenUsage } from './types.js';

interface GradingResult {
  pass: boolean;
  reason: string;
  tokensUsed?: TokenUsage;
}

const SIMILAR_REGEX = /similar(?::|\((\d+(\.\d+)?)\):)/;

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

export async function runAssertions(test: TestCase, output: string): Promise<GradingResult> {
  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
  };

  if (!test.assert) {
    return { pass: true, reason: 'No assertions', tokensUsed };
  }

  for (const assertion of test.assert) {
    const result = await runAssertion(assertion, test, output);
    if (!result.pass) {
      return result;
    }

    if (result.tokensUsed) {
      tokensUsed.total += result.tokensUsed.total;
      tokensUsed.prompt += result.tokensUsed.prompt;
      tokensUsed.completion += result.tokensUsed.completion;
    }
  }

  return { pass: true, reason: 'All assertions passed', tokensUsed };
}

async function runAssertion(
  assertion: Assertion,
  test: TestCase,
  output: string,
): Promise<GradingResult> {
  let pass: boolean = false;

  if (assertion.type === 'equality') {
    pass = assertion.value === output;
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected ${output} to equal ${assertion.value}`,
    };
  }

  if (assertion.type === 'function') {
    try {
      const customFunction = new Function('output', `return ${assertion.value}`);
      pass = customFunction(output);
    } catch (err) {
      return {
        pass: false,
        reason: `Custom function threw error: ${(err as Error).message}`,
      };
    }
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Custom function returned false`,
    };
  }

  if (assertion.type === 'similarity') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(assertion.threshold, 'Similarity assertion must have a threshold');
    return matchesSimilarity(assertion.value, output, assertion.threshold);
  }

  if (assertion.type === 'llm-rubric') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    return matchesLlmRubric(assertion.value, output, test.grading);
  }

  throw new Error('Unknown assertion type: ' + assertion.type);
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

export function assertionFromString(expected: string): Assertion {
  const match = expected.match(SIMILAR_REGEX);
  if (match) {
    const threshold = parseFloat(match[1]) || DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD;
    const rest = expected.replace(SIMILAR_REGEX, '').trim();
    return {
      type: 'similarity',
      value: rest,
      threshold,
    };
  }
  if (expected.startsWith('fn:') || expected.startsWith('eval:')) {
    // TODO(1.0): delete eval: legacy option
    const sliceLength = expected.startsWith('fn:') ? 'fn:'.length : 'eval:'.length;
    const functionBody = expected.slice(sliceLength);
    return {
      type: 'function',
      value: functionBody,
    };
  }
  if (expected.startsWith('grade:')) {
    return {
      type: 'llm-rubric',
      value: expected.slice(6),
    };
  }
  return {
    type: 'equality',
    value: expected,
  };
}

export default {
  matchesSimilarity,
  matchesLlmRubric,
};
