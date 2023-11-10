import fs from 'fs';
import path from 'path';

import rouge from 'rouge';
import invariant from 'tiny-invariant';
import yaml from 'js-yaml';
import Ajv, { ValidateFunction } from 'ajv';
import { distance as levenshtein } from 'fastest-levenshtein';

import telemetry from './telemetry';
import { fetchWithRetries } from './fetch';
import { getNunjucksEngine } from './util';
import {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesClassification,
} from './matchers';

import type { Assertion, AssertionType, GradingResult, AtomicTestCase } from './types';

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

const ajv = new Ajv();
const nunjucks = getNunjucksEngine();

function coerceString(value: string | object): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

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
  output: string | object,
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
  output: string | object,
): Promise<GradingResult> {
  let pass: boolean = false;
  let score: number = 0.0;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse ? assertion.type.slice(4) : assertion.type;

  telemetry.record('assertion_used', {
    type: baseType,
  });

  const outputString = coerceString(output);

  // Render assertion values
  let renderedValue = assertion.value;
  let valueFromScript: string | boolean | number | GradingResult | object | undefined;
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      // Load the file
      const filePath = renderedValue.slice('file://'.length);
      if (filePath.endsWith('.js') || filePath.endsWith('.cjs')) {
        const requiredModule = require(path.resolve(filePath));
        if (typeof requiredModule === 'function') {
          valueFromScript = await Promise.resolve(
            requiredModule(output, { vars: test.vars || {} }),
          );
        } else if (requiredModule.default && typeof requiredModule.default === 'function') {
          valueFromScript = await Promise.resolve(
            requiredModule.default(output, { vars: test.vars || {} }),
          );
        } else {
          throw new Error(
            `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
          );
        }
      } else if (filePath.endsWith('.py')) {
        const { execSync } = require('child_process');
        const escapedOutput = outputString.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const escapedContext = JSON.stringify({ vars: test.vars || {} })
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        const pythonScriptOutput = execSync(
          `${
            process.env.PROMPTFOO_PYTHON || 'python'
          } ${filePath} "${escapedOutput}" "${escapedContext}"`,
        ).toString();
        valueFromScript = pythonScriptOutput.trim();
      } else if (filePath.endsWith('.json')) {
        valueFromScript = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        valueFromScript = yaml.load(fs.readFileSync(filePath, 'utf8')) as object;
      } else {
        throw new Error(`Assertion malformed: ${filePath} must end in .js or .py`);
      }
    } else {
      // It's a normal string value
      renderedValue = nunjucks.renderString(renderedValue, test.vars || {});
    }
  } else if (renderedValue && Array.isArray(renderedValue)) {
    // Unpack the array
    renderedValue = renderedValue.map((v) => nunjucks.renderString(String(v), test.vars || {}));
  }

  if (baseType === 'equals') {
    pass = renderedValue == outputString;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output "${renderedValue}" but got "${outputString}"`,
      assertion,
    };
  }

  if (baseType === 'is-json') {
    let parsedJson;
    try {
      parsedJson = JSON.parse(outputString);
      pass = !inverse;
    } catch (err) {
      pass = inverse;
    }

    if (pass && renderedValue) {
      let validate: ValidateFunction;
      if (typeof renderedValue === 'string' && renderedValue.startsWith('file://')) {
        // Reference the JSON schema from external file
        const schema = valueFromScript;
        invariant(schema, 'is-json references a file that does not export a JSON schema');
        validate = ajv.compile(schema as object);
      } else if (typeof renderedValue === 'object') {
        // Value is JSON schema
        validate = ajv.compile(renderedValue);
      } else {
        throw new Error('is-json assertion must have a string or object value');
      }
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
    pass = outputString.includes(String(renderedValue)) !== inverse;
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
    pass = renderedValue.some((value) => outputString.includes(String(value))) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain one of "${renderedValue.join(', ')}"`,
      assertion,
    };
  }

  if (baseType === 'icontains-any') {
    invariant(renderedValue, '"icontains-any" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"icontains-any" assertion type must have an array value',
    );
    pass =
      renderedValue.some((value) =>
        outputString.toLowerCase().includes(String(value).toLowerCase()),
      ) !== inverse;
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
    pass = renderedValue.every((value) => outputString.includes(String(value))) !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}contain all of "${renderedValue.join(', ')}"`,
      assertion,
    };
  }

  if (baseType === 'icontains-all') {
    invariant(renderedValue, '"icontains-all" assertion type must have a value');
    invariant(
      Array.isArray(renderedValue),
      '"icontains-all" assertion type must have an array value',
    );
    pass =
      renderedValue.every((value) =>
        outputString.toLowerCase().includes(String(value).toLowerCase()),
      ) !== inverse;
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
    pass = regex.test(outputString) !== inverse;
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
    pass = outputString.toLowerCase().includes(String(renderedValue).toLowerCase()) !== inverse;
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
    pass = outputString.startsWith(String(renderedValue)) !== inverse;
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
    let errorMessage = 'Expected output to contain valid JSON';
    let jsonOutputs = containsJSON(outputString);
    for (const jsonMatch of jsonOutputs) {
      pass = jsonMatch !== inverse;
      if (pass && renderedValue) {
        let validate: ValidateFunction;
        if (typeof renderedValue === 'string' && renderedValue.startsWith('file://')) {
          // Reference the JSON schema from external file
          const schema = valueFromScript;
          invariant(schema, 'is-json references a file that does not export a JSON schema');
          validate = ajv.compile(schema as object);
        } else if (typeof renderedValue === 'object') {
          // Value is JSON schema
          validate = ajv.compile(renderedValue);
        } else {
          throw new Error('is-json assertion must have a string or object value');
        }
        pass = validate(jsonMatch);
        if (pass) {
          break;
        } else {
          errorMessage = `JSON does not conform to the provided schema. Errors: ${ajv.errorsText(
            validate.errors,
          )}`;
        }
      }
    }
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : errorMessage,
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
        const ret = assertion.value(outputString, test, assertion);
        if (ret && !ret.assertion) {
          // Populate the assertion object if the custom function didn't return it.
          const functionString = assertion.value.toString();
          ret.assertion = {
            type: 'javascript',
            value:
              functionString.length > 50 ? functionString.slice(0, 50) + '...' : functionString,
          };
        }
        return ret;
      }
      invariant(typeof renderedValue === 'string', 'javascript assertion must have a string value');
      let result: boolean | number | GradingResult;
      if (typeof valueFromScript !== 'undefined') {
        invariant(
          typeof valueFromScript === 'boolean' ||
            typeof valueFromScript === 'number' ||
            typeof valueFromScript === 'object',
          `Javascript assertion script must return a boolean, number, or object (${assertion.value})`,
        );
        result = valueFromScript as boolean | number | GradingResult;
      } else {
        const functionBody = renderedValue.includes('\n')
          ? renderedValue
          : `return ${renderedValue}`;
        const customFunction = new Function('output', 'context', functionBody);
        result = customFunction(output, context) as boolean | number | GradingResult;
      }
      if (typeof result === 'boolean') {
        pass = result !== inverse;
        score = pass ? 1 : 0;
      } else if (typeof result === 'number') {
        pass = assertion.threshold ? result >= assertion.threshold : result > 0;
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
      let result: string;
      if (typeof valueFromScript !== 'undefined') {
        invariant(
          typeof valueFromScript === 'string',
          `Python assertion script must return a string (${assertion.value})`,
        );
        result = valueFromScript;
      } else {
        const { execSync } = require('child_process');
        const isMultiline = renderedValue.includes('\n');
        let pythonScript = `import json
  import sys
  data = json.load(sys.stdin)
  output = data['output']
  context = data['context']
  value = data['value']
  ${isMultiline ? 'exec(value)' : 'print(json.dumps(eval(value)))'}`;
        const pythonProcessInput = JSON.stringify({ output, context, value: renderedValue });
        result = execSync(
          `{process.env.PROMPTFOO_PYTHON || 'python'} -c "${pythonScript.replace(/\n/g, ';')}"`,
          {
            input: pythonProcessInput,
          },
        )
          .toString()
          .trim() as string;
      }

      if (result.toLowerCase() === 'true') {
        pass = true;
        score = 1.0;
      } else if (result.toLowerCase() === 'false') {
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
        score = parseFloat(result);
        pass = assertion.threshold ? score >= assertion.threshold : score > 0;
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
    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    return {
      assertion,
      ...(await matchesSimilarity(
        renderedValue,
        outputString,
        assertion.threshold || 0.75,
        inverse,
        test.options,
      )),
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

    // Update the assertion value. This allows the web view to display the prompt.
    assertion.value = assertion.value || test.options.rubricPrompt;
    return {
      assertion,
      ...(await matchesLlmRubric(renderedValue || '', outputString, test.options, test.vars)),
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
      ...(await matchesFactuality(prompt, renderedValue, outputString, test.options, test.vars)),
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
      ...(await matchesClosedQa(prompt, renderedValue, outputString, test.options, test.vars)),
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

      const reason =
        jsonResponse.reason ||
        (pass ? 'Assertion passed' : `Webhook returned ${inverse ? 'true' : 'false'}`);

      return {
        pass,
        score,
        reason,
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `Webhook error: ${(err as Error).message}`,
        assertion,
      };
    }
  }

  if (baseType === 'rouge-n') {
    invariant(
      typeof renderedValue === 'string' || Array.isArray(renderedValue),
      '"rouge" assertion type must be a value (string or string array)',
    );
    return handleRougeScore(baseType, assertion, renderedValue, outputString, inverse);
  }

  if (baseType === 'levenshtein') {
    invariant(
      typeof renderedValue === 'string',
      '"levenshtein" assertion type must have a string value',
    );
    const levDistance = levenshtein(outputString, renderedValue);
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

  if (baseType === 'classifier') {
    invariant(
      typeof renderedValue === 'string',
      '"classifier" assertion type must have a string value',
    );

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    return {
      assertion,
      ...(await matchesClassification(
        renderedValue,
        outputString,
        assertion.threshold ?? 1,
        test.options,
      )),
    };
  }

  throw new Error('Unknown assertion type: ' + assertion.type);
}

function containsJSON(str: string): any {
  // This will extract all json objects from a string

  let jsonObjects = [];
  let openBracket = str.indexOf('{');
  let closeBracket = str.indexOf('}', openBracket);
  // Iterate over the string until we find a valid JSON-like pattern
  // Iterate over all trailing } until the contents parse as json
  while (openBracket !== -1) {
    const jsonStr = str.slice(openBracket, closeBracket + 1);
    try {
      jsonObjects.push(JSON.parse(jsonStr));
      // This is a valid JSON object, so start looking for
      // an opening bracket after the last closing bracket
      openBracket = str.indexOf('{', closeBracket + 1);
      closeBracket = str.indexOf('}', openBracket);
    } catch (err) {
      // Not a valid object, move on to the next closing bracket
      closeBracket = str.indexOf('}', closeBracket + 1);
      while (closeBracket === -1) {
        // No closing brackets made a valid json object, so
        // start looking with the next opening bracket
        openBracket = str.indexOf('{', openBracket + 1);
        closeBracket = str.indexOf('}', openBracket);
      }
    }
  }
  return jsonObjects;
}

export function assertionFromString(expected: string): Assertion {
  // Legacy options
  if (
    expected.startsWith('javascript:') ||
    expected.startsWith('fn:') ||
    expected.startsWith('eval:')
  ) {
    // TODO(1.0): delete eval: legacy option
    let sliceLength;
    if (expected.startsWith('javascript:')) {
      sliceLength = 'javascript:'.length;
    }
    if (expected.startsWith('fn:')) {
      sliceLength = 'fn:'.length;
    }
    if (expected.startsWith('eval:')) {
      sliceLength = 'eval:'.length;
    }

    const functionBody = expected.slice(sliceLength);
    return {
      type: 'javascript',
      value: functionBody,
    };
  }
  if (expected.startsWith('grade:') || expected.startsWith('llm-rubric:')) {
    return {
      type: 'llm-rubric',
      value: expected.slice(6),
    };
  }
  if (expected.startsWith('python:')) {
    const sliceLength = 'python:'.length;
    const functionBody = expected.slice(sliceLength);
    return {
      type: 'python',
      value: functionBody,
    };
  }

  // New options
  const assertionRegex =
    /^(not-)?(equals|contains-any|contains-all|icontains-any|icontains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar|starts-with|levenshtein|classifier|model-graded-factuality|model-graded-closedqa)(?:\((\d+(?:\.\d+)?)\))?(?::(.*))?$/;
  const regexMatch = expected.match(assertionRegex);

  if (regexMatch) {
    const [_, notPrefix, type, thresholdStr, value] = regexMatch;
    const fullType = notPrefix ? `not-${type}` : type;
    const threshold = parseFloat(thresholdStr);

    if (
      type === 'contains-any' ||
      type === 'contains-all' ||
      type === 'icontains-any' ||
      type === 'icontains-all'
    ) {
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
      type === 'levenshtein' ||
      type === 'classifier'
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
  matchesClassification,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
};
