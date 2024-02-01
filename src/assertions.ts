import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';

import rouge from 'rouge';
import invariant from 'tiny-invariant';
import yaml from 'js-yaml';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { distance as levenshtein } from 'fastest-levenshtein';

import telemetry from './telemetry';
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
} from './matchers';

import type { Assertion, AssertionType, GradingResult, AtomicTestCase, ApiProvider } from './types';
import { validateFunctionCall } from './providers/openaiUtil';
import { OpenAiChatCompletionProvider } from './providers/openai';

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

const DEFAULT_SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

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
  const namedScores: Record<string, number> = {};
  for (const assertion of test.assert) {
    if (assertion.type.startsWith('select-')) {
      // Select-type assertions are handled separately because they depend on multiple outputs.
      continue;
    }
    const weight = assertion.weight || 1;
    totalWeight += weight;

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
    totalScore += result.score * weight;
    componentResults.push(result);

    if (assertion.metric) {
      namedScores[assertion.metric] = (namedScores[assertion.metric] || 0) + result.score;
    }

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
    namedScores: namedScores,
    reason: finalReason,
    tokensUsed,
    componentResults,
    assertion: null,
  };
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
    output = transformOutput(assertion.transform, output, {vars: test.vars});
  }

  const outputString = coerceString(output);

  const context = {
    prompt,
    vars: test.vars || {},
  };

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
          valueFromScript = await Promise.resolve(requiredModule(output, context));
        } else if (requiredModule.default && typeof requiredModule.default === 'function') {
          valueFromScript = await Promise.resolve(requiredModule.default(output, context));
        } else {
          throw new Error(
            `Assertion malformed: ${filePath} must export a function or have a default export as a function`,
          );
        }
      } else if (filePath.endsWith('.py')) {
        const args = [
          filePath,
          typeof output === 'string' ? output : JSON.stringify(output),
          JSON.stringify(context),
        ];
        const pythonScriptOutput = await new Promise<string>((resolve, reject) => {
          execFile(
            process.env.PROMPTFOO_PYTHON || 'python',
            args,
            null,
            (error, stdout, stderr) => {
              if (error) {
                reject(error);
                return;
              }
              const stringErr = String(stderr);
              if (stringErr) {
                reject(new Error(stringErr));
              } else {
                resolve(String(stdout));
              }
            },
          );
        });
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

  if (baseType === 'is-valid-openai-tools-call') {
    const toolsOutput = output as {
      type: 'function';
      function: { arguments: string; name: string };
    }[];
    invariant(Array.isArray(toolsOutput), 'is-valid-tools assertion must evaluate an array');
    invariant(toolsOutput.length > 0, 'is-valid-tools assertion must evaluate a non-empty array');
    invariant(
      typeof toolsOutput[0].function.name === 'string',
      'is-valid-tools assertion must evaluate an array of objects with string name properties',
    );
    invariant(
      typeof toolsOutput[0].function.arguments === 'string',
      'is-valid-tools assertion must evaluate an array of objects with string arguments properties',
    );

    try {
      toolsOutput.forEach((toolOutput) =>
        validateFunctionCall(
          toolOutput.function,
          (provider as OpenAiChatCompletionProvider).config.tools?.map((tool) => tool.function),
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
    invariant(
      typeof functionOutput === 'object' &&
        typeof functionOutput.name === 'string' &&
        typeof functionOutput.arguments === 'string',
      'is-valid-function assertion must evaluate an object with string name and arguments properties',
    );
    try {
      validateFunctionCall(
        functionOutput,
        (provider as OpenAiChatCompletionProvider).config.functions,
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
        const isMultiline = renderedValue.includes('\n');
        let pythonScript = `import json
import sys
data = json.load(sys.stdin)
output = data['output']
context = data['context']
value = data['value']
${isMultiline ? 'exec(value)' : 'print(json.dumps(eval(value)))'}`;
        const pythonProcessInput = JSON.stringify({ output, context, value: renderedValue });
        const child = spawn(process.env.PROMPTFOO_PYTHON || 'python', ['-u', '-c', pythonScript]);
        child.stdin.write(pythonProcessInput);
        child.stdin.end();
        let childStdout = '';
        let childStderr = '';
        await new Promise<void>((resolve, reject) => {
          // Collect output and wait for process to exit
          child.stdout.on('data', (data) => {
            childStdout += data;
          });

          // Listen for errors on the child process
          child.on('error', (error) => {
            reject(error);
          });

          child.stderr.on('data', (data) => {
            childStderr += data;
          });

          // Listen for the process to close, which may happen after 'end'
          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Child process exited with code ${code}`));
            } else {
              resolve();
            }
          });
        });
        if (childStderr) {
          throw new Error(childStderr);
        }
        result = childStdout.trim();
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

    return {
      assertion,
      ...(await matchesAnswerRelevance(prompt, output, assertion.threshold || 0, test.options)),
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
    /^(not-)?(equals|contains-any|contains-all|icontains-any|icontains-all|contains-json|is-json|regex|icontains|contains|webhook|rouge-n|similar|starts-with|levenshtein|classifier|model-graded-factuality|factuality|model-graded-closedqa|answer-relevance|context-recall|context-relevance|context-faithfulness|is-valid-openai-function-call|is-valid-openai-tools-call|latency|perplexity|perplexity-score|cost)(?:\((\d+(?:\.\d+)?)\))?(?::(.*))?$/;
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
      type === 'classifier' ||
      type === 'answer-relevance' ||
      type === 'context-recall' ||
      type === 'context-relevance' ||
      type === 'context-faithfulness' ||
      type === 'latency' ||
      type === 'perplexity' ||
      type === 'perplexity-score' ||
      type === 'cost'
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

export async function runCompareAssertion(
  test: AtomicTestCase,
  assertion: Assertion,
  outputs: string[],
): Promise<GradingResult[]> {
  invariant(typeof assertion.value === 'string', 'select-best must have a string value');
  const comparisonResults = await matchesSelectBest(assertion.value, outputs, undefined, test.vars);
  return comparisonResults.map(result => ({
    ...result,
    assertion
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
};
