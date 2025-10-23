import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types';
import { fetchWithProxy } from '../../util/fetch';
import invariant from '../../util/invariant';

interface AgentApiConfig {
  endpoint: string;
  goal: string;
  maxIterations?: number;
  timeout?: number;
  apiKey?: string;
}

interface AgentTestRequest {
  goal: string;
  target: {
    provider: string;
    prompt: string;
    injectVar: string;
    config?: Record<string, any>;
  };
  testCase: {
    vars: Record<string, string>;
    metadata?: Record<string, any>;
  };
  grading?: {
    assertions?: Array<{
      type: string;
      metric: string;
    }>;
  };
  config: Record<string, any>;
}

interface AgentTestResponse {
  success: boolean;
  output: string;
  attempts: Array<{
    iteration: number;
    message: string;
    response: string;
    reasoning?: string;
    timestamp?: number;
  }>;
  finding?: {
    title: string;
    description: string;
    severity: string;
    evidence: string;
    proofOfConcept?: string;
    cwe?: string[];
  };
  metadata: {
    agentType: string;
    totalIterations: number;
    totalTime: number;
    totalCost?: number;
    stopReason: string;
    llmCalls?: Array<{
      model: string;
      tokens: number;
      cost: number;
    }>;
  };
}

/**
 * Agent API Provider
 *
 * Calls external agent APIs that implement the Promptfoo Agent Interface.
 * The agent handles the attack strategy, message generation, and vulnerability detection.
 * This provider just orchestrates the communication.
 */
export default class AgentApiProvider implements ApiProvider {
  readonly config: AgentApiConfig;

  constructor(config: AgentApiConfig) {
    invariant(typeof config.endpoint === 'string', 'Expected endpoint to be set for agent-api');
    invariant(typeof config.goal === 'string', 'Expected goal to be set for agent-api');

    this.config = config;
    logger.debug('[AgentApi] Initialized with config', { config });
  }

  id() {
    return 'promptfoo:redteam:agent-api';
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    invariant(context?.originalProvider, 'Expected originalProvider to be set');
    invariant(context?.vars, 'Expected vars to be set');
    invariant(context?.prompt, 'Expected prompt to be set');

    logger.info('🔍 [AgentApi] callApi called', {
      promptParam: _prompt,
      contextPrompt: context.prompt,
      vars: context.vars,
    });

    const targetProvider = context.originalProvider;

    // Build agent request
    const agentRequest: AgentTestRequest = {
      goal: this.config.goal,
      target: {
        provider: targetProvider.id(),
        prompt: typeof context.prompt === 'string' ? context.prompt : context.prompt.raw,
        injectVar: 'query', // Standard var name, could be derived from context if needed
        config: targetProvider.config || {},
      },
      testCase: {
        vars: context.vars as Record<string, string>,
        metadata: context.test?.metadata,
      },
      grading:
        context.test && 'assert' in context.test
          ? {
              assertions: (context.test as any).assert,
            }
          : undefined,
      config: {
        maxIterations: this.config.maxIterations || 10,
        timeout: this.config.timeout,
        ...this.config,
      },
    };

    logger.info('[AgentApi] Calling agent endpoint', {
      endpoint: this.config.endpoint,
      goal: this.config.goal,
      targetProvider: targetProvider.id(),
    });

    // Call agent API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetchWithProxy(`${this.config.endpoint}/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify(agentRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[AgentApi] Agent endpoint error', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Agent API error ${response.status}: ${errorText}`);
    }

    const agentResult: AgentTestResponse = await response.json();

    logger.info('[AgentApi] Agent completed', {
      success: agentResult.success,
      iterations: agentResult.metadata.totalIterations,
      stopReason: agentResult.metadata.stopReason,
      foundVulnerability: !!agentResult.finding,
    });

    // Convert agent response to promptfoo format
    const finalAttempt = agentResult.attempts[agentResult.attempts.length - 1];
    
    logger.info('🎨 [AgentApi] Formatting response for promptfoo', {
      hasAttempts: agentResult.attempts.length,
      hasFinding: !!agentResult.finding,
      finalMessage: finalAttempt?.message,
    });
    
    return {
      output: agentResult.output,
      metadata: {
        // Agent-specific metadata
        agentType: agentResult.metadata.agentType,
        agentResult: agentResult.success,
        agentIterations: agentResult.metadata.totalIterations,
        totalTime: agentResult.metadata.totalTime,
        totalCost: agentResult.metadata.totalCost,
        stopReason: agentResult.metadata.stopReason,
        llmCalls: agentResult.metadata.llmCalls,

        // Finding details
        finding: agentResult.finding,

        // For grading
        redteamFinalPrompt: finalAttempt?.message,
        finalIteration: agentResult.metadata.totalIterations,
        highestScore: agentResult.success ? 1 : 0,

        // Iterative-compatible history format for UI
        redteamHistory: agentResult.attempts.map((attempt) => ({
          prompt: attempt.message,
          output: attempt.response,
          score: 0, // Mock doesn't grade each attempt
          graderPassed: undefined,
          guardrails: undefined,
        })),

        // Message array format for conversation view
        messages: agentResult.attempts.flatMap((attempt) => [
          { role: 'user', content: attempt.message },
          { role: 'assistant', content: attempt.response },
        ]),

        // Original attempts for reference
        agentAttempts: agentResult.attempts,
      },
    };
  }
}

