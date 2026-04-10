import { type GradingResult, isGradingResult } from '../types/index';
import { mapSnakeCaseToCamelCase } from '../util/caseMapping';

import type { AssertionParams } from '../types/index';

export type ScriptAssertionResult = string | number | boolean | object | GradingResult | undefined;

export interface ScriptLabels {
  /** Used in "X returned true/false" messages (e.g. "Python code", "Ruby code") */
  code: string;
  /** Used in threshold/error messages (e.g. "Python", "Ruby") */
  language: string;
}

function appendToReason(reason: string, suffix: AssertionParams['assertion']['value']): string {
  return typeof suffix === 'string' && suffix ? `${reason}\n${suffix}` : reason;
}

/**
 * Normalize a boolean, number, or GradingResult from a script assertion into a
 * canonical GradingResult, applying inverse (not-) logic if needed.
 */
export function normalizeScriptAssertionResult(
  assertion: AssertionParams['assertion'],
  result: boolean | number | GradingResult,
  inverse: boolean,
  labels: ScriptLabels,
  reasonSuffix?: AssertionParams['assertion']['value'],
): GradingResult {
  const getFailureReason = (rawPass: boolean) => {
    return appendToReason(`${labels.code} returned ${rawPass ? 'true' : 'false'}`, reasonSuffix);
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
          : `${labels.code} returned ${result.pass ? 'true' : 'false'}`,
    assertion: result.assertion ?? assertion,
  };
}

/**
 * Normalize an object result from a script assertion (Python/Ruby) that may
 * use snake_case keys, applying threshold and inverse logic.
 */
export function normalizeScriptObjectResult(
  assertion: AssertionParams['assertion'],
  result: object,
  inverse: boolean,
  labels: ScriptLabels,
  reasonSuffix?: AssertionParams['assertion']['value'],
): GradingResult {
  const mappedObj = mapSnakeCaseToCamelCase(result);

  if (!isGradingResult(mappedObj)) {
    throw new Error(
      `${labels.language} assertion must return a boolean, number, or {pass, score, reason} object. Got instead:\n${JSON.stringify(
        mappedObj,
        null,
        2,
      )}`,
    );
  }

  const gradingResult = mappedObj as Omit<GradingResult, 'assertion'>;
  if (assertion.threshold !== undefined && gradingResult.score < assertion.threshold) {
    gradingResult.pass = false;
    const scoreMessage = `${labels.language} score ${gradingResult.score} is less than threshold ${assertion.threshold}`;
    gradingResult.reason = gradingResult.reason
      ? `${scoreMessage}: ${gradingResult.reason}`
      : scoreMessage;
  }

  return normalizeScriptAssertionResult(
    assertion,
    { ...gradingResult, assertion },
    inverse,
    labels,
    reasonSuffix,
  );
}

/**
 * Normalize a raw script result (string/boolean/number/object/GradingResult)
 * into a canonical GradingResult, handling JSON-stringified results, snake_case
 * keys, threshold comparison, and inverse logic.
 */
export function normalizeScriptResult(
  assertion: AssertionParams['assertion'],
  result: ScriptAssertionResult,
  inverse: boolean,
  labels: ScriptLabels,
  reasonSuffix?: AssertionParams['assertion']['value'],
): GradingResult {
  const lowerStringResult = typeof result === 'string' ? result.toLowerCase() : undefined;

  if ((typeof result === 'boolean' && result) || lowerStringResult === 'true') {
    return normalizeScriptAssertionResult(assertion, true, inverse, labels, reasonSuffix);
  }

  if (typeof result === 'boolean' || lowerStringResult === 'false') {
    return normalizeScriptAssertionResult(assertion, false, inverse, labels, reasonSuffix);
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
        `${labels.language} assertion must return a boolean, number, or {pass, score, reason} object. Got instead: ${result}`,
      );
    }
    return normalizeScriptObjectResult(assertion, parsed, inverse, labels, reasonSuffix);
  }

  if (typeof result === 'object' && result !== null) {
    return normalizeScriptObjectResult(assertion, result, inverse, labels, reasonSuffix);
  }

  const score = Number.parseFloat(String(result));
  if (Number.isNaN(score)) {
    throw new Error(
      `${labels.language} assertion must return a boolean, number, or {pass, score, reason} object. Instead got:\n${result}`,
    );
  }
  return normalizeScriptAssertionResult(assertion, score, inverse, labels, reasonSuffix);
}
