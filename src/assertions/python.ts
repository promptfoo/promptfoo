import { runPythonCode } from '../python/wrapper';
import { type GradingResult, isGradingResult } from '../types/index';
import { mapSnakeCaseToCamelCase } from '../util/caseMapping';
import invariant from '../util/invariant';

import type { AssertionParams } from '../types/index';

type PythonAssertionResult = string | number | boolean | object | GradingResult | undefined;

function appendRenderedValueToReason(reason: string, renderedValue: string): string {
  return renderedValue ? `${reason}\n${renderedValue}` : reason;
}

function normalizePythonAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  const getFailureReason = (rawPass: boolean) => {
    return appendRenderedValueToReason(
      `Python code returned ${rawPass ? 'true' : 'false'}`,
      renderedValue,
    );
  };

  if (typeof result === 'boolean') {
    const pass = result !== inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : getFailureReason(result),
      assertion,
    };
  }

  if (typeof result === 'number') {
    const rawPass = assertion.threshold === undefined ? result > 0 : result >= assertion.threshold;
    const pass = rawPass !== inverse;
    return {
      pass,
      score: result,
      reason: pass ? 'Assertion passed' : getFailureReason(rawPass),
      assertion,
    };
  }

  const pass = result.pass !== inverse;
  return {
    ...result,
    pass,
    reason:
      pass === result.pass
        ? result.reason
        : pass
          ? 'Assertion passed'
          : `Python code returned ${result.pass ? 'true' : 'false'}`,
    assertion: result.assertion ?? assertion,
  };
}

function buildPythonScript(renderedValue: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = '    ';
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  return `import json

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
}

function normalizePythonObjectResult(
  assertion: AssertionParams['assertion'],
  result: object,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  // Support snake_case keys from Python dataclass (recursively).
  const mappedObj = mapSnakeCaseToCamelCase(result);

  if (!isGradingResult(mappedObj)) {
    throw new Error(
      `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead:\n${JSON.stringify(
        mappedObj,
        null,
        2,
      )}`,
    );
  }

  const pythonGradingResult = mappedObj as Omit<GradingResult, 'assertion'>;
  if (assertion.threshold !== undefined && pythonGradingResult.score < assertion.threshold) {
    pythonGradingResult.pass = false;
    const scoreMessage = `Python score ${pythonGradingResult.score} is less than threshold ${assertion.threshold}`;
    pythonGradingResult.reason = pythonGradingResult.reason
      ? `${scoreMessage}: ${pythonGradingResult.reason}`
      : scoreMessage;
  }

  return normalizePythonAssertionResult(
    assertion,
    {
      ...pythonGradingResult,
      assertion,
    },
    inverse,
    renderedValue,
  );
}

function normalizePythonScriptResult(
  assertion: AssertionParams['assertion'],
  result: PythonAssertionResult,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  const lowerStringResult = typeof result === 'string' ? result.toLowerCase() : undefined;

  if ((typeof result === 'boolean' && result) || lowerStringResult === 'true') {
    return normalizePythonAssertionResult(assertion, true, inverse, renderedValue);
  }

  if ((typeof result === 'boolean' && !result) || lowerStringResult === 'false') {
    return normalizePythonAssertionResult(assertion, false, inverse, renderedValue);
  }

  if (typeof result === 'string' && result.startsWith('{')) {
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
    return normalizePythonAssertionResult(assertion, parsed, inverse, renderedValue);
  }

  if (typeof result === 'object' && result !== null) {
    return normalizePythonObjectResult(assertion, result, inverse, renderedValue);
  }

  const score = Number.parseFloat(String(result));
  if (Number.isNaN(score)) {
    throw new Error(
      `Python assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
    );
  }
  return normalizePythonAssertionResult(assertion, score, inverse, renderedValue);
}

export const handlePython = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  inverse,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'python assertion must have a string value');
  try {
    const result: PythonAssertionResult =
      typeof valueFromScript === 'undefined'
        ? await runPythonCode(buildPythonScript(renderedValue), 'main', [
            output,
            assertionValueContext,
          ])
        : valueFromScript;

    return normalizePythonScriptResult(assertion, result, inverse, renderedValue);
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Python code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
};
