import { randomBytes } from 'crypto';
import logger from '../../logger';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../../types';
import { getRemoteGenerationUrl } from '../remoteGeneration';
import type { Message } from './shared';
import { messagesToRedteamHistory } from './shared';

interface ServerState {
  originalTopic: string;
  deviationAttempts: number;
  currentPhase: number;
  lastDeviationSuccess: boolean;
}

export class ServerOffTopicProvider implements ApiProvider {
  private sessionId: string;
  private messages: Message[] = [];
  private roundNum: number = 0;
  private state: ServerState = {
    originalTopic: '',
    deviationAttempts: 0,
    currentPhase: 0,
    lastDeviationSuccess: false,
  };
  private originalPurpose: string = '';
  private maxRounds: number;

  constructor(public config: any) {
    logger.debug(`[ServerOffTopic] Initialized with config: ${JSON.stringify(config)}`);
    this.sessionId = `session_${Date.now()}_${randomBytes(16).toString('hex')}`;
    this.maxRounds = config?.maxRounds ?? 10; // Default to 10 if not specified
  }

  id(): string {
    return 'promptfoo:redteam:off-topic';
  }

  private formatMessageContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  /**
   * Executes an off-topic conversation attack by coordinating with a remote server.
   *
   * This method conducts a multi-turn conversation where the server attempts to get the
   * target model to deviate from its original purpose through various off-topic prompts.
   * The conversation continues until either:
   * - The server signals completion (successful deviation)
   * - Maximum rounds are reached
   * - The model successfully deviates from its purpose
   *
   * @param prompt - Initial prompt (not used directly in off-topic attacks)
   * @param context - Call context containing the original provider and test metadata
   * @param options - Optional API call parameters
   * @returns Promise resolving to provider response with conversation output and metadata
   * @throws Error if originalProvider is not provided or server communication fails
   */
  async callApi(
    prompt: string | unknown,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<any> {
    if (!context?.originalProvider) {
      throw new Error('Expected originalProvider to be set');
    }

    try {
      let isComplete = false;
      let lastResponse = null;
      let metadata = {};

      // Store the purpose from the context if available
      if (context?.test?.metadata?.purpose) {
        this.originalPurpose = context.test.metadata.purpose;
      }

      // Continue conversation until max rounds or server indicates completion
      while (!isComplete && this.roundNum < this.maxRounds) {
        logger.debug(
          `[ServerOffTopic] Round ${this.roundNum}, sending messages: ${JSON.stringify(this.messages)}`,
        );

        const requestPayload = {
          task: 'off-topic',
          i: this.roundNum,
          messages: this.messages,
          maxRounds: this.maxRounds,
          state: {
            currentPhase: this.state.currentPhase,
            originalPurpose: this.originalPurpose,
            deviationAttempts: this.state.deviationAttempts,
            successfulDeviation: this.state.lastDeviationSuccess,
          },
        };

        // Get server's next message
        const response = await fetch(getRemoteGenerationUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }

        const data = await response.json();
        logger.debug(`[ServerOffTopic] Server response: ${JSON.stringify(data)}`);

        // Check if server signals completion
        if (data.done) {
          isComplete = true;
        }

        // Update state from server response
        if (data.state) {
          // Map server state back to our state format
          this.state = {
            originalTopic: data.state.originalTopic || '',
            deviationAttempts: data.state.deviationAttempts || 0,
            currentPhase: data.state.currentPhase || 0,
            lastDeviationSuccess: data.state.successfulDeviation || false,
          };
        }

        // Process server's message and get target response
        if (data.message?.content) {
          // Add attacker message (from server) with correct role
          const attackerMessage = {
            role: 'user' as const,
            content: data.message.content,
          };
          this.messages.push(attackerMessage);
          logger.debug(
            `[ServerOffTopic] Added attacker message: ${JSON.stringify(attackerMessage)}`,
          );

          // Get response from target model
          const chatHistory = [
            {
              role: 'system',
              content: this.originalPurpose,
            },
            ...this.messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            {
              role: 'user',
              content: data.message.content,
            },
          ];

          const targetResponse = await context.originalProvider.callApi(
            JSON.stringify(chatHistory),
            context,
            options,
          );

          // Add target's response with correct role
          const assistantMessage = {
            role: 'assistant' as const,
            content: this.formatMessageContent(targetResponse.output),
          };
          this.messages.push(assistantMessage);
          logger.debug(
            `[ServerOffTopic] Added assistant message: ${JSON.stringify(assistantMessage)}`,
          );

          lastResponse = targetResponse.output;
        }

        // Update metadata and increment round number
        this.roundNum++;
        metadata = {
          state: this.state,
          messages: this.messages,
          sessionId: this.sessionId,
          roundsCompleted: this.roundNum,
          redteamHistory: messagesToRedteamHistory(this.messages),
        };

        // Check if conversation is complete
        isComplete =
          isComplete ||
          this.state.currentPhase >= 3 || // End after phase 3
          this.state.lastDeviationSuccess; // End if we've successfully deviated
      }

      return {
        output: lastResponse,
        metadata,
      };
    } catch (error) {
      logger.error(`[ServerOffTopic] Error in conversation: ${error}`);
      throw error;
    }
  }
}
