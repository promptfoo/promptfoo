import invariant from '../util/invariant';
import { extractToolCalls } from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

interface StepCountValue {
  min?: number;
  max?: number;
}

/**
 * Asserts that the number of tool calls (steps) in an agent's trajectory
 * is within specified bounds.
 *
 * Value can be:
 * - A number: exact expected count
 * - An object with min and/or max:
 *   - min: minimum number of tool calls (inclusive)
 *   - max: maximum number of tool calls (inclusive)
 *
 * Example config:
 * ```yaml
 * assert:
 *   - type: trajectory:step-count
 *     value: 3          # exactly 3 tool calls
 *   - type: trajectory:step-count
 *     value:
 *       min: 1
 *       max: 5
 * ```
 */
export const handleTrajectoryStepCount = ({
  assertion,
  output,
  renderedValue,
  inverse,
  providerResponse,
}: AssertionParams): GradingResult => {
  let min: number | undefined;
  let max: number | undefined;

  if (typeof renderedValue === 'number') {
    min = renderedValue;
    max = renderedValue;
  } else if (renderedValue && typeof renderedValue === 'object' && !Array.isArray(renderedValue)) {
    const val = renderedValue as StepCountValue;
    min = val.min;
    max = val.max;
    invariant(
      min !== undefined || max !== undefined,
      '"trajectory:step-count" value object must have at least "min" or "max"',
    );
    if (min !== undefined) {
      invariant(typeof min === 'number', '"trajectory:step-count" min must be a number');
    }
    if (max !== undefined) {
      invariant(typeof max === 'number', '"trajectory:step-count" max must be a number');
    }
    if (min !== undefined && max !== undefined) {
      invariant(min <= max, '"trajectory:step-count" min must be <= max');
    }
  } else {
    invariant(
      false,
      '"trajectory:step-count" assertion requires a value: number (exact count) or object with min/max',
    );
  }

  const toolCalls = extractToolCalls(output, providerResponse);
  const count = toolCalls.length;

  let withinBounds = true;
  if (min !== undefined && count < min) {
    withinBounds = false;
  }
  if (max !== undefined && count > max) {
    withinBounds = false;
  }

  const pass = withinBounds !== inverse;

  let boundsStr: string;
  if (min !== undefined && max !== undefined) {
    boundsStr = min === max ? `exactly ${min}` : `between ${min} and ${max}`;
  } else if (min !== undefined) {
    boundsStr = `at least ${min}`;
  } else {
    boundsStr = `at most ${max}`;
  }

  const toolNames = toolCalls.map((tc) => tc.name).join(', ') || '(none)';

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Tool call count ${count} is ${inverse ? 'outside' : 'within'} expected bounds (${boundsStr}). Tools: [${toolNames}]`
      : `Tool call count ${count} is ${inverse ? 'within' : 'outside'} expected bounds (${boundsStr}). Tools: [${toolNames}]`,
    assertion,
  };
};
