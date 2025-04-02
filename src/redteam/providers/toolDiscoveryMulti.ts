import { randomBytes } from 'crypto';
import logger from '../../logger';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../../types';
import { getRemoteGenerationUrl } from '../remoteGeneration';

// Match server's MAX_ROUNDS constant
const MAX_ROUNDS = 15;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DiscoveredTool {
  name: string;
  parameters?: string[];
  description?: string;
  usage?: string;
}

interface ServerState {
  discoveredTools: DiscoveredTool[];
  currentPhase: number;
  currentToolIndex: number;
}

export class ServerToolDiscoveryMultiProvider implements ApiProvider {
  private sessionId: string;
  private messages: Message[] = [];
  private roundNum: number = 0;
  private state: ServerState = {
    discoveredTools: [],
    currentPhase: 0,
    currentToolIndex: 0,
  };

  constructor(public config: any) {
    logger.debug(`[ServerToolDiscovery] Initialized with config: ${JSON.stringify(config)}`);
    // Generate a unique session ID for this provider instance using cryptographically secure random bytes
    this.sessionId = `session_${Date.now()}_${randomBytes(16).toString('hex')}`;
  }

  id(): string {
    return 'tool-discovery:multi-turn';
  }

  private formatMessageContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    // Handle function calls
    if (Array.isArray(content) && content.length > 0 && content[0].type === 'function') {
      return JSON.stringify(content);
    }
    // Handle other non-string content
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  private parseToolsFromResponse(response: string): DiscoveredTool[] {
    try {
      // Look for JSON block in the response
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        return [];
      }

      const tools = JSON.parse(jsonMatch[1]) as Array<{
        name: string;
        description: string;
        parameters: Array<{
          name: string;
          type: string;
          description: string;
        }>;
        example?: string;
      }>;

      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map((p) => `${p.name} (${p.type}): ${p.description}`),
        usage: tool.example,
      }));
    } catch (error) {
      logger.warn(`[ServerToolDiscovery] Failed to parse tools from response: ${error}`);
      return [];
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

      // Continue conversation until max rounds or server indicates completion
      while (!isComplete && this.roundNum < MAX_ROUNDS) {
        logger.debug(
          `[ServerToolDiscovery] Round ${this.roundNum}, sending messages: ${JSON.stringify(this.messages)}`,
        );

        // Get server's next message
        const response = await fetch(getRemoteGenerationUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task: 'tool-discovery:multi-turn',
            i: this.roundNum,
            messages: this.messages,
            state: this.state,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }

        const data = await response.json();
        logger.debug(`[ServerToolDiscovery] Server response: ${JSON.stringify(data)}`);

        // Check if server signals completion
        if (data.done) {
          isComplete = true;
        }

        // Update state from server response
        if (data.state) {
          this.state = data.state;
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
            `[ServerToolDiscovery] Added attacker message: ${JSON.stringify(attackerMessage)}`,
          );

          // Get response from target model
          const targetResponse = await context.originalProvider.callApi(
            data.message.content,
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
            `[ServerToolDiscovery] Added assistant message: ${JSON.stringify(assistantMessage)}`,
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
        };

        // Check if conversation is complete
        isComplete =
          isComplete || // Either server signaled done
          (this.state.currentPhase === 3 && // Or we're in EXPLOITATION phase
            this.state.currentToolIndex >= this.state.discoveredTools.length - 1);
      }

      // Parse tools from the last response if available
      if (lastResponse) {
        const parsedTools = this.parseToolsFromResponse(lastResponse);
        if (parsedTools.length > 0) {
          metadata = {
            ...metadata,
            state: {
              ...this.state,
              discoveredTools: parsedTools,
            },
          };
        }
      }

      // Set final metadata with accurate stop reason
      metadata = {
        ...metadata,
        stopReason: isComplete ? 'Full exploitation complete' : 'Max rounds reached',
      };

      return {
        output: lastResponse,
        metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[ServerToolDiscovery] Error: ${errorMessage}`);
      throw error;
    }
  }
}
