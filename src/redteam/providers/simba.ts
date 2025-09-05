import invariant from 'tiny-invariant';
import { getUserEmail } from '../../globalConfig/accounts';
import logger, { logRequestResponse } from '../../logger';
import { getRemoteGenerationUrl } from '../remoteGeneration';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types';

interface SimbaConfig {
  injectVar: string;
  goal?: string;
  purpose?: string;
  additionalInstructions?: string;
  maxRounds?: number;
  maxVectors?: number;
}

interface SimbaStartRequest {
  targetInfo: {
    goal: string;
    purpose: string;
    additionalAttackInstructions?: string;
  };
  config: {
    maxConversationRounds: number;
    maxAttackVectors: number;
  };
  email: string;
}

interface SimbaStartResponse {
  sessionId: string;
}

interface SimbaNextRequest {
  requestedCount: number;
  responses: Record<string, string>;
  email: string;
}

interface SimbaOperation {
  conversationId: string;
  nextQuestion: string;
  logMessage: string;
}

interface SimbaBatchResponse {
  operations: SimbaOperation[];
  completed: boolean;
}

export default class SimbaProvider implements ApiProvider {
  readonly config: SimbaConfig;
  private sessionId: string | null = null;

  id() {
    return 'promptfoo:redteam:simba';
  }

  constructor(options: ProviderOptions & SimbaConfig = {} as any) {
    invariant(typeof options.injectVar === 'string', 'Expected injectVar to be set');
    this.config = {
      injectVar: options.injectVar,
      goal: options.goal || 'Default red team goal',
      purpose: options.purpose || 'Red team testing',
      additionalInstructions: options.additionalInstructions,
      maxRounds: options.maxRounds || 20,
      maxVectors: options.maxVectors || 5,
    };
    logger.debug(`[Simba] Constructor options: ${JSON.stringify(this.config)}`);
  }

  private async callSimbaApi(endpoint: string, body: any): Promise<any> {
    const url = `${getRemoteGenerationUrl()}/api/v1/simba${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      logRequestResponse(url, body, response);
      throw new Error(`Simba API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async startSession(): Promise<string> {
    const email = (await getUserEmail()) || 'demo@promptfoo.dev';

    const startRequest: SimbaStartRequest = {
      targetInfo: {
        goal: this.config.goal!,
        purpose: this.config.purpose!,
        additionalAttackInstructions: this.config.additionalInstructions,
      },
      config: {
        maxConversationRounds: this.config.maxRounds!,
        maxAttackVectors: this.config.maxVectors!,
      },
      email,
    };

    const response: SimbaStartResponse = await this.callSimbaApi('/start', startRequest);
    logger.debug(`[Simba] Started session with ID: ${response.sessionId}`);
    return response.sessionId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      // Initialize session if not already done
      if (!this.sessionId) {
        this.sessionId = await this.startSession();
      }

      // Get the target provider to interact with
      const targetProvider = context?.originalProvider;
      if (!targetProvider) {
        throw new Error('Simba provider requires originalProvider in context');
      }

      const email = (await getUserEmail()) || 'demo@promptfoo.dev';
      const responses: Record<string, string> = {};
      let round = 0;
      let totalTokens = 0;
      const maxRounds = this.config.maxRounds || 20;
      let finalOutput = '';
      const conversationHistory: Array<{ role: string; content: string }> = [];

      // Main conversation loop - similar to the existing Simba command
      while (round < maxRounds) {
        round++;
        logger.debug(`[Simba] Starting round ${round}`);

        // Request next operations from Simba
        const nextRequest: SimbaNextRequest = {
          requestedCount: 1,
          responses,
          email,
        };

        const batchResponse: SimbaBatchResponse = await this.callSimbaApi(
          `/sessions/${this.sessionId}/next`,
          nextRequest,
        );

        if (batchResponse.completed) {
          logger.debug('[Simba] Session completed');
          break;
        }

        if (batchResponse.operations.length === 0) {
          logger.debug('[Simba] No more operations available');
          break;
        }

        // Process the first operation
        const operation = batchResponse.operations[0];
        logger.debug(`[Simba] Round ${round}: ${operation.nextQuestion}`);

        conversationHistory.push({
          role: 'user',
          content: operation.nextQuestion,
        });

        // Send Simba's question to the target provider
        const targetResponse = await targetProvider.callApi(
          operation.nextQuestion,
          context,
          options,
        );

        if (targetResponse.error) {
          logger.error(`[Simba] Target provider error: ${targetResponse.error}`);
          break;
        }

        const responseContent =
          typeof targetResponse.output === 'string'
            ? targetResponse.output
            : JSON.stringify(targetResponse.output);

        logger.debug(`[Simba] Target response: ${responseContent}`);

        conversationHistory.push({
          role: 'assistant',
          content: responseContent,
        });

        // Store the response to send back to Simba in the next round
        responses[operation.conversationId] = responseContent;
        finalOutput = responseContent;

        // Track token usage
        if (targetResponse.tokenUsage) {
          totalTokens += targetResponse.tokenUsage.total || 0;
        }
      }

      return {
        output: finalOutput || 'Simba conversation completed with no final output',
        metadata: {
          simbaSessionId: this.sessionId,
          conversationHistory,
          totalRounds: round,
          simbaCompleted: true,
        },
        tokenUsage: { total: totalTokens, prompt: 0, completion: 0 },
      };
    } catch (error) {
      logger.error(`[Simba] Error: ${error}`);
      return {
        error: `Simba provider error: ${error instanceof Error ? error.message : String(error)}`,
        tokenUsage: { total: 0, prompt: 0, completion: 0 },
      };
    }
  }
}
