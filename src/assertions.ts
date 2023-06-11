import rouge from 'rouge';
import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';

import telemetry from './telemetry';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai';
import { cosineSimilarity, fetchWithTimeout } from './util';
import { loadApiProvider } from './providers';
import { DEFAULT_GRADING_PROMPT } from './prompts';

import type {
  Assertion,
  AssertionType,
  GradingConfig,
  GradingResult,
  AtomicTestCase,
} from './types';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

function handleRougeScore(
  baseType: 'rouge-n',
  assertion: Assertion,
  expected: string | string[],
  output: string,
  inverted: boolean,
): GradingResult {
  const fnName = baseType[baseType.length - 1] as 'n' | 'l' | 's';
  const rougeMethod = rouge[fnName];
  const score = rougeMethod(output, expected);
  const pass = score >= (assertion.threshold || 0.75) != inverted;

  return {
    pass,
    reason: pass
      ? `${baseType.toUpperCase()} score ${score} is greater than or equal to threshold ${
          assertion.threshold || 0.75
        }`
      : `${baseType.toUpperCase()} score ${score} is less than threshold ${
          assertion.threshold || 0.75
        }`,
  };
}

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

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse ? assertion.type.slice(4) : assertion.type;

  telemetry.record('assertion_used', {
    type: baseType,
  });

  if (baseType === 'equals') {
    pass = assertion.value === output;
    return {
      pass,
      reason: pass ? 'Assertion passed' : `Expected output "${assertion.value}"`,
    };
  }

  if (baseType === 'is-json') {
    try {
      JSON.parse(output);
      pass = !inverse;
    } catch (err) {
      pass = inverse;
    }
    return { pass, reason: pass ? 'Assertion passed' : 'Expected output to be valid JSON' };
  }

  if (baseType === 'contains') {
    invariant(assertion.value, '"contains" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    pass = output.includes(assertion.value) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain "${assertion.value}"`,
    };
  }

  if (baseType === 'contains-any') {
    invariant(assertion.value, '"contains-any" assertion type must have a value');
    invariant(
      Array.isArray(assertion.value),
      '"contains-any" assertion type must have an array value',
    );
    pass = assertion.value.some((value) => output.includes(value)) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain one of "${assertion.value.join(
            ', ',
          )}"`,
    };
  }

  if (baseType === 'contains-all') {
    invariant(assertion.value, '"contains-all" assertion type must have a value');
    invariant(
      Array.isArray(assertion.value),
      '"contains-all" assertion type must have an array value',
    );
    pass = assertion.value.every((value) => output.includes(value)) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain all of "${assertion.value.join(
            ', ',
          )}"`,
    };
  }

  if (baseType === 'regex') {
    invariant(assertion.value, '"regex" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    const regex = new RegExp(assertion.value);
    pass = regex.test(output) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}match regex "${assertion.value}"`,
    };
  }

  if (baseType === 'icontains') {
    invariant(assertion.value, '"icontains" assertion type must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"icontains" assertion type must have a string value',
    );
    pass = output.toLowerCase().includes(assertion.value.toLowerCase()) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain "${assertion.value}"`,
    };
  }

  if (baseType === 'contains-json') {
    pass = containsJSON(output) !== inverse;
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain valid JSON`,
    };
  }

  if (baseType === 'javascript') {
    try {
      const customFunction = new Function('output', 'context', `return ${assertion.value}`);
      const context = {
        vars: test.vars || {},
      };
      pass = customFunction(output, context) !== inverse;
    } catch (err) {
      return {
        pass: false,
        reason: `Custom function threw error: ${(err as Error).message}
${assertion.value}`,
      };
    }
    return {
      pass,
      reason: pass
        ? 'Assertion passed'
        : `Custom function returned ${inverse ? 'true' : 'false'}
${assertion.value}`,
    };
  }

  if (baseType === 'similar') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesSimilarity(assertion.value, output, assertion.threshold || 0.75, inverse);
  }

  if (baseType === 'llm-rubric') {
    invariant(assertion.value, 'Similarity assertion must have a string value');
    invariant(
      typeof assertion.value === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesLlmRubric(assertion.value, output, test.options);
  }

  if (baseType === 'webhook') {
    invariant(assertion.value, '"webhook" assertion type must have a URL value');
    invariant(
      typeof assertion.value === 'string',
      '"webhook" assertion type must have a URL value',
    );

    try {
      const context = {
        vars: test.vars || {},
      };
      const response = await fetchWithTimeout(
        assertion.value,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ output, context }),
        },
        process.env.WEBHOOK_TIMEOUT ? parseInt(process.env.WEBHOOK_TIMEOUT, 10) : 5000,
      );

      if (!response.ok) {
        throw new Error(`Webhook response status: ${response.status}`);
      }

      const jsonResponse = await response.json();
      pass = jsonResponse.pass !== inverse;
    } catch (err) {
      return {
        pass: false,
        reason: `Webhook error: ${(err as Error).message}`,
      };
    }

    return {
      pass,
      reason: pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`,
    };
  }

  if (baseType === 'rouge-n') {
    invariant(assertion.value, '"rouge" assertion type must a value (string or string array)');
    return handleRougeScore(baseType, assertion, assertion.value, output, inverse);
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
  // Legacy options
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

  // New options
  const assertionRegex =
    /^(not-)?(equals|contains-any|contains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar)(?::|\((\d+(\.\d+)?)\):)?(.*)$/;
  const regexMatch = expected.match(assertionRegex);

  if (regexMatch) {
    const [_, notPrefix, type, __, thresholdStr, value] = regexMatch;
    const fullType = notPrefix ? `not-${type}` : type;
    const threshold = parseFloat(thresholdStr);

    if (type === 'contains-any' || type === 'contains-all') {
      return {
        type: fullType as AssertionType,
        value: value.split(',').map((s) => s.trim()),
      };
    } else if (type === 'contains-json' || type === 'is-json') {
      return {
        type: fullType as AssertionType,
      };
    } else if (type === 'rouge-n' || type === 'similar') {
      return {
        type: fullType as AssertionType,
        value,
        threshold: threshold || (type === 'similar' ? DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD : 0.75),
      };
    } else {
      return {
        type: fullType as AssertionType,
        value,
      };
    }
  }

  // Default to equality
  return {
    type: 'equals',
    value: expected,
  };
}

export default {
  matchesSimilarity,
  matchesLlmRubric,
};
