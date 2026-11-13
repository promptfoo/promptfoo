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

/**
 * Whether `value` is an object literal or an object without a prototype. A grader can build
 * its result in another realm, for example with `vm.runInNewContext`, so the check does not
 * compare against this realm's `Object.prototype`. Class instances and built-in containers
 * inherit from a prototype that has one of its own, and are not plain.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Symbol.toStringTag in value) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/** The number earlier releases recorded for a named score, when their arithmetic produced one. */
function toRecordedScore(value: unknown): unknown {
  if (
    typeof value === 'boolean' ||
    value === null ||
    (typeof value === 'string' && value.trim() !== '')
  ) {
    const score = Number(value);
    return Number.isFinite(score) ? score : value;
  }
  return value;
}

function withRecordedScores(namedScores: unknown): unknown {
  if (!isPlainObject(namedScores)) {
    return namedScores;
  }
  const entries = Object.entries(namedScores);
  // An undefined score is not a value, as in JSON.
  const recorded = entries
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, toRecordedScore(value)] as const);
  const changed =
    recorded.length !== entries.length ||
    recorded.some(([name, value]) => value !== namedScores[name]);
  return changed ? Object.fromEntries(recorded) : namedScores;
}

function withLegacyShapes(
  result: unknown,
  isComponent: boolean,
  converted: WeakMap<object, unknown>,
): unknown {
  if (!isPlainObject(result)) {
    return result;
  }
  if (converted.has(result)) {
    return converted.get(result);
  }
  // A result that contains itself stays as it is, for validation to reject.
  converted.set(result, result);

  const changes: Record<string, unknown> = {};
  if (isComponent && typeof result.pass === 'boolean') {
    if (result.reason == null) {
      changes.reason = '';
    }
    if (result.score == null) {
      changes.score = result.pass ? 1 : 0;
    }
  }
  const namedScores = withRecordedScores(result.namedScores);
  if (namedScores !== result.namedScores) {
    changes.namedScores = namedScores;
  }
  const components = result.componentResults;
  // Sparse arrays are left alone so that validation still rejects them.
  if (
    Array.isArray(components) &&
    components.every((_, index) => Object.prototype.hasOwnProperty.call(components, index)) &&
    Object.keys(components).length === components.length
  ) {
    const convertedComponents = components.map((component) =>
      withLegacyShapes(component, true, converted),
    );
    if (convertedComponents.some((component, index) => component !== components[index])) {
      changes.componentResults = convertedComponents;
    }
  }

  const normalized = Object.keys(changes).length > 0 ? { ...result, ...changes } : result;
  converted.set(result, normalized);
  return normalized;
}

/**
 * Returns `result` as a grading result, or undefined when it is not one.
 *
 * Grading results must hold finite numbers, and nested component results must be complete.
 * Custom graders written for earlier releases can return a few shapes those releases
 * accepted, so they are converted to what was recorded then instead of failing the grader:
 *
 * - a named score that is a boolean, `null`, or a numeric string becomes its number
 *   (`true` is 1; `false` and `null` are 0), and an `undefined` one is dropped;
 * - a nested component result may omit `reason`, and `score`, which then follows `pass`.
 *
 * Only plain objects are converted. Anything else that is not valid, such as `NaN`, an
 * infinity, or a result without `reason`, is still rejected.
 */
export function asGradingResult(result: unknown): GradingResult | undefined {
  if (isGradingResult(result)) {
    return result;
  }
  try {
    const converted = withLegacyShapes(result, false, new WeakMap());
    return converted !== result && isGradingResult(converted) ? converted : undefined;
  } catch {
    // An unreadable or too deeply nested result is not a grading result.
    return undefined;
  }
}

export function appendToReason(
  reason: string,
  suffix: AssertionParams['assertion']['value'],
): string {
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
    reason: inverse
      ? pass
        ? 'Assertion passed'
        : result.reason || `${labels.code} returned true`
      : result.reason,
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
  const gradingResult: Omit<GradingResult, 'assertion'> | undefined = asGradingResult(
    mapSnakeCaseToCamelCase(result),
  );

  if (!gradingResult) {
    throw new Error(
      `${labels.language} assertion must return a boolean, number, or {pass, score, reason} object with finite scores and weights. Got type ${typeof result}.`,
    );
  }

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
