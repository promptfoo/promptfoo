import { runPythonCode } from '../python/wrapper';
import { type GradingResult, isGradingResult } from '../types/index';
import { mapSnakeCaseToCamelCase } from '../util/caseMapping';
import invariant from '../util/invariant';

import type { AssertionParams } from '../types/index';

type PythonAssertionResult = string | number | boolean | object | GradingResult | undefined;

function appendAssertionValueToReason(
  reason: string,
  assertion: AssertionParams['assertion'],
): string {
  return typeof assertion.value === 'string' && assertion.value
    ? `${reason}\n${assertion.value}`
    : reason;
}

function normalizePythonAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
): GradingResult {
  const getFailureReason = (rawPass: boolean) => {
    return appendAssertionValueToReason(
      `Python code returned ${rawPass ? 'true' : 'false'}`,
      assertion,
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
  );
}

function normalizePythonScriptResult(
  assertion: AssertionParams['assertion'],
  result: PythonAssertionResult,
  inverse: boolean,
): GradingResult {
  const lowerStringResult = typeof result === 'string' ? result.toLowerCase() : undefined;

  if ((typeof result === 'boolean' && result) || lowerStringResult === 'true') {
    return normalizePythonAssertionResult(assertion, true, inverse);
  }

  if ((typeof result === 'boolean' && !result) || lowerStringResult === 'false') {
    return normalizePythonAssertionResult(assertion, false, inverse);
  }

  if (typeof result === 'string' && result.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result);
    } catch (err) {
      throw new Error(`Invalid JSON: ${err} when parsing result: ${result}`);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: ${result}`,
      );
    }
    return normalizePythonObjectResult(assertion, parsed, inverse);
  }

  if (typeof result === 'object' && result !== null) {
    return normalizePythonObjectResult(assertion, result, inverse);
  }

  const score = Number.parseFloat(String(result));
  if (Number.isNaN(score)) {
    throw new Error(
      `Python assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
    );
  }
  return normalizePythonAssertionResult(assertion, score, inverse);
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

    return normalizePythonScriptResult(assertion, result, inverse);
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Python code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
};
