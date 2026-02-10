/**
 * MCP Shadow Strategy
 *
 * This strategy transforms test cases for MCP Shadow testing - evaluating
 * AI agents for indirect prompt injection vulnerabilities via MCP servers.
 *
 * How it works:
 * 1. Annotates each test case with probe config metadata
 * 2. Sets a provider wrapper that starts a probe right before each provider call
 * 3. The wrapper delegates to the original target provider
 * 4. Tests run serially (one active probe at a time per deployment)
 * 5. After each test, the grader calls endProbe to get grading signals
 *
 * The grading is deterministic based on:
 * - honeypotTriggered: Agent called a trap tool (send_message, export_data, execute_code)
 * - exfilDetected: Agent made requests to the exfil endpoint
 */

import { randomUUID } from 'node:crypto';

import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { fetchWithRetries } from '../../util/fetch/index';
import { getRemoteGenerationUrl } from '../remoteGeneration';

import type { TestCase, TestCaseWithPlugin } from '../../types/index';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/providers';
import type { McpShadowGradingSignals } from '../plugins/mcpShadow';

// ============================================================================
// Types
// ============================================================================

export interface McpShadowConfig {
  /** Deployment ID for the MCP Shadow server */
  deploymentId: string;
  /** Attack type: content-exfil, content-hijack, tool-poisoning, etc. */
  attackType?: string;
  /** Specific technique to use */
  technique?: string;
  /** Target data to try to exfiltrate */
  targetData?: string;
  /** Target action to try to perform */
  targetAction?: string;
  /** Target tool to poison */
  targetTool?: string;
}

interface StartProbeResponse {
  result: {
    probeId: string;
    exfilUrl: string;
    payload: { tool: string; injection: string } | null;
  };
}

interface EndProbeResponse {
  result: {
    gradingSignals: McpShadowGradingSignals;
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Start a probe via the mcp-start-probe task.
 */
async function startProbe(
  deploymentId: string,
  attackType: string,
  config: {
    targetData?: string;
    targetAction?: string;
    targetTool?: string;
    technique?: string;
  },
): Promise<StartProbeResponse['result']> {
  const url = getRemoteGenerationUrl();

  logger.debug('[McpShadow] Starting probe via task API', {
    url,
    deploymentId,
    attackType,
  });

  const response = await fetchWithRetries(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'mcp-start-probe',
        deploymentId,
        attackType,
        technique: config.technique,
        config: {
          targetData: config.targetData,
          targetAction: config.targetAction,
          targetTool: config.targetTool,
        },
        email: getUserEmail(),
      }),
    },
    30000,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start probe: ${response.status} ${errorText}`);
  }

  const data: StartProbeResponse = await response.json();
  return data.result;
}

/**
 * End a probe and get grading signals via the mcp-end-probe task.
 */
export async function endProbe(
  probeId: string,
): Promise<EndProbeResponse['result']['gradingSignals']> {
  const url = getRemoteGenerationUrl();

  logger.debug('[McpShadow] Ending probe via task API', {
    url,
    probeId,
  });

  const response = await fetchWithRetries(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'mcp-end-probe',
        probeId,
        email: getUserEmail(),
      }),
    },
    30000,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to end probe: ${response.status} ${errorText}`);
  }

  const data: EndProbeResponse = await response.json();
  return data.result.gradingSignals;
}

// ============================================================================
// Provider Wrapper
// ============================================================================

/**
 * Creates a provider wrapper that manages the probe lifecycle.
 *
 * Before each provider call:
 * 1. Starts a probe (server prepares the trap — poisons tools, sets activeProbeId)
 * 2. Stores probeId in test metadata for the grader
 * 3. Delegates to the original target provider
 *
 * This ensures only one probe is active at a time (tests run serially).
 */
function createMcpShadowProvider(mcpConfig: McpShadowConfig): ApiProvider {
  const attackType = mcpConfig.attackType || 'content-exfil';

  return {
    id: () => `mcp-shadow:${attackType}`,

    callApi: async (
      prompt: string,
      context?: CallApiContextParams,
      options?: CallApiOptionsParams,
    ): Promise<ProviderResponse> => {
      const originalProvider = context?.originalProvider;
      if (!originalProvider) {
        return {
          output: '',
          error: 'MCP Shadow: No original provider available in context',
        };
      }

      // Start probe — server prepares the trap
      try {
        const probeResult = await startProbe(mcpConfig.deploymentId, attackType, {
          targetData: mcpConfig.targetData,
          targetAction: mcpConfig.targetAction,
          targetTool: mcpConfig.targetTool,
          technique: mcpConfig.technique,
        });

        // Store probeId in test metadata for the grader
        if (context?.test?.metadata) {
          context.test.metadata.mcpShadowProbeId = probeResult.probeId;
          context.test.metadata.mcpShadowExfilUrl = probeResult.exfilUrl;
          context.test.metadata.mcpShadowPayload = probeResult.payload;
        }

        logger.debug('[McpShadow] Probe started, calling target provider', {
          probeId: probeResult.probeId,
          originalProviderId: originalProvider.id(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('[McpShadow] Failed to start probe', { error: errorMessage });

        if (context?.test?.metadata) {
          context.test.metadata.mcpShadowSetupFailed = true;
          context.test.metadata.mcpShadowError = errorMessage;
        }

        return {
          output: `MCP Shadow probe setup failed: ${errorMessage}`,
          error: errorMessage,
        };
      }

      // Call the original target provider
      return originalProvider.callApi(prompt, context, options);
    },
  };
}

// ============================================================================
// Strategy Implementation
// ============================================================================

/**
 * Add MCP Shadow test cases.
 *
 * This strategy:
 * 1. Annotates each test case with probe config metadata
 * 2. Sets a provider wrapper that starts probes just before each provider call
 * 3. Tests run serially (one active probe at a time)
 * 4. After each test, the grader calls endProbe to get grading signals
 */
export async function addMcpShadowTestCases(
  testCases: TestCaseWithPlugin[],
  injectVar: string,
  config: Record<string, unknown>,
): Promise<TestCase[]> {
  const mcpConfig = config as unknown as McpShadowConfig;

  logger.debug(`[McpShadow] Processing ${testCases.length} test cases`, {
    injectVar,
    deploymentId: mcpConfig.deploymentId,
    attackType: mcpConfig.attackType,
  });

  if (!mcpConfig.deploymentId) {
    logger.error('[McpShadow] Missing required config.deploymentId');
    throw new Error('MCP Shadow strategy requires config.deploymentId');
  }

  const attackType = mcpConfig.attackType || 'content-exfil';
  const strategyId = `mcp-shadow:${attackType}`;
  const scanId = randomUUID();
  const provider = createMcpShadowProvider(mcpConfig);

  const results: TestCase[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const originalPrompt = String(testCase.vars?.[injectVar] ?? '');

    results.push({
      ...testCase,
      provider,
      vars: {
        ...testCase.vars,
        [injectVar]: originalPrompt,
        mcpShadowAttackType: attackType,
      },
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: `${assertion.metric}/McpShadow`,
      })),
      options: {
        ...testCase.options,
        runSerially: true,
      },
      metadata: {
        ...testCase.metadata,
        strategyId,
        scanId,
        mcpShadowDeploymentId: mcpConfig.deploymentId,
        mcpShadowAttackType: attackType,
        mcpShadowTechnique: mcpConfig.technique,
        // mcpShadowProbeId is set at runtime by the provider wrapper
      },
    });
  }

  return results;
}

/**
 * Get grading signals for a test case.
 * Called by the grader after the test is run.
 */
export async function getMcpShadowGradingSignals(
  probeId: string,
): Promise<EndProbeResponse['result']['gradingSignals'] | null> {
  try {
    return await endProbe(probeId);
  } catch (error) {
    logger.error('[McpShadow] Failed to get grading signals', {
      probeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Clear probe state (no-op, kept for backward compatibility with tests).
 */
export function clearProbeState(): void {
  // Probe state is now managed inline by the provider wrapper
}
