import { randomBytes } from 'crypto';
import logger from '../../logger';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../../types';
import { getRemoteGenerationUrl } from '../remoteGeneration';
import type { Message } from './shared';
import { messagesToRedteamHistory } from './shared';

// Match server's MAX_ROUNDS constant
const MAX_ROUNDS = 10;

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

  constructor(public config: any) {
    logger.debug(`[ServerOffTopic] Initialized with config: ${JSON.stringify(config)}`);
    this.sessionId = `session_${Date.now()}_${randomBytes(16).toString('hex')}`;
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
      while (!isComplete && this.roundNum < MAX_ROUNDS) {
        logger.debug(
          `[ServerOffTopic] Round ${this.roundNum}, sending messages: ${JSON.stringify(this.messages)}`,
        );

        const requestPayload = {
          task: 'off-topic',
          i: this.roundNum,
          messages: this.messages,
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

export { MAX_ROUNDS };
