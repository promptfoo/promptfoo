import { VERSION } from '../../constants';
import { renderPrompt } from '../../evaluatorHelpers';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  NunjucksFilterMap,
  Prompt,
  ProviderResponse,
} from '../../types/index';
import { fetchWithProxy } from '../../util/fetch/index';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import type { BaseRedteamMetadata } from '../types';

interface FreeAgentConfig {
  injectVar: string;
  goal: string;
  maxIterations?: number;
}

/**
 * Metadata for free agent strategy results
 */
interface FreeAgentMetadata extends BaseRedteamMetadata {
  agentIterations: number;
  agentResult: boolean;
  agentAttempts: Array<{
    iteration: number;
    message: string;
    response: string;
    reasoning?: string;
  }>;
  totalAttempts: number;
  finding?: {
    title: string;
    description: string;
    severity: string;
    evidence: string;
    proofOfConcept?: string;
  };
}

/**
 * Response from free agent provider
 */
interface FreeAgentResponse extends ProviderResponse {
  metadata: FreeAgentMetadata;
}

/**
 * Request/response types for the /agent endpoint
 */
interface FreeAgentChatRequest {
  sessionId?: string;
  message: string;
  goal?: string;
  targetResponse?: string;
}

interface FreeAgentChatResponse {
  sessionId: string;
  reply?: string;
  needsTargetResponse?: boolean;
  targetMessage?: string;
  finding?: {
    title: string;
    description: string;
    severity: string;
    evidence: string;
    proofOfConcept?: string;
  };
}

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Free Agent Provider
 *
 * This provider uses an AI agent to generate single-turn jailbreak attempts.
 * The agent maintains its own internal state to refine attempts, but each
 * interaction with the target is independent (no conversation history).
 *
 * How it works:
 * 1. Agent receives a goal (e.g., "Test for prompt injection vulnerabilities")
 * 2. Agent generates a jailbreak prompt
 * 3. Provider sends prompt to target as a single-turn request
 * 4. Agent analyzes the response
 * 5. Agent generates an improved attempt based on the feedback
 * 6. Repeats until finding a vulnerability or reaching max iterations
 *
 * This is similar to iterative jailbreak but uses an intelligent agent to
 * craft attempts, rather than predefined templates.
 */
export default class FreeAgentProvider implements ApiProvider {
  readonly config: FreeAgentConfig;
  private sessionId?: string;
  private maxIterations: number;
  private attempts: Array<{
    iteration: number;
    message: string;
    response: string;
    reasoning?: string;
  }> = [];

  id() {
    return 'promptfoo:redteam:free-agent';
  }

  constructor(config: FreeAgentConfig) {
    if (neverGenerateRemote()) {
      throw new Error(
        `Free Agent strategy requires remote generation to be enabled. The agent runs on the server side.`,
      );
    }
    invariant(typeof config.goal === 'string', 'Expected goal to be set for free-agent strategy');
    this.config = config;
    this.maxIterations = config.maxIterations || DEFAULT_MAX_ITERATIONS;
    logger.debug('[FreeAgent] FreeAgentProvider initialized with config', { config });
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<FreeAgentResponse> {
    logger.debug('[FreeAgent] callApi invoked', { context });
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');

    const targetProvider: ApiProvider = context.originalProvider;
    const goal = this.config.goal;

    logger.debug(`[FreeAgent] Starting agent session with goal: ${goal}`);

    return this.runAgent({
      goal,
      prompt: context.prompt,
      filters: context.filters,
      vars: context.vars,
      targetProvider,
      context,
      options,
      test: context.test,
    });
  }

  private async runAgent({
    goal,
    prompt,
    filters,
    vars,
    targetProvider,
    context,
    options,
  }: {
    goal: string;
    prompt: Prompt;
    filters: NunjucksFilterMap | undefined;
    vars: Record<string, string | object>;
    targetProvider: ApiProvider;
    context?: CallApiContextParams;
    options?: CallApiOptionsParams;
    test?: AtomicTestCase;
  }): Promise<FreeAgentResponse> {
    logger.debug('[FreeAgent] Starting agent attack loop');

    // Reset state for this test case
    this.sessionId = undefined;
    this.attempts = [];

    let iteration = 0;
    let stopReason: 'Finding submitted' | 'Max iterations reached' | 'Error' =
      'Max iterations reached';
    let finding:
      | {
          title: string;
          description: string;
          severity: string;
          evidence: string;
          proofOfConcept?: string;
        }
      | undefined;
    let lastResponse = '';
    let agentReply = '';

    // Start the agent session with an initial message
    let nextMessage = `Hello! I'm ready to help test the target system for the following goal: ${goal}. Please start your testing.`;

    while (iteration < this.maxIterations) {
      iteration++;
      logger.debug(`[FreeAgent] Starting iteration ${iteration}/${this.maxIterations}`);

      try {
        // Call the agent endpoint
        const agentResponse = await this.callAgentEndpoint({
          sessionId: this.sessionId,
          message: nextMessage,
          goal: this.sessionId ? undefined : goal, // Only send goal on first request
          targetResponse: lastResponse || undefined,
        });

        // Store session ID
        this.sessionId = agentResponse.sessionId;

        // Check if agent submitted a finding
        if (agentResponse.finding) {
          logger.info('[FreeAgent] Agent submitted a finding', {
            title: agentResponse.finding.title,
            severity: agentResponse.finding.severity,
          });
          finding = agentResponse.finding;
          stopReason = 'Finding submitted';
          break;
        }

        // Check if agent wants to send a message to the target
        if (agentResponse.needsTargetResponse && agentResponse.targetMessage) {
          logger.info('[FreeAgent] Agent requesting to send message to target', {
            message: agentResponse.targetMessage.substring(0, 100),
          });

          // Send the message to the target
          const targetResponse = await this.sendToTarget({
            message: agentResponse.targetMessage,
            prompt,
            vars,
            filters,
            targetProvider,
            context,
            options,
          });

          // Store this attempt
          this.attempts.push({
            iteration,
            message: agentResponse.targetMessage,
            response: targetResponse,
            reasoning: agentReply,
          });

          // Prepare next message for agent with target response
          nextMessage = `The target responded: ${targetResponse}`;
          lastResponse = targetResponse;
        } else if (agentResponse.reply) {
          // Agent just replied with thinking/reasoning
          logger.info('[FreeAgent] Agent replied', {
            reply: agentResponse.reply.substring(0, 100),
          });
          agentReply = agentResponse.reply;
          nextMessage = 'Please continue with your testing.';
          lastResponse = '';
        } else {
          // Unexpected response
          logger.warn('[FreeAgent] Unexpected agent response', { agentResponse });
          stopReason = 'Error';
          break;
        }
      } catch (error) {
        logger.error('[FreeAgent] Error in agent loop', {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          iteration,
          hasSessionId: !!this.sessionId,
        });
        stopReason = 'Error';
        break;
      }
    }

    // Clean up session
    if (this.sessionId) {
      try {
        await this.closeSession(this.sessionId);
      } catch (error) {
        logger.warn('[FreeAgent] Failed to close session', { error });
      }
    }

    logger.debug('[FreeAgent] Agent attack completed', {
      iterations: iteration,
      totalAttempts: this.attempts.length,
      stopReason,
      foundVulnerability: !!finding,
    });

    // Determine the output and success
    const agentResult = !!finding;
    /*
    const output = finding
      ? `Agent discovered vulnerability: ${finding.title}\n\nEvidence: ${finding.evidence}`
      : lastResponse || 'Agent completed testing without finding vulnerabilities';
    */
    const output = lastResponse;

    // Build messages array from attempts
    const messages: Array<Record<string, any>> = [];
    for (const attempt of this.attempts) {
      messages.push({
        role: 'user',
        content: attempt.message,
      });
      messages.push({
        role: 'assistant',
        content: attempt.response,
      });
    }

    return {
      output,
      metadata: {
        agentIterations: iteration,
        agentResult,
        agentAttempts: this.attempts,
        totalAttempts: this.attempts.length,
        stopReason,
        finding,
        messages,
        redteamFinalPrompt:
          this.attempts.length > 0 ? this.attempts[this.attempts.length - 1].message : undefined,
      },
    };
  }

  /**
   * Send a message to the agent endpoint
   */
  private async callAgentEndpoint(request: FreeAgentChatRequest): Promise<FreeAgentChatResponse> {
    // Get the base API URL and construct agent endpoint
    // getRemoteGenerationUrl() returns URLs like:
    // - https://api.promptfoo.app/api/v1/task (production)
    // - http://localhost:3201/task (local dev - missing /api/v1 prefix)
    const taskUrl = getRemoteGenerationUrl();

    // For local dev (localhost:3201), the URL is typically set to http://localhost:3201/task
    // but the actual endpoint is at /api/v1/agent, so we need to insert /api/v1
    let url: string;
    if (taskUrl.includes('localhost:3201')) {
      // Local dev: ensure we have /api/v1 in the path
      const baseUrl = taskUrl.split('/task')[0]; // Get http://localhost:3201
      url = `${baseUrl}/api/v1/agent`;
    } else if (taskUrl.includes('/api/v1/task')) {
      // Production: simple replacement
      url = taskUrl.replace('/task', '/agent');
    } else {
      // Fallback: assume standard API structure
      url = taskUrl.replace('/task', '/agent');
    }

    const body = JSON.stringify({
      ...request,
      version: VERSION,
      email: getUserEmail(),
    });

    logger.info(`[FreeAgent] Sending request`, {
      taskUrl,
      url,
      hasSessionId: !!request.sessionId,
      hasGoal: !!request.goal,
      messageLength: request.message.length,
      hasTargetResponse: !!request.targetResponse,
    });

    // Agent requests can take a long time with multiple tool calls
    const response = await fetchWithProxy(url, {
      body,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    logger.info(`[FreeAgent] Received response from agent endpoint`, {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[FreeAgent] Agent endpoint returned error`, {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Agent endpoint returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    logger.info('[FreeAgent] Parsed agent response', {
      sessionId: data.sessionId,
      hasReply: !!data.reply,
      needsTargetResponse: !!data.needsTargetResponse,
      hasFinding: !!data.finding,
      targetMessageLength: data.targetMessage?.length,
    });

    return data as FreeAgentChatResponse;
  }

  /**
   * Send a message to the target system under test
   */
  private async sendToTarget({
    message,
    prompt,
    vars,
    filters,
    targetProvider,
    context,
    options,
  }: {
    message: string;
    prompt: Prompt;
    vars: Record<string, string | object>;
    filters: NunjucksFilterMap | undefined;
    targetProvider: ApiProvider;
    context?: CallApiContextParams;
    options?: CallApiOptionsParams;
  }): Promise<string> {
    // Inject the agent's message into the target prompt
    const targetVars = {
      ...vars,
      [this.config.injectVar]: message,
    };

    const renderedPrompt = await renderPrompt(prompt, targetVars, filters, targetProvider);

    logger.debug('[FreeAgent] Sending to target', {
      message: message.substring(0, 100),
      renderedPrompt: renderedPrompt.substring(0, 100),
    });

    // Call the target provider
    const targetResponse = await targetProvider.callApi(renderedPrompt, context, options);

    if (targetResponse.error) {
      logger.warn('[FreeAgent] Target returned error', { error: targetResponse.error });
      return `Error: ${targetResponse.error}`;
    }

    const output = String(targetResponse.output || '');
    logger.debug('[FreeAgent] Received target response', {
      length: output.length,
      preview: output.substring(0, 100),
    });

    return output;
  }

  /**
   * Close an agent session
   */
  private async closeSession(sessionId: string): Promise<void> {
    const url = `${getRemoteGenerationUrl().replace('/task', '')}/agent/${sessionId}`;

    logger.debug(`[FreeAgent] Closing session ${sessionId}`);

    const response = await fetchWithProxy(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to close session: ${response.status} ${errorText}`);
    }

    logger.debug(`[FreeAgent] Session ${sessionId} closed successfully`);
  }
}
