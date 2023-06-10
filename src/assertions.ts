import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';

import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai';
import { cosineSimilarity } from './util';
import { loadApiProvider } from './providers';
import { DEFAULT_GRADING_PROMPT } from './prompts';

import type { Assertion, GradingConfig, TestCase, GradingResult, AtomicTestCase } from './types';

const SIMILAR_REGEX = /similar(?::|\((\d+(\.\d+)?)\):)/;

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

export async function runAssertions(test: AtomicTestCase, output: string): Promise<GradingResult> {
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

export async function runAssertion(
  assertion: Assertion,
  test: AtomicTestCase,
  output: string,
): Promise<GradingResult> {
  let pass: boolean = false;

  if (assertion.type === 'equals') {
    pass = assertion.value === output;
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output "${assertion.value}"`,
    };
  }

  if (assertion.type === 'is-json') {
    try {
      JSON.parse(output);
      return { pass: true, reason: 'Assertion passed' };
    } catch (err) {
      return {
        pass: false,
        reason: `Expected output to be valid JSON, but it isn't.\nError: ${err}`,
      };
    }
  }

  if (assertion.type === 'contains') {
    invariant(assertion.value, '"contains" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const pass = output.includes(assertion.value);
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to contain "${assertion.value}"`,
    };
  }

  if (assertion.type === 'not-contains') {
    invariant(assertion.value, '"not-contains" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const pass = !output.includes(assertion.value);
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to not contain "${assertion.value}"`,
    };
  }

  if (assertion.type === 'contains-any') {
    invariant(assertion.value, '"contains-any" assertion type must have a value');
    invariant(
      Array.isArray(assertion.value),
      '"contains-any" assertion type must have an array value',
    );
    const pass = assertion.value.some((value) => output.includes(value));
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to contain one of "${assertion.value.join(', ')}"`,
    };
  }

  if (assertion.type === 'contains-all') {
    invariant(assertion.value, '"contains-all" assertion type must have a value');
    invariant(
      Array.isArray(assertion.value),
      '"contains-all" assertion type must have an array value',
    );
    const pass = assertion.value.every((value) => output.includes(value));
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to contain all of "${assertion.value.join(', ')}"`,
    };
  }

  if (assertion.type === 'regex') {
    invariant(assertion.value, '"regex" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const regex = new RegExp(assertion.value);
    const pass = regex.test(output);
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to match regex "${assertion.value}"`,
    };
  }

  if (assertion.type === 'not-regex') {
    invariant(assertion.value, '"not-regex" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const regex = new RegExp(assertion.value);
    const pass = !regex.test(output);
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to not match regex "${assertion.value}"`,
    };
  }

  if (assertion.type === 'contains-lower') {
    invariant(assertion.value, '"contains-lower" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const pass = output.toLowerCase().includes(assertion.value.toLowerCase());
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to contain "${assertion.value}"`,
    };
  }

  if (assertion.type === 'not-contains-lower') {
    invariant(assertion.value, '"not-contains-lower" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const pass = !output.toLowerCase().includes(assertion.value.toLowerCase());
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output to not contain "${assertion.value}"`,
    };
  }

  if (assertion.type === 'contains-json') {
    const pass = containsJSON(output);
    return {
      pass,
      reason: pass ? 'Assertion passed' : 'Expected output to contain valid JSON',
    };
  }

  if (assertion.type === 'javascript') {
    try {
      const customFunction = new Function('output', `return ${assertion.value}`);
      pass = customFunction(output);
    } catch (err) {
      return {
        pass: false,
        reason: `Custom function threw error: ${(err as Error).message}\n${assertion.value}`,
      };
    }
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Custom function returned false\n${assertion.value}`,
    };
  }

  if (assertion.type === 'similar') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesSimilarity(assertion.value, output, assertion.threshold || 0.75);
  }

  if (assertion.type === 'not-similar') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesSimilarity(
      assertion.value,
      output,
      assertion.threshold || 0.25,
      true /* inverse */,
    );
  }

  if (assertion.type === 'llm-rubric') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesLlmRubric(assertion.value, output, test.options);
  }

  throw new Error('Unknown assertion type: ' + assertion.type);
}

function containsJSON(str: string): boolean {
  // Regular expression to check for JSON-like pattern
  const jsonPattern = /({[\s\S]*}|\[[\s\S]*])/;

  const match = str.match(jsonPattern);

  if (!match) {
    return false;
  }

  try {
    JSON.parse(match[0]);
    return true;
  } catch (error) {
    return false;
  }
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
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
  const pass = inverse ? similarity <= threshold : similarity >= threshold;
  const greaterThanReason = `Similarity ${similarity} is greater than threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity} is less than threshold ${threshold}`;
  if (pass) {
    return {
      pass: true,
      reason: inverse ? lessThanReason : greaterThanReason,
      tokensUsed,
    };
  }
  return {
    pass: false,
    reason: inverse ? greaterThanReason : lessThanReason,
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

  const prompt = nunjucks.renderString(options.rubricPrompt || DEFAULT_GRADING_PROMPT, {
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
      type: 'similar',
      value: rest,
      threshold,
    };
  }
  if (expected.startsWith('fn:') || expected.startsWith('eval:')) {
    // TODO(1.0): delete eval: legacy option
    const sliceLength = expected.startsWith('fn:') ? 'fn:'.length : 'eval:'.length;
    const functionBody = expected.slice(sliceLength);
    return {
      type: 'javascript',
      value: functionBody,
    };
  }
  if (expected.startsWith('grade:')) {
    return {
      type: 'llm-rubric',
      value: expected.slice(6),
    };
  }
  if (expected === 'is-json' || expected === 'contains-json') {
    return {
      type: expected,
    };
  }
  return {
    type: 'equals',
    value: expected,
  };
}

export default {
  matchesSimilarity,
  matchesLlmRubric,
};
