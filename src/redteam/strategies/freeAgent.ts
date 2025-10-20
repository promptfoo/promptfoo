import logger from '../../logger';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';

/**
 * Free Agent Strategy
 *
 * This strategy uses an agentic approach to generate single-turn jailbreak attempts.
 * Unlike multi-turn strategies like Crescendo, each attempt to the target is independent
 * with no conversation history maintained.
 *
 * The agent:
 * 1. Receives a goal (what vulnerability to test)
 * 2. Iteratively generates single-turn jailbreak prompts
 * 3. Sends each prompt to the target independently
 * 4. Analyzes target responses to refine the next attempt
 * 5. Continues until finding a vulnerability or reaching max iterations
 *
 * This is similar to the iterative jailbreak strategy, but uses an AI agent to
 * intelligently craft and refine attempts based on target feedback.
 */
export async function addFreeAgentTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('Adding Free Agent test cases');
  return testCases.map((testCase) => {
    // Use the prompt (harmful content being tested) as the goal for the agent
    const goal = String(testCase.vars![injectVar]);

    return {
      ...testCase,
      provider: {
        id: 'promptfoo:redteam:free-agent',
        config: {
          injectVar,
          goal,
          maxIterations: config.maxIterations || 10,
          ...config,
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/FreeAgent`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: 'free-agent',
        goal,
      },
    };
  });
}
