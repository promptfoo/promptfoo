import { runRubyCode } from '../ruby/wrapper';
import { type GradingResult, isGradingResult } from '../types/index';
import { mapSnakeCaseToCamelCase } from '../util/caseMapping';
import invariant from '../util/invariant';

import type { AssertionParams } from '../types/index';

type RubyAssertionResult = string | number | boolean | object | GradingResult | undefined;

function appendRenderedValueToReason(reason: string, renderedValue: string): string {
  return renderedValue ? `${reason}\n${renderedValue}` : reason;
}

function normalizeRubyAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  const getFailureReason = (rawPass: boolean) => {
    return appendRenderedValueToReason(
      `Ruby code returned ${rawPass ? 'true' : 'false'}`,
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
          : `Ruby code returned ${result.pass ? 'true' : 'false'}`,
    assertion: result.assertion ?? assertion,
  };
}

function buildRubyScript(renderedValue: string): string {
  const isMultiline = renderedValue.includes('\n');
  let indentStyle = '  ';
  if (isMultiline) {
    // Detect the indentation style of the first indented line.
    const match = renderedValue.match(/^(?!\s*$)\s+/m);
    if (match) {
      indentStyle = match[0];
    }
  }

  return `require 'json'

def main(output, context)
${
  isMultiline
    ? renderedValue
        .split('\n')
        .map((line) => `${indentStyle}${line}`)
        .join('\n')
    : `  return ${renderedValue}`
}
end
`;
}

function normalizeRubyObjectResult(
  assertion: AssertionParams['assertion'],
  result: object,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  // Support snake_case keys from Ruby (recursively).
  const mappedObj = mapSnakeCaseToCamelCase(result);

  if (!isGradingResult(mappedObj)) {
    throw new Error(
      `Ruby assertion must return a boolean, number, or {pass, score, reason} object. Got instead:\n${JSON.stringify(
        mappedObj,
        null,
        2,
      )}`,
    );
  }

  const rubyGradingResult = mappedObj as Omit<GradingResult, 'assertion'>;
  if (assertion.threshold !== undefined && rubyGradingResult.score < assertion.threshold) {
    rubyGradingResult.pass = false;
    const scoreMessage = `Ruby score ${rubyGradingResult.score} is less than threshold ${assertion.threshold}`;
    rubyGradingResult.reason = rubyGradingResult.reason
      ? `${scoreMessage}: ${rubyGradingResult.reason}`
      : scoreMessage;
  }

  return normalizeRubyAssertionResult(
    assertion,
    {
      ...rubyGradingResult,
      assertion,
    },
    inverse,
    renderedValue,
  );
}

function normalizeRubyScriptResult(
  assertion: AssertionParams['assertion'],
  result: RubyAssertionResult,
  inverse: boolean,
  renderedValue: string,
): GradingResult {
  const lowerStringResult = typeof result === 'string' ? result.toLowerCase() : undefined;

  if ((typeof result === 'boolean' && result) || lowerStringResult === 'true') {
    return normalizeRubyAssertionResult(assertion, true, inverse, renderedValue);
  }

  if ((typeof result === 'boolean' && !result) || lowerStringResult === 'false') {
    return normalizeRubyAssertionResult(assertion, false, inverse, renderedValue);
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
        `Ruby assertion must return a boolean, number, or {pass, score, reason} object. Got instead: ${result}`,
      );
    }
    return normalizeRubyObjectResult(assertion, parsed, inverse, renderedValue);
  }

  if (typeof result === 'object' && result !== null) {
    return normalizeRubyObjectResult(assertion, result, inverse, renderedValue);
  }

  const score = Number.parseFloat(String(result));
  if (Number.isNaN(score)) {
    throw new Error(
      `Ruby assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
    );
  }
  return normalizeRubyAssertionResult(assertion, score, inverse, renderedValue);
}

export const handleRuby = async ({
  assertion,
  renderedValue,
  valueFromScript,
  assertionValueContext,
  inverse,
  output,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', 'ruby assertion must have a string value');
  try {
    const result: RubyAssertionResult =
      typeof valueFromScript === 'undefined'
        ? await runRubyCode(buildRubyScript(renderedValue), 'main', [output, assertionValueContext])
        : valueFromScript;

    return normalizeRubyScriptResult(assertion, result, inverse, renderedValue);
  } catch (err) {
    return {
      pass: false,
      score: 0,
      reason: `Ruby code execution failed: ${(err as Error).message}`,
      assertion,
    };
  }
};
