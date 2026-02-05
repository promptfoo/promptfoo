/**
 * MCP Shadow Strategy
 *
 * This strategy transforms test cases for MCP Shadow testing - evaluating
 * AI agents for indirect prompt injection vulnerabilities via MCP servers.
 *
 * How it works:
 * 1. Creates a probe via the mcp-start-probe task on the cloud server
 * 2. The target AI agent connects to the MCP Shadow server (deployment endpoint)
 * 3. Tool calls are tracked and honeypot tools are monitored
 * 4. On evaluation completion, mcp-end-probe returns grading signals
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

interface ProbeState {
  probeId: string;
  exfilUrl: string;
  payload: { tool: string; injection: string } | null;
  attackType: string;
  createdAt: number;
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
// State Management
// ============================================================================

// Module-level state for tracking probes across test cases
// Key format: `${evalId}:${testCaseId}` or just `${testCaseId}`
const probeStateMap = new Map<string, ProbeState>();

// TTL for probe state entries (1 hour)
const PROBE_STATE_TTL_MS = 60 * 60 * 1000;

// Maximum entries before forced cleanup
const MAX_PROBE_STATE_ENTRIES = 500;

/**
 * Clean up expired probe state entries.
 */
function cleanupExpiredProbeState(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];

  for (const [key, state] of probeStateMap.entries()) {
    if (now - state.createdAt > PROBE_STATE_TTL_MS) {
      expiredKeys.push(key);
    }
  }

  for (const key of expiredKeys) {
    probeStateMap.delete(key);
  }

  // If still over limit, remove oldest entries
  if (probeStateMap.size > MAX_PROBE_STATE_ENTRIES) {
    const entries = Array.from(probeStateMap.entries()).sort(
      ([, a], [, b]) => a.createdAt - b.createdAt,
    );
    const toRemove = entries.slice(0, probeStateMap.size - MAX_PROBE_STATE_ENTRIES);
    for (const [key] of toRemove) {
      probeStateMap.delete(key);
    }
  }

  if (expiredKeys.length > 0) {
    logger.debug('[McpShadow] Cleaned up expired probe state entries', {
      removedCount: expiredKeys.length,
      remainingCount: probeStateMap.size,
    });
  }
}

/**
 * Get probe state for a test case.
 */
export function getProbeStateForTestCase(
  testCaseId: string,
  evalId?: string,
): ProbeState | undefined {
  const stateKey = evalId ? `${evalId}:${testCaseId}` : testCaseId;
  return probeStateMap.get(stateKey);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Start a probe via the mcp-start-probe task.
 */
async function startProbe(
  deploymentId: string,
  probeIndex: number,
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
    probeIndex,
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
        probeIndex,
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
export async function endProbe(probeId: string): Promise<EndProbeResponse['result']['gradingSignals']> {
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
// Strategy Implementation
// ============================================================================

/**
 * Add MCP Shadow test cases.
 *
 * This strategy:
 * 1. Creates a probe for each test case
 * 2. Sets up the test metadata with probe info
 * 3. The provider runs the test against the target agent
 * 4. After evaluation, the grader calls endProbe to get signals
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

  const results: TestCase[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const originalPrompt = String(testCase.vars?.[injectVar] ?? '');

    // Extract context metadata
    const evalId = testCase.metadata?.evaluationId as string | undefined;
    const testCaseId =
      (testCase.metadata?.testCaseId as string) ||
      (testCase.metadata?.originalTestCaseId as string) ||
      `test-${i}`;

    const stateKey = evalId ? `${evalId}:${testCaseId}` : testCaseId;

    try {
      // Start probe for this test case
      const probeResult = await startProbe(mcpConfig.deploymentId, i, attackType, {
        targetData: mcpConfig.targetData,
        targetAction: mcpConfig.targetAction,
        targetTool: mcpConfig.targetTool,
        technique: mcpConfig.technique,
      });

      // Clean up expired entries before adding new ones
      cleanupExpiredProbeState();

      // Store probe state
      const probeState: ProbeState = {
        probeId: probeResult.probeId,
        exfilUrl: probeResult.exfilUrl,
        payload: probeResult.payload,
        attackType,
        createdAt: Date.now(),
      };
      probeStateMap.set(stateKey, probeState);

      logger.debug('[McpShadow] Created probe for test case', {
        testCaseId,
        probeId: probeResult.probeId,
        exfilUrl: probeResult.exfilUrl,
        hasPayload: !!probeResult.payload,
      });

      // Transform test case with probe metadata
      results.push({
        ...testCase,
        vars: {
          ...testCase.vars,
          [injectVar]: originalPrompt,
          // Add display variables for UI
          mcpShadowAttackType: attackType,
          mcpShadowInjection: probeResult.payload?.injection ?? 'N/A',
        },
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: `${assertion.metric}/McpShadow`,
        })),
        metadata: {
          ...testCase.metadata,
          strategyId,
          scanId,
          // MCP Shadow specific metadata
          mcpShadowProbeId: probeResult.probeId,
          mcpShadowDeploymentId: mcpConfig.deploymentId,
          mcpShadowExfilUrl: probeResult.exfilUrl,
          mcpShadowAttackType: attackType,
          mcpShadowTechnique: mcpConfig.technique,
          mcpShadowPayload: probeResult.payload,
        },
      });
    } catch (error) {
      logger.error('[McpShadow] Failed to start probe for test case', {
        testCaseId,
        error: error instanceof Error ? error.message : String(error),
      });

      // On error, pass through the original test case without MCP Shadow
      results.push({
        ...testCase,
        metadata: {
          ...testCase.metadata,
          strategyId,
          mcpShadowError: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
 * Clear probe state (useful for testing).
 */
export function clearProbeState(): void {
  probeStateMap.clear();
}
