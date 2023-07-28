import rouge from 'rouge';
import invariant from 'tiny-invariant';
import nunjucks from 'nunjucks';

import telemetry from './telemetry';
import { DefaultEmbeddingProvider, DefaultGradingProvider } from './providers/openai';
import { cosineSimilarity, fetchWithRetries } from './util';
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
    score: inverted ? 1 - score : score,
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

  if (!test.assert || test.assert.length < 1) {
    return { pass: true, score: 1, reason: 'No assertions', tokensUsed };
  }

  let totalScore = 0;
  let totalWeight = 0;
  for (const assertion of test.assert) {
    const weight = assertion.weight || 1;
    totalWeight += weight;

    const result = await runAssertion(assertion, test, output);
    totalScore += result.score * weight;
    if (result.tokensUsed) {
      tokensUsed.total += result.tokensUsed.total;
      tokensUsed.prompt += result.tokensUsed.prompt;
      tokensUsed.completion += result.tokensUsed.completion;
    }

    if (!result.pass) {
      // Short-circuit assertions
      return result;
    }
  }

  return {
    pass: true,
    score: totalScore / totalWeight,
    reason: 'All assertions passed',
    tokensUsed,
  };
}

export async function runAssertion(
  assertion: Assertion,
  test: AtomicTestCase,
  output: string,
): Promise<GradingResult> {
  let pass: boolean = false;
  let score: number = 0.0;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse ? assertion.type.slice(4) : assertion.type;

  telemetry.record('assertion_used', {
    type: baseType,
  });

  //render assertion values
  let renderedValue = assertion.value;
  // renderString for assertion values
  if (renderedValue && typeof renderedValue === 'string') {
    renderedValue = nunjucks.renderString(renderedValue, test.vars || {});
  } else if (renderedValue && Array.isArray(renderedValue)) {
    renderedValue = renderedValue.map((v) => nunjucks.renderString(v, test.vars || {}));
  }

  if (baseType === 'equals') {
    pass = renderedValue === output;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : `Expected output "${renderedValue}"`,
    };
  }

  if (baseType === 'is-json') {
    try {
      JSON.parse(output);
      pass = !inverse;
    } catch (err) {
      pass = inverse;
    }
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : 'Expected output to be valid JSON',
    };
  }

  if (baseType === 'contains') {
    invariant(renderedValue, '"contains" assertion type must have a string or number value');
    invariant(
      typeof renderedValue === 'string' || typeof renderedValue === 'number',
      '"contains" assertion type must have a string or number value',
    );
    pass = output.includes(String(renderedValue)) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain "${renderedValue}"`,
    };
  }

  if (baseType === 'contains-any') {
    invariant(renderedValue, '"contains-any" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"contains-any" assertion type must have an array value',
    );
    pass = renderedValue.some((value) => output.includes(value)) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain one of "${renderedValue.join(', ')}"`,
    };
  }

  if (baseType === 'contains-all') {
    invariant(renderedValue, '"contains-all" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"contains-all" assertion type must have an array value',
    );
    pass = renderedValue.every((value) => output.includes(value)) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain all of "${renderedValue.join(', ')}"`,
    };
  }

  if (baseType === 'regex') {
    invariant(renderedValue, '"regex" assertion type must have a string value');
    invariant(
      typeof renderedValue === 'string',
      '"contains" assertion type must have a string value',
    );
    const regex = new RegExp(renderedValue);
    pass = regex.test(output) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}match regex "${renderedValue}"`,
    };
  }

  if (baseType === 'icontains') {
    invariant(renderedValue, '"icontains" assertion type must have a string or number value');
    invariant(
      typeof renderedValue === 'string' || typeof renderedValue === 'number',
      '"icontains" assertion type must have a string or number value',
    );
    pass = output.toLowerCase().includes(String(renderedValue).toLowerCase()) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain "${renderedValue}"`,
    };
  }

  if (baseType === 'starts-with') {
    invariant(renderedValue, '"starts-with" assertion type must have a string value');
    invariant(
      typeof renderedValue === 'string',
      '"starts-with" assertion type must have a string value',
    );
    pass = output.startsWith(String(renderedValue)) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}start with "${renderedValue}"`,
    };
  }

  if (baseType === 'contains-json') {
    pass = containsJSON(output) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain valid JSON`,
    };
  }

  const context = {
    vars: test.vars || {},
  };

  if (baseType === 'javascript') {
    try {
      if (typeof assertion.value === 'function') {
        return assertion.value(output, test, assertion);
      }
      const customFunction = new Function('output', 'context', `return ${renderedValue}`);
      const result = customFunction(output, context) as any;
      if (typeof result === 'boolean') {
        pass = result !== inverse;
        score = 1.0;
      } else if (typeof result === 'number') {
        pass = true;
        score = result;
      } else {
        throw new Error('Custom function must return a boolean or number');
      }
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Custom function threw error: ${(err as Error).message}
${renderedValue}`,
      };
    }
    return {
      pass,
      score,
      reason: pass
        ? 'Assertion passed'
        : `Custom function returned ${inverse ? 'true' : 'false'}
${renderedValue}`,
    };
  }

  if (baseType === 'python') {
    try {
      const { execSync } = require('child_process');
      const escapedOutput = output.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const escapedContext = JSON.stringify(context).replace(/'/g, "\\'").replace(/"/g, '\\"');
      const result = execSync(
        `python -c "import json; import math; import os; import sys; import re; import datetime; import random; import collections; output='${escapedOutput}'; context='${escapedContext}'; print(json.dumps(${assertion.value}))"`,
      )
        .toString()
        .trim();
      if (result === 'true') {
        pass = true;
        score = 1.0;
      } else if (result === 'false') {
        pass = false;
        score = 0.0;
      } else if (result.startsWith('{')) {
        return JSON.parse(result);
      } else {
        pass = true;
        score = parseFloat(result);
        if (isNaN(score)) {
          throw new Error(
            'Python code must return a boolean, number, or {pass, score, reason} object',
          );
        }
      }
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Python code execution failed: ${(err as Error).message}`,
      };
    }
    return {
      pass,
      score,
      reason: pass
        ? 'Assertion passed'
        : `Python code returned ${pass ? 'true' : 'false'}
${assertion.value}`,
    };
  }

  if (baseType === 'similar') {
    invariant(renderedValue, 'Similarity assertion must have a string value');
    invariant(
      typeof renderedValue === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesSimilarity(renderedValue, output, assertion.threshold || 0.75, inverse);
  }

  if (baseType === 'llm-rubric') {
    invariant(renderedValue, 'Similarity assertion must have a string value');
    invariant(
      typeof renderedValue === 'string',
      '"contains" assertion type must have a string value',
    );
    return matchesLlmRubric(renderedValue, output, test.options);
  }

  if (baseType === 'webhook') {
    invariant(renderedValue, '"webhook" assertion type must have a URL value');
    invariant(typeof renderedValue === 'string', '"webhook" assertion type must have a URL value');

    try {
      const context = {
        vars: test.vars || {},
      };
      const response = await fetchWithRetries(
        renderedValue,
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
      score =
        typeof jsonResponse.score === 'undefined'
          ? pass
            ? 1
            : 0
          : inverse
          ? 1 - jsonResponse.score
          : jsonResponse.score;
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Webhook error: ${(err as Error).message}`,
      };
    }

    return {
      pass,
      score,
      reason: pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`,
    };
  }

  if (baseType === 'rouge-n') {
    invariant(
      typeof renderedValue === 'string' || Array.isArray(renderedValue),
      '"rouge" assertion type must be a value (string or string array)',
    );
    return handleRougeScore(baseType, assertion, renderedValue, output, inverse);
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
  options?: GradingConfig,
): Promise<GradingResult> {
  if (!options) {
    throw new Error(
      'Cannot grade output without grading config. Specify --grader option or grading config.',
    );
  }

  const prompt = nunjucks.renderString(options.rubricPrompt || DEFAULT_GRADING_PROMPT, {
    output: output.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
    rubric: expected.replace(/\n/g, '\\n').replace(/"/g, '\\"'),
  });

  let provider = options.provider || DefaultGradingProvider;
  if (typeof provider === 'string') {
    provider = await loadApiProvider(provider);
  }
  const resp = await provider.callApi(prompt);
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
    /^(not-)?(equals|contains-any|contains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar|starts-with)(?::|\((\d+(\.\d+)?)\):)?(.*)$/;
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
    } else if (type === 'rouge-n' || type === 'similar' || type === 'starts-with') {
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
