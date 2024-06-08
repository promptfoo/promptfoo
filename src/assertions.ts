import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import util from 'node:util';

import async from 'async';
import rouge from 'rouge';
import invariant from 'tiny-invariant';
import yaml from 'js-yaml';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { distance as levenshtein } from 'fastest-levenshtein';

import cliState from './cliState';
import telemetry from './telemetry';
import logger from './logger';
import { fetchWithRetries } from './fetch';
import { transformOutput, getNunjucksEngine } from './util';
import {
  matchesSimilarity,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesClassification,
  matchesAnswerRelevance,
  matchesContextRecall,
  matchesContextRelevance,
  matchesContextFaithfulness,
  matchesSelectBest,
  matchesModeration,
} from './matchers';
import { validateFunctionCall } from './providers/openaiUtil';
import { OpenAiChatCompletionProvider } from './providers/openai';
import { runPython, runPythonCode } from './python/wrapper';
import { importModule } from './esm';

import {
  type Assertion,
  type AssertionType,
  type GradingResult,
  type AtomicTestCase,
  type ApiProvider,
  isGradingResult,
} from './types';
import { AssertionsResult } from './assertions/AssertionsResult';

const ASSERTIONS_MAX_CONCURRENCY = process.env.PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY
  ? parseInt(process.env.PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY, 10)
  : 3;

export const MODEL_GRADED_ASSERTION_TYPES = new Set<AssertionType>([
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'llm-rubric',
  'model-graded-closedqa',
  'factuality',
  'model-graded-factuality',
]);

const ajv = new Ajv();
addFormats(ajv);

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
  expected: string,
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
      ? `${baseType.toUpperCase()} score ${score.toFixed(
          2,
        )} is greater than or equal to threshold ${assertion.threshold || 0.75}`
      : `${baseType.toUpperCase()} score ${score.toFixed(2)} is less than threshold ${
          assertion.threshold || 0.75
        }`,
    assertion,
  };
}

export async function runAssertions({
  prompt,
  provider,
  test,
  output,
  latencyMs,
  logProbs,
  cost,
}: {
  prompt?: string;
  provider?: ApiProvider;
  test: AtomicTestCase;
  output: string | object;
  latencyMs?: number;
  logProbs?: number[];
  cost?: number;
}): Promise<GradingResult> {
  if (!test.assert || test.assert.length < 1) {
    return AssertionsResult.noAssertsResult();
  }

  const mainAssertResult = new AssertionsResult({
    threshold: test.threshold,
  });
  const subAssertResults: AssertionsResult[] = [];
  const asserts: {
    assertion: Assertion;
    assertResult: AssertionsResult;
    index: number;
  }[] = test.assert
    .map((assertion, i) => {
      if (assertion.type === 'assert-set') {
        const subAssertResult = new AssertionsResult({
          threshold: assertion.threshold,
          parentAssertionSet: {
            assertionSet: assertion,
            index: i,
          },
        });

        subAssertResults.push(subAssertResult);

        return assertion.assert.map((subAssert, j) => {
          return {
            assertion: subAssert,
            assertResult: subAssertResult,
            index: j,
          };
        });
      }

      return { assertion, assertResult: mainAssertResult, index: i };
    })
    .flat();

  await async.forEachOfLimit(
    asserts,
    ASSERTIONS_MAX_CONCURRENCY,
    async ({ assertion, assertResult, index }) => {
      if (assertion.type.startsWith('select-')) {
        // Select-type assertions are handled separately because they depend on multiple outputs.
        return;
      }

      const result = await runAssertion({
        prompt,
        provider,
        assertion,
        test,
        output,
        latencyMs,
        logProbs,
        cost,
      });

      assertResult.addResult({
        index,
        result,
        metric: assertion.metric,
        weight: assertion.weight,
      });
    },
  );

  subAssertResults.forEach((subAssertResult) => {
    const result = subAssertResult.testResult();
    const {
      index,
      assertionSet: { metric, weight },
    } = subAssertResult.parentAssertionSet!;

    mainAssertResult.addResult({
      index,
      result,
      metric,
      weight,
    });
  });

  return mainAssertResult.testResult();
}

export async function runAssertion({
  prompt,
  provider,
  assertion,
  test,
  output,
  latencyMs,
  logProbs,
  cost,
}: {
  prompt?: string;
  provider?: ApiProvider;
  assertion: Assertion;
  test: AtomicTestCase;
  output: string | object;
  latencyMs?: number;
  logProbs?: number[];
  cost?: number;
}): Promise<GradingResult> {
  let pass: boolean = false;
  let score: number = 0.0;

  invariant(assertion.type, `Assertion must have a type: ${JSON.stringify(assertion)}`);

  const inverse = assertion.type.startsWith('not-');
  const baseType = inverse ? assertion.type.slice(4) : assertion.type;

  telemetry.record('assertion_used', {
    type: baseType,
  });

  if (assertion.transform) {
    output = await transformOutput(assertion.transform, output, {
      vars: test.vars,
      prompt: { label: prompt },
    });
  }

  const outputString = coerceString(output);

  const context = {
    prompt,
    vars: test.vars || {},
    test,
    logProbs,
  };

  // Render assertion values
  let renderedValue = assertion.value;
  let valueFromScript: string | boolean | number | GradingResult | object | undefined;
  if (typeof renderedValue === 'string') {
    if (renderedValue.startsWith('file://')) {
      const basePath = cliState.basePath || '';
      const filePath = path.resolve(basePath, renderedValue.slice('file://'.length));

      if (filePath.endsWith('.js') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs')) {
        const requiredModule = await importModule(filePath);
        if (typeof requiredModule === 'function') {
          valueFromScript = await Promise.resolve(requiredModule(output, context));
        } else if (requiredModule.default && typeof requiredModule.default === 'function') {
          valueFromScript = await Promise.resolve(requiredModule.default(output, context));
        } else {
          throw new Error(
            `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
          );
        }
        logger.debug(`Javascript script ${filePath} output: ${valueFromScript}`);
      } else if (filePath.endsWith('.py')) {
        try {
          const pythonScriptOutput = await runPython(filePath, 'get_assert', [output, context]);
          valueFromScript = pythonScriptOutput;
          logger.debug(`Python script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            pass: false,
            score: 0,
            reason: (error as Error).message,
            assertion,
          };
        }
      } else if (filePath.endsWith('.json')) {
        renderedValue = JSON.parse(fs.readFileSync(path.resolve(basePath, filePath), 'utf8'));
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        renderedValue = yaml.load(
          fs.readFileSync(path.resolve(basePath, filePath), 'utf8'),
        ) as object;
      } else if (filePath.endsWith('.txt')) {
        // Trim to remove trailing newline
        renderedValue = fs.readFileSync(path.resolve(basePath, filePath), 'utf8').trim();
      } else {
        throw new Error(`Unsupported file type: ${filePath}`);
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
    if (typeof renderedValue === 'object') {
      pass = util.isDeepStrictEqual(renderedValue, JSON.parse(outputString)) !== inverse;
      renderedValue = JSON.stringify(renderedValue);
    } else {
      pass = (renderedValue == outputString) !== inverse;
    }

    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Expected output "${renderedValue}" to ${inverse ? 'not ' : ''}equal "${outputString}"`,
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
      if (typeof renderedValue === 'string') {
        if (renderedValue.startsWith('file://')) {
          // Reference the JSON schema from external file
          const schema = valueFromScript;
          invariant(schema, 'is-json references a file that does not export a JSON schema');
          validate = ajv.compile(schema as object);
        } else {
          const scheme = yaml.load(renderedValue) as object;
          validate = ajv.compile(scheme);
        }
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
    if (typeof renderedValue === 'string') {
      renderedValue = renderedValue.split(',').map((v) => v.trim());
    }
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
    if (typeof renderedValue === 'string') {
      renderedValue = renderedValue.split(',').map((v) => v.trim());
    }
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
    if (typeof renderedValue === 'string') {
      renderedValue = renderedValue.split(',').map((v) => v.trim());
    }
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
    if (typeof renderedValue === 'string') {
      renderedValue = renderedValue.split(',').map((v) => v.trim());
    }
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
        if (typeof renderedValue === 'string') {
          if (renderedValue.startsWith('file://')) {
            // Reference the JSON schema from external file
            const schema = valueFromScript;
            invariant(schema, 'contains-json references a file that does not export a JSON schema');
            validate = ajv.compile(schema as object);
          } else {
            const scheme = yaml.load(renderedValue) as object;
            validate = ajv.compile(scheme);
          }
        } else if (typeof renderedValue === 'object') {
          // Value is JSON schema
          validate = ajv.compile(renderedValue);
        } else {
          throw new Error('contains-json assertion must have a string or object value');
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

  if (baseType === 'is-valid-openai-tools-call') {
    const toolsOutput = output as {
      type: 'function';
      function: { arguments: string; name: string };
    }[];
    if (
      !Array.isArray(toolsOutput) ||
      toolsOutput.length === 0 ||
      typeof toolsOutput[0].function.name !== 'string' ||
      typeof toolsOutput[0].function.arguments !== 'string'
    ) {
      return {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking tools response: ${JSON.stringify(
          toolsOutput,
        )}`,
        assertion,
      };
    }

    try {
      toolsOutput.forEach((toolOutput) =>
        validateFunctionCall(
          toolOutput.function,
          (provider as OpenAiChatCompletionProvider).config.tools?.map((tool) => tool.function),
          test.vars,
        ),
      );
      return {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: (err as Error).message,
        assertion,
      };
    }
  }

  if (baseType === 'is-valid-openai-function-call') {
    const functionOutput = output as { arguments: string; name: string };
    if (
      typeof functionOutput !== 'object' ||
      typeof functionOutput.name !== 'string' ||
      typeof functionOutput.arguments !== 'string'
    ) {
      return {
        pass: false,
        score: 0,
        reason: `OpenAI did not return a valid-looking function call: ${JSON.stringify(
          functionOutput,
        )}`,
        assertion,
      };
    }
    try {
      validateFunctionCall(
        functionOutput,
        (provider as OpenAiChatCompletionProvider).config.functions,
        test.vars,
      );
      return {
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: (err as Error).message,
        assertion,
      };
    }
  }

  if (baseType === 'javascript') {
    try {
      const validateResult = async (result: any): Promise<boolean | number | GradingResult> => {
        result = await Promise.resolve(result);
        if (typeof result === 'boolean' || typeof result === 'number' || isGradingResult(result)) {
          return result;
        } else {
          throw new Error(
            `Custom function must return a boolean, number, or GradingResult object. Got type ${typeof result}: ${JSON.stringify(
              result,
            )}`,
          );
        }
      };

      if (typeof assertion.value === 'function') {
        let ret = assertion.value(outputString, context);
        ret = await validateResult(ret);
        if (!ret.assertion) {
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
        result = await validateResult(valueFromScript);
      } else {
        const functionBody = renderedValue.includes('\n')
          ? renderedValue
          : `return ${renderedValue}`;
        const customFunction = new Function('output', 'context', functionBody);
        result = await validateResult(customFunction(output, context));
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
Stack Trace: ${(err as Error).stack}
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
      let result: string | number | boolean | object | GradingResult | undefined;
      if (typeof valueFromScript !== 'undefined') {
        result = valueFromScript;
      } else {
        const isMultiline = renderedValue.includes('\n');
        let indentStyle = '    ';
        if (isMultiline) {
          // Detect the indentation style of the first indented line
          const match = renderedValue.match(/^(?!\s*$)\s+/m);
          if (match) {
            indentStyle = match[0];
          }
        }

        const pythonScript = `import json

def main(output, context):
${
  isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `    return ${renderedValue}`
}
`;
        result = await runPythonCode(pythonScript, 'main', [output, context]);
      }

      if (
        (typeof result === 'boolean' && result) ||
        (typeof result === 'string' && result.toLowerCase() === 'true')
      ) {
        pass = true;
        score = 1.0;
      } else if (
        (typeof result === 'boolean' && !result) ||
        (typeof result === 'string' && result.toLowerCase() === 'false')
      ) {
        pass = false;
        score = 0.0;
      } else if (typeof result === 'string' && result.startsWith('{')) {
        let parsed;
        try {
          parsed = JSON.parse(result);
        } catch (err) {
          throw new Error(`Invalid JSON: ${err} when parsing result: ${result}`);
        }
        if (!isGradingResult(parsed)) {
          throw new Error(
            `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: ${result}`,
          );
        }
        return parsed;
      } else if (typeof result === 'object') {
        if (!isGradingResult(result)) {
          throw new Error(
            `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead:\n${JSON.stringify(
              result,
              null,
              2,
            )}`,
          );
        }
        const pythonGradingResult = result as Omit<GradingResult, 'assertion'>;
        if (assertion.threshold && pythonGradingResult.score < assertion.threshold) {
          pythonGradingResult.pass = false;
          pythonGradingResult.reason = `Python score ${pythonGradingResult.score} is less than threshold ${assertion.threshold}`;
        }
        return {
          ...pythonGradingResult,
          assertion,
        };
      } else {
        score = parseFloat(String(result));
        pass = assertion.threshold ? score >= assertion.threshold : score > 0;
        if (isNaN(score)) {
          throw new Error(
            `Python assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
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
        : `Python code returned ${pass ? 'true' : 'false'}\n${assertion.value}`,
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

  if (baseType === 'model-graded-factuality' || baseType === 'factuality') {
    invariant(
      typeof renderedValue === 'string',
      'factuality assertion type must have a string value',
    );
    invariant(prompt, 'factuality assertion type must have a prompt');

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;

    if (test.options.rubricPrompt) {
      // Substitute vars in prompt
      invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
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
    invariant(prompt, 'model-graded-closedqa assertion type must have a prompt');

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;

    if (test.options.rubricPrompt) {
      // Substitute vars in prompt
      invariant(typeof test.options.rubricPrompt === 'string', 'rubricPrompt must be a string');
      test.options.rubricPrompt = nunjucks.renderString(test.options.rubricPrompt, test.vars || {});
    }

    return {
      assertion,
      ...(await matchesClosedQa(prompt, renderedValue, outputString, test.options, test.vars)),
    };
  }

  if (baseType === 'answer-relevance') {
    invariant(
      typeof output === 'string',
      'answer-relevance assertion type must evaluate a string output',
    );
    invariant(prompt, 'answer-relevance assertion type must have a prompt');

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    let input = typeof test.vars?.query === 'string' ? test.vars.query : prompt;
    return {
      assertion,
      ...(await matchesAnswerRelevance(input, output, assertion.threshold || 0, test.options)),
    };
  }

  if (baseType === 'context-recall') {
    invariant(
      typeof renderedValue === 'string',
      'context-recall assertion type must have a string value',
    );
    invariant(prompt, 'context-recall assertion type must have a prompt');

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;

    return {
      assertion,
      ...(await matchesContextRecall(
        typeof test.vars?.context === 'string' ? test.vars.context : prompt,
        renderedValue,
        assertion.threshold || 0,
        test.options,
        test.vars,
      )),
    };
  }

  if (baseType === 'context-relevance') {
    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;

    invariant(test.vars, 'context-relevance assertion type must have a vars object');
    invariant(
      typeof test.vars.query === 'string',
      'context-relevance assertion type must have a question var',
    );
    invariant(
      typeof test.vars.context === 'string',
      'context-relevance assertion type must have a context var',
    );

    return {
      assertion,
      ...(await matchesContextRelevance(
        test.vars.query,
        test.vars.context,
        assertion.threshold || 0,
        test.options,
      )),
    };
  }

  if (baseType === 'context-faithfulness') {
    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;

    invariant(test.vars, 'context-faithfulness assertion type must have a vars object');
    invariant(
      typeof test.vars.query === 'string',
      'context-faithfulness assertion type must have a question var',
    );
    invariant(
      typeof test.vars.context === 'string',
      'context-faithfulness assertion type must have a context var',
    );
    invariant(
      typeof output === 'string',
      'context-faithfulness assertion type must have a string output',
    );

    return {
      assertion,
      ...(await matchesContextFaithfulness(
        test.vars.query,
        output,
        test.vars.context,
        assertion.threshold || 0,
        test.options,
      )),
    };
  }

  if (baseType === 'moderation') {
    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;

    invariant(prompt, 'moderation assertion type must have a prompt');
    invariant(typeof output === 'string', 'moderation assertion type must have a string output');
    invariant(
      !assertion.value ||
        (Array.isArray(assertion.value) && typeof assertion.value[0] === 'string'),
      'moderation assertion value must be a string array if set',
    );
    const moderationResult = await matchesModeration(
      {
        userPrompt: prompt,
        assistantResponse: output,
        categories: Array.isArray(assertion.value) ? assertion.value : [],
      },
      test.options,
    );

    pass = moderationResult.pass;
    return {
      pass,
      score: moderationResult.score,
      reason: moderationResult.reason,
      assertion,
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
    invariant(typeof renderedValue === 'string', '"rouge" assertion type must be a string value');
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
      typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
      '"classifier" assertion type must have a string value or be undefined',
    );

    // Assertion provider overrides test provider
    test.options = test.options || {};
    test.options.provider = assertion.provider || test.options.provider;
    const classificationResult = await matchesClassification(
      renderedValue,
      outputString,
      assertion.threshold ?? 1,
      test.options,
    );

    if (inverse) {
      classificationResult.pass = !classificationResult.pass;
      classificationResult.score = 1 - classificationResult.score;
    }

    return {
      assertion,
      ...classificationResult,
    };
  }

  if (baseType === 'latency') {
    if (!assertion.threshold) {
      throw new Error('Latency assertion must have a threshold in milliseconds');
    }
    if (!latencyMs) {
      throw new Error(
        'Latency assertion does not support cached results. Rerun the eval with --no-cache',
      );
    }
    pass = latencyMs <= assertion.threshold;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Latency ${latencyMs}ms is greater than threshold ${assertion.threshold}ms`,
      assertion,
    };
  }

  if (baseType === 'perplexity') {
    if (!logProbs || logProbs.length === 0) {
      throw new Error(
        'Perplexity assertion does not support providers that do not return logProbs',
      );
    }
    const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
    const avgLogProb = sumLogProbs / logProbs.length;
    const perplexity = Math.exp(-avgLogProb);

    pass = assertion.threshold ? perplexity <= assertion.threshold : true;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Perplexity ${perplexity.toFixed(2)} is greater than threshold ${assertion.threshold}`,
      assertion,
    };
  }

  if (baseType === 'perplexity-score') {
    if (!logProbs || logProbs.length === 0) {
      throw new Error(
        'perplexity-score assertion does not support providers that do not return logProbs',
      );
    }
    const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
    const avgLogProb = sumLogProbs / logProbs.length;
    const perplexity = Math.exp(-avgLogProb);
    const perplexityNorm = 1 / (1 + perplexity);

    pass = assertion.threshold ? perplexityNorm >= assertion.threshold : true;
    return {
      pass,
      score: perplexityNorm,
      reason: pass
        ? 'Assertion passed'
        : `Perplexity score ${perplexityNorm.toFixed(2)} is less than threshold ${
            assertion.threshold
          }`,
      assertion,
    };
  }

  if (baseType === 'cost') {
    if (!assertion.threshold) {
      throw new Error('Cost assertion must have a threshold');
    }
    if (typeof cost === 'undefined') {
      throw new Error('Cost assertion does not support providers that do not return cost');
    }

    pass = cost <= assertion.threshold;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Assertion passed'
        : `Cost ${cost.toPrecision(2)} is greater than threshold ${assertion.threshold}`,
      assertion,
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

export async function runCompareAssertion(
  test: AtomicTestCase,
  assertion: Assertion,
  outputs: string[],
): Promise<GradingResult[]> {
  invariant(typeof assertion.value === 'string', 'select-best must have a string value');
  test.options = test.options || {};
  test.options.provider = assertion.provider || test.options.provider;
  test.options.rubricPrompt = assertion.rubricPrompt || test.options.rubricPrompt;
  const comparisonResults = await matchesSelectBest(
    assertion.value,
    outputs,
    test.options,
    test.vars,
  );
  return comparisonResults.map((result) => ({
    ...result,
    assertion,
  }));
}

export async function readAssertions(filePath: string): Promise<Assertion[]> {
  try {
    const assertions = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Assertion[];
    if (!Array.isArray(assertions) || assertions[0]?.type === undefined) {
      throw new Error('Assertions file must be an array of assertion objects');
    }
    return assertions;
  } catch (err) {
    throw new Error(`Failed to read assertions from ${filePath}:\n${err}`);
  }
}

// These exports are used by the node.js package (index.ts)
export default {
  matchesSimilarity,
  matchesClassification,
  matchesLlmRubric,
  matchesFactuality,
  matchesClosedQa,
  matchesAnswerRelevance,
  matchesContextRecall,
  matchesContextRelevance,
  matchesContextFaithfulness,
  matchesComparisonBoolean: matchesSelectBest,
  matchesModeration,
};
