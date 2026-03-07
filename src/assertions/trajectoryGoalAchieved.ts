import { matchesLlmRubric } from '../matchers';
import invariant from '../util/invariant';
import { extractToolCalls } from './trajectoryUtils';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Model-graded assertion that evaluates whether an agent achieved its goal
 * based on the full trajectory (tool calls, outputs, and final response).
 *
 * Value is a string describing the goal/success criteria (used as a rubric).
 * The LLM judge receives the goal rubric plus a formatted trajectory summary.
 *
 * Example config:
 * ```yaml
 * assert:
 *   - type: trajectory:goal-achieved
 *     value: "The agent successfully found the order and provided the customer with tracking information"
 *     provider: openai:gpt-4o
 *     threshold: 0.8
 * ```
 */
export const handleTrajectoryGoalAchieved = async ({
  assertion,
  output,
  outputString,
  test,
  providerResponse,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof assertion.value === 'string' || typeof assertion.rubricPrompt === 'string',
    '"trajectory:goal-achieved" assertion requires a string value describing the goal/success criteria',
  );

  const goalDescription = (assertion.value as string) || assertion.rubricPrompt || '';
  const toolCalls = extractToolCalls(output, providerResponse);

  // Build trajectory summary for the LLM judge
  const trajectorySummary = buildTrajectorySummary(toolCalls, outputString);

  const rubric = `You are evaluating whether an AI agent achieved its goal based on the agent's trajectory and final output.

## Goal / Success Criteria
${goalDescription}

## Agent Trajectory
${trajectorySummary}

## Instructions
Evaluate whether the agent successfully achieved the stated goal. Consider:
1. Did the agent use appropriate tools to accomplish the task?
2. Did the agent's final output address the goal?
3. Were there any errors or unnecessary steps that indicate failure?

Score 1 if the goal was achieved, 0 if not. For partial achievement, use intermediate scores.`;

  // Update assertion value for display in UI
  assertion.value = goalDescription;

  return matchesLlmRubric(
    rubric,
    outputString,
    test.options,
    test.vars,
    assertion,
    undefined,
    providerCallContext,
  );
};

function buildTrajectorySummary(
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>,
  finalOutput: string,
): string {
  const parts: string[] = [];

  if (toolCalls.length > 0) {
    parts.push('### Tool Calls');
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const argsStr = tc.args ? ` with args: ${JSON.stringify(tc.args)}` : '';
      parts.push(`${i + 1}. **${tc.name}**${argsStr}`);
    }
  } else {
    parts.push('### Tool Calls\nNo tools were called.');
  }

  parts.push('### Final Output');
  parts.push(finalOutput || '(empty)');

  return parts.join('\n');
}
