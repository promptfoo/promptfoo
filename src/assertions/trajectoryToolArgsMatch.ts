import invariant from '../util/invariant';
import { extractToolCalls } from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

interface ToolArgsMatchValue {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Asserts that a specific tool was called with arguments matching expected values.
 *
 * Value must be an object with:
 * - tool: the tool name to check
 * - args: an object of key-value pairs that must be present in the tool's arguments
 *   (partial match - extra args in the actual call are allowed)
 *
 * If the tool was called multiple times, the assertion passes if ANY call matches.
 *
 * Example config:
 * ```yaml
 * assert:
 *   - type: trajectory:tool-args-match
 *     value:
 *       tool: search_orders
 *       args:
 *         order_id: "123"
 *   - type: trajectory:tool-args-match
 *     value:
 *       tool: send_email
 *       args:
 *         to: "user@example.com"
 *         subject: "Order Update"
 * ```
 */
export const handleTrajectoryToolArgsMatch = ({
  assertion,
  output,
  renderedValue,
  inverse,
  providerResponse,
}: AssertionParams): GradingResult => {
  invariant(
    renderedValue && typeof renderedValue === 'object' && !Array.isArray(renderedValue),
    '"trajectory:tool-args-match" assertion requires a value object with "tool" and "args" properties',
  );

  const val = renderedValue as ToolArgsMatchValue;

  invariant(
    typeof val.tool === 'string' && val.tool.length > 0,
    '"trajectory:tool-args-match" assertion requires a non-empty "tool" property',
  );

  invariant(
    val.args && typeof val.args === 'object' && !Array.isArray(val.args),
    '"trajectory:tool-args-match" assertion requires an "args" object',
  );

  const toolCalls = extractToolCalls(output, providerResponse);
  const matchingCalls = toolCalls.filter((tc) => tc.name === val.tool);

  if (matchingCalls.length === 0) {
    const pass = inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: `Tool "${val.tool}" was not called. Tools called: [${[...new Set(toolCalls.map((tc) => tc.name))].join(', ') || '(none)'}]`,
      assertion,
    };
  }

  // Check if any call matches the expected args (partial match)
  const expectedEntries = Object.entries(val.args);
  let bestMatch: { call: (typeof matchingCalls)[0]; matchedCount: number } | null = null;

  for (const call of matchingCalls) {
    const callArgs = call.args || {};
    const matchedCount = expectedEntries.filter(([key, expectedVal]) => {
      return deepEquals(callArgs[key], expectedVal);
    }).length;

    if (matchedCount === expectedEntries.length) {
      // Full match found
      const pass = !inverse;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: pass
          ? `Tool "${val.tool}" was called with matching args: ${JSON.stringify(val.args)}`
          : `Tool "${val.tool}" was called with matching args ${JSON.stringify(val.args)}, but expected it NOT to match`,
        assertion,
      };
    }

    if (!bestMatch || matchedCount > bestMatch.matchedCount) {
      bestMatch = { call, matchedCount };
    }
  }

  // No full match found
  const pass = inverse;
  const bestCallArgs = bestMatch?.call.args || {};
  const mismatched = expectedEntries
    .filter(([key, expectedVal]) => !deepEquals(bestCallArgs[key], expectedVal))
    .map(
      ([key, expectedVal]) =>
        `${key}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(bestCallArgs[key])}`,
    )
    .join('; ');

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Tool "${val.tool}" args did not match as expected (inverse assertion). Mismatched: ${mismatched}`
      : `Tool "${val.tool}" was called ${matchingCalls.length} time(s) but no call matched expected args. Closest call mismatched: ${mismatched}`,
    assertion,
  };
};

function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) {
    // Allow string/number coercion for common cases
    return String(a) === String(b);
  }
  if (typeof a !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, i) => deepEquals(val, b[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => deepEquals(aObj[key], bObj[key]));
}
