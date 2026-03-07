import invariant from '../util/invariant';
import { extractToolCalls } from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Asserts that specific tool(s) were used during an agent's trajectory.
 *
 * Value can be:
 * - A string: single tool name
 * - An array of strings: all listed tools must have been used
 *
 * Supports `not-trajectory:tool-used` to assert tool(s) were NOT used.
 *
 * Example config:
 * ```yaml
 * assert:
 *   - type: trajectory:tool-used
 *     value: search_orders
 *   - type: trajectory:tool-used
 *     value: ["search_orders", "get_customer"]
 * ```
 */
export const handleTrajectoryToolUsed = ({
  assertion,
  output,
  renderedValue,
  inverse,
  providerResponse,
}: AssertionParams): GradingResult => {
  let expectedTools: string[];

  if (typeof renderedValue === 'string') {
    expectedTools = [renderedValue];
  } else if (Array.isArray(renderedValue)) {
    expectedTools = renderedValue.map(String);
  } else {
    invariant(
      false,
      '"trajectory:tool-used" assertion requires a value: tool name string or array of tool names',
    );
  }

  invariant(
    expectedTools.length > 0,
    '"trajectory:tool-used" assertion requires at least one tool name',
  );

  const toolCalls = extractToolCalls(output, providerResponse);
  const actualToolNames = new Set(toolCalls.map((tc) => tc.name));

  const found = expectedTools.filter((t) => actualToolNames.has(t));
  const missing = expectedTools.filter((t) => !actualToolNames.has(t));

  const allFound = missing.length === 0;
  const pass = allFound !== inverse;

  const actualList = [...actualToolNames].sort().join(', ') || '(none)';
  const expectedList = expectedTools.sort().join(', ');

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? inverse
        ? `None of the specified tools [${expectedList}] were used. Tools called: [${actualList}]`
        : `All expected tools [${expectedList}] were used. Tools called: [${actualList}]`
      : inverse
        ? `Expected tools [${found.join(', ')}] to NOT be used, but they were called. Tools called: [${actualList}]`
        : `Expected tools [${missing.join(', ')}] were not used. Tools called: [${actualList}]`,
    assertion,
  };
};
