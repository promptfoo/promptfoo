import logger from '../../logger';
import type {
  TestCase,
  TestCaseWithPlugin,
} from '../../types/index';

/**
 * Agent API Strategy
 *
 * Delegates testing to external agent APIs that implement the Promptfoo Agent Interface.
 * The agent is responsible for generating attacks, testing the target, and detecting vulnerabilities.
 */
export async function addAgentApiTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  logger.debug('[AgentApi] Adding agent-api test cases', {
    testCaseCount: testCases.length,
    config,
  });

  // Validate required config
  if (!config.endpoint) {
    throw new Error('agent-api strategy requires "endpoint" in config');
  }

  return testCases.map((testCase): TestCase => {
    // Use the test case prompt as the goal
    const goal = String(testCase.vars![injectVar]);

    return {
      ...testCase,
      // Use a dummy prompt - agent handles prompting internally
      // This ensures the result has a prompt for UI display
      prompts: [`Testing for: ${goal}`],
      provider: {
        id: 'promptfoo:redteam:agent-api',
        config: {
          endpoint: config.endpoint,
          goal,
          maxIterations: config.maxIterations || 10,
          timeout: config.timeout,
          apiKey: config.apiKey,
          ...config,
        },
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/AgentApi`,
      })),
      metadata: {
        ...testCase.metadata,
        strategyId: 'agent-api',
        goal,
        agentEndpoint: config.endpoint,
      },
    } as TestCase;
  });
}

