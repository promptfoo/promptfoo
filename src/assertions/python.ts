import { runPythonCode } from '../python/wrapper';
import { type GradingResult, isGradingResult } from '../types/index';
import { mapSnakeCaseToCamelCase } from '../util/caseMapping';
import invariant from '../util/invariant';

import type { AssertionParams } from '../types/index';

function buildPythonScript(renderedValue: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = '    ';
  if (isMultiline) {
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  const body = isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `    return ${renderedValue}`;

  return `import json\n\ndef main(output, context):\n${body}\n`;
}

function interpretBooleanResult(result: unknown): { pass: boolean; score: number } | null {
  if (typeof result === 'boolean') {
    return { pass: result, score: result ? 1.0 : 0.0 };
  }
  if (typeof result === 'string') {
    const lower = result.toLowerCase();
    if (lower === 'true') {
      return { pass: true, score: 1.0 };
    }
    if (lower === 'false') {
      return { pass: false, score: 0.0 };
    }
  }
  return null;
}

function interpretJsonStringResult(result: string): GradingResult | null {
  if (!result.startsWith('{')) {
    return null;
  }
  let parsed: unknown;
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
  return parsed as GradingResult;
}

function interpretObjectResult(
  result: object,
  assertion: AssertionParams['assertion'],
): GradingResult {
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
  return { ...pythonGradingResult, assertion };
}

function interpretNumericResult(
  result: unknown,
  assertion: AssertionParams['assertion'],
): { pass: boolean; score: number } {
  const score = Number.parseFloat(String(result));
  if (Number.isNaN(score)) {
    throw new Error(
      `Python assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
    );
  }
  const pass = assertion.threshold !== undefined ? score >= assertion.threshold : score > 0;
  return { pass, score };
}

async function executePython(
  renderedValue: string,
  valueFromScript: unknown,
  output: unknown,
  assertionValueContext: unknown,
): Promise<string | number | boolean | object | GradingResult | undefined> {
  if (typeof valueFromScript !== 'undefined') {
    return valueFromScript as string | number | boolean | object | GradingResult | undefined;
  }
  const pythonScript = buildPythonScript(renderedValue);
  return runPythonCode(pythonScript, 'main', [
    output as string | object | undefined,
    assertionValueContext as string | object | undefined,
  ]);
}

export const handlePython = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'python assertion must have a string value');

  let pass: boolean | undefined;
  let score: number | undefined;

  try {
    const result = await executePython(
      renderedValue,
      valueFromScript,
      output,
      assertionValueContext,
    );

    const boolResult = interpretBooleanResult(result);
    if (boolResult !== null) {
      pass = boolResult.pass;
      score = boolResult.score;
    } else if (typeof result === 'string') {
      const jsonResult = interpretJsonStringResult(result);
      if (jsonResult !== null) {
        return jsonResult;
      }
      const numResult = interpretNumericResult(result, assertion);
      pass = numResult.pass;
      score = numResult.score;
    } else if (typeof result === 'object' && result !== null) {
      return interpretObjectResult(result, assertion);
    } else {
      const numResult = interpretNumericResult(result, assertion);
      pass = numResult.pass;
      score = numResult.score;
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
    pass: pass!,
    score: score!,
    reason: pass
      ? 'Assertion passed'
      : `Python code returned ${pass ? 'true' : 'false'}\n${assertion.value}`,
    assertion,
  };
};
