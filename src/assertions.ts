import os from 'os';

import rouge from 'rouge';
import invariant from 'tiny-invariant';
import Ajv from 'ajv';
import { distance as levenshtein } from 'fastest-levenshtein';

import telemetry from './telemetry';
import { fetchWithRetries } from './fetch';
import { getNunjucksEngine } from './util';
import {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
} from './matchers';

import type { Assertion, AssertionType, GradingResult, AtomicTestCase } from './types';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

const ajv = new Ajv();
const nunjucks = getNunjucksEngine();

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
    assertion,
  };
}

export async function runAssertions(
  prompt: string,
  test: AtomicTestCase,
  output: string,
): Promise<GradingResult> {
  const tokensUsed = {
    total: 0,
    prompt: 0,
    completion: 0,
  };

  if (!test.assert || test.assert.length < 1) {
    return { pass: true, score: 1, reason: 'No assertions', tokensUsed, assertion: null };
  }

  let totalScore = 0;
  let totalWeight = 0;
  let allPass = true;
  let failedReason = '';
  const componentResults: GradingResult[] = [];

  for (const assertion of test.assert) {
    const weight = assertion.weight || 1;
    totalWeight += weight;

    const result = await runAssertion(prompt, assertion, test, output);
    totalScore += result.score * weight;
    componentResults.push(result);

    if (result.tokensUsed) {
      tokensUsed.total += result.tokensUsed.total;
      tokensUsed.prompt += result.tokensUsed.prompt;
      tokensUsed.completion += result.tokensUsed.completion;
    }

    if (!result.pass) {
      allPass = false;
      failedReason = result.reason;
      if (process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES) {
        return result;
      }
    }
  }

  const finalScore = totalScore / totalWeight;
  let finalReason = allPass ? 'All assertions passed' : failedReason;
  if (test.threshold) {
    // Existence of a test threshold overrides the pass/fail status of individual assertions
    allPass = finalScore >= test.threshold;
    if (allPass) {
      finalReason = `Aggregate score ${finalScore.toFixed(2)} ≥ ${test.threshold} threshold`;
    } else {
      finalReason = `Aggregate score ${finalScore.toFixed(2)} < ${test.threshold} threshold`;
    }
  }

  return {
    pass: allPass,
    score: finalScore,
    reason: finalReason,
    tokensUsed,
    componentResults,
    assertion: null,
  };
}

export async function runAssertion(
  prompt: string,
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
    renderedValue = renderedValue.map((v) => nunjucks.renderString(String(v), test.vars || {}));
  }

  if (baseType === 'equals') {
    pass = renderedValue === output;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : `Expected output "${renderedValue}"`,
      assertion,
    };
  }

  if (baseType === 'is-json') {
    let parsedJson;
    try {
      parsedJson = JSON.parse(output);
      pass = !inverse;
    } catch (err) {
      pass = inverse;
    }

    if (pass && renderedValue) {
      invariant(typeof renderedValue === 'object', 'is-json assertion must have an object value');
      const validate = ajv.compile(renderedValue);
      pass = validate(parsedJson);
      if (!pass) {
        return {
          pass,
          score: 0,
          reason: `JSON does not conform to the provided schema. Errors: ${ajv.errorsText(
            validate.errors,
          )}`,
          assertion,
        };
      }
    }

    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : 'Expected output to be valid JSON',
      assertion,
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
      assertion,
    };
  }

  if (baseType === 'contains-any') {
    invariant(renderedValue, '"contains-any" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"contains-any" assertion type must have an array value',
    );
    pass = renderedValue.some((value) => output.includes(String(value))) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain one of "${renderedValue.join(', ')}"`,
      assertion,
    };
  }

  if (baseType === 'contains-all') {
    invariant(renderedValue, '"contains-all" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"contains-all" assertion type must have an array value',
    );
    pass = renderedValue.every((value) => output.includes(String(value))) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain all of "${renderedValue.join(', ')}"`,
      assertion,
    };
  }

  if (baseType === 'regex') {
    invariant(renderedValue, '"regex" assertion type must have a string value');
    invariant(typeof renderedValue === 'string', '"regex" assertion type must have a string value');
    const regex = new RegExp(renderedValue);
    pass = regex.test(output) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}match regex "${renderedValue}"`,
      assertion,
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
      assertion,
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
      assertion,
    };
  }

  if (baseType === 'contains-json') {
    const jsonMatch = containsJSON(output);
    pass = jsonMatch !== inverse;

    if (pass && renderedValue) {
      invariant(
        typeof renderedValue === 'object',
        'contains-json assertion must have an object value',
      );
      const validate = ajv.compile(renderedValue);
      pass = validate(jsonMatch);
      if (!pass) {
        return {
          pass,
          score: 0,
          reason: `JSON does not conform to the provided schema. Errors: ${ajv.errorsText(
            validate.errors,
          )}`,
          assertion,
        };
      }
    }

    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : 'Expected output to contain valid JSON',
      assertion,
    };
  }

  const context = {
    prompt,
    vars: test.vars || {},
  };

  if (baseType === 'javascript') {
    try {
      if (typeof assertion.value === 'function') {
        return assertion.value(output, test, assertion);
      }
      invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');
      const functionBody = renderedValue.includes('\n') ? renderedValue : `return ${renderedValue}`;
      const customFunction = new Function('output', 'context', functionBody);
      const result = customFunction(output, context) as any;
      if (typeof result === 'boolean') {
        pass = result !== inverse;
        score = 1.0;
      } else if (typeof result === 'number') {
        if (typeof assertion.threshold !== 'undefined' && result < assertion.threshold) {
          pass = false;
        } else {
          pass = true;
        }
        score = result;
      } else if (typeof result === 'object') {
        return result;
      } else {
        throw new Error('Custom function must return a boolean or number');
      }
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Custom function threw error: ${(err as Error).message}
${renderedValue}`,
        assertion,
      };
    }
    return {
      pass,
      score,
      reason: pass
        ? 'Assertion passed'
        : `Custom function returned ${inverse ? 'true' : 'false'}
${renderedValue}`,
      assertion,
    };
  }

  if (baseType === 'python') {
    invariant(typeof renderedValue === 'string', 'python assertion must have a string value');
    try {
      const { execSync } = require('child_process');
      const isMultiline = renderedValue.includes('\n');
      const escapedRenderedValue = renderedValue.replace(/'/g, "\\\\'");
      let pythonScript = `import json
import sys
data = json.load(sys.stdin)
output = data["output"]
context = data["context"]
value = data["value"]
${isMultiline ? 'exec(value)': 'print(json.dumps(eval(value)))'}`;
      const pythonProcessInput = JSON.stringify({ output, context, value: renderedValue });
      const result = execSync(`python -c '${pythonScript.replace(/\n/g, ";")}'`, {
        input: pythonProcessInput,
      })
        .toString()
        .trim();
      if (result === 'true') {
        pass = true;
        score = 1.0;
      } else if (result === 'false') {
        pass = false;
        score = 0.0;
      } else if (result.startsWith('{')) {
        const parsed = JSON.parse(result);
        if (!parsed.hasOwnProperty('pass') || !parsed.hasOwnProperty('score')) {
          throw new Error(
            'Python assertion must return a boolean, number, or {pass, score, reason} object',
          );
        }
        return parsed;
      } else {
        pass = true;
        score = parseFloat(result);
        if (isNaN(score)) {
          throw new Error(
            'Python assertion must return a boolean, number, or {pass, score, reason} object',
          );
        }
        if (typeof assertion.threshold !== 'undefined' && score < assertion.threshold) {
          pass = false;
        }
      }
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Python code execution failed: ${(err as Error).message}`,
        assertion,
      };
    }
    return {
      pass,
      score,
      reason: pass
        ? 'Assertion passed'
        : `Python code returned ${pass ? 'true' : 'false'}
${assertion.value}`,
      assertion,
    };
  }

  if (baseType === 'similar') {
    invariant(
      typeof renderedValue === 'string',
      'Similarity assertion type must have a string value',
    );
    return {
      assertion,
      ...(await matchesSimilarity(renderedValue, output, assertion.threshold || 0.75, inverse)),
    };
  }

  if (baseType === 'llm-rubric') {
    invariant(
      typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
      '"llm-rubric" assertion type must have a string value',
    );

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;

    if (test.options.rubricPrompt) {
      if (typeof test.options.rubricPrompt === 'object') {
        test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
      }
    }

    return {
      assertion,
      ...(await matchesLlmRubric(renderedValue || '', output, test.options, test.vars)),
    };
  }

  if (baseType === 'model-graded-factuality') {
    invariant(
      typeof renderedValue === 'string',
      'model-graded-factuality assertion type must have a string value',
    );

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;

    if (test.options.rubricPrompt) {
      // Substitute vars in prompt
      test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
    }

    return {
      assertion,
      ...(await matchesFactuality(prompt, renderedValue, output, test.options, test.vars)),
    };
  }

  if (baseType === 'model-graded-closedqa') {
    invariant(
      typeof renderedValue === 'string',
      'model-graded-closedqa assertion type must have a string value',
    );

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;

    if (test.options.rubricPrompt) {
      // Substitute vars in prompt
      test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
    }

    return {
      assertion,
      ...(await matchesClosedQa(prompt, renderedValue, output, test.options, test.vars)),
    };
  }

  if (baseType === 'webhook') {
    invariant(renderedValue, '"webhook" assertion type must have a URL value');
    invariant(typeof renderedValue === 'string', '"webhook" assertion type must have a URL value');

    try {
      const context = {
        prompt,
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
        assertion,
      };
    }

    return {
      pass,
      score,
      reason: pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`,
      assertion,
    };
  }

  if (baseType === 'rouge-n') {
    invariant(
      typeof renderedValue === 'string' || Array.isArray(renderedValue),
      '"rouge" assertion type must be a value (string or string array)',
    );
    return handleRougeScore(baseType, assertion, renderedValue, output, inverse);
  }

  if (baseType === 'levenshtein') {
    invariant(
      typeof renderedValue === 'string',
      '"levenshtein" assertion type must have a string value',
    );
    const levDistance = levenshtein(output, renderedValue);
    pass = levDistance <= (assertion.threshold || 5);
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Levenshtein distance ${levDistance} is greater than threshold ${
            assertion.threshold || 5
          }`,
      assertion,
    };
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
    return JSON.parse(match[0]);
  } catch (error) {
    return false;
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
    /^(not-)?(equals|contains-any|contains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar|starts-with|levenshtein)(?:\((\d+(?:\.\d+)?)\))?(?::(.*))?$/;
  const regexMatch = expected.match(assertionRegex);

  if (regexMatch) {
    const [_, notPrefix, type, thresholdStr, value] = regexMatch;
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
    } else if (
      type === 'rouge-n' ||
      type === 'similar' ||
      type === 'starts-with' ||
      type === 'levenshtein'
    ) {
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

// These exports are used by the node.js package (index.ts)
export default {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
};
