import invariant from '../util/invariant';
import { extractToolCalls } from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

interface ToolSequenceValue {
  sequence: string[];
  mode?: 'exact' | 'in_order' | 'any_order';
}

/**
 * Asserts that tools were called in a specific sequence during an agent's trajectory.
 *
 * Value can be:
 * - An array of strings: tool names in expected order (defaults to "exact" mode)
 * - An object with:
 *   - sequence: array of tool names
 *   - mode: "exact" | "in_order" | "any_order"
 *     - exact: tool calls must match exactly (same tools, same order, same count)
 *     - in_order: expected tools must appear in order (other tools may appear between them)
 *     - any_order: all expected tools must appear (order doesn't matter, same as tool-used)
 *
 * Example config:
 * ```yaml
 * assert:
 *   - type: trajectory:tool-sequence
 *     value: ["search_orders", "compose_reply"]  # exact match
 *   - type: trajectory:tool-sequence
 *     value:
 *       sequence: ["search_orders", "compose_reply"]
 *       mode: in_order
 * ```
 */
export const handleTrajectoryToolSequence = ({
  assertion,
  output,
  renderedValue,
  inverse,
  providerResponse,
}: AssertionParams): GradingResult => {
  let expectedSequence: string[];
  let mode: 'exact' | 'in_order' | 'any_order' = 'exact';

  if (Array.isArray(renderedValue)) {
    expectedSequence = renderedValue.map(String);
  } else if (renderedValue && typeof renderedValue === 'object' && !Array.isArray(renderedValue)) {
    const val = renderedValue as ToolSequenceValue;
    invariant(
      Array.isArray(val.sequence),
      '"trajectory:tool-sequence" value object must have a "sequence" array',
    );
    expectedSequence = val.sequence.map(String);
    if (val.mode) {
      invariant(
        ['exact', 'in_order', 'any_order'].includes(val.mode),
        '"trajectory:tool-sequence" mode must be "exact", "in_order", or "any_order"',
      );
      mode = val.mode;
    }
  } else {
    invariant(
      false,
      '"trajectory:tool-sequence" assertion requires a value: array of tool names or object with sequence and mode',
    );
  }

  invariant(
    expectedSequence.length > 0,
    '"trajectory:tool-sequence" assertion requires at least one tool name in the sequence',
  );

  const toolCalls = extractToolCalls(output, providerResponse);
  const actualSequence = toolCalls.map((tc) => tc.name);

  let matches: boolean;
  let reason: string;

  const expectedStr = expectedSequence.join(' → ');
  const actualStr = actualSequence.join(' → ') || '(none)';

  switch (mode) {
    case 'exact': {
      matches =
        actualSequence.length === expectedSequence.length &&
        actualSequence.every((name, i) => name === expectedSequence[i]);
      reason = matches
        ? `Tool sequence matches exactly: [${expectedStr}]`
        : `Expected exact sequence [${expectedStr}], got [${actualStr}]`;
      break;
    }
    case 'in_order': {
      matches = isSubsequence(expectedSequence, actualSequence);
      reason = matches
        ? `Expected tools [${expectedStr}] appeared in order within [${actualStr}]`
        : `Expected tools [${expectedStr}] to appear in order, but got [${actualStr}]`;
      break;
    }
    case 'any_order': {
      const actualSet = new Set(actualSequence);
      const missing = expectedSequence.filter((t) => !actualSet.has(t));
      matches = missing.length === 0;
      reason = matches
        ? `All expected tools [${expectedStr}] were called. Actual sequence: [${actualStr}]`
        : `Missing tools: [${missing.join(', ')}]. Actual sequence: [${actualStr}]`;
      break;
    }
  }

  const pass = matches !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: inverse ? (pass ? `NOT ${reason}` : reason) : reason,
    assertion,
  };
};

/**
 * Checks if `sub` is a subsequence of `seq` (elements appear in order but not necessarily consecutively).
 */
function isSubsequence(sub: string[], seq: string[]): boolean {
  let subIdx = 0;
  for (let i = 0; i < seq.length && subIdx < sub.length; i++) {
    if (seq[i] === sub[subIdx]) {
      subIdx++;
    }
  }
  return subIdx === sub.length;
}
