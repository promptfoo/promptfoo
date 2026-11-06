/**
 * ElevenLabs Conversation History Provider
 *
 * Retrieves and manages past agent conversation data
 */

import logger from '../../../logger';
import { getElevenLabsApiKey } from '../auth';
import { ElevenLabsClient } from '../client';

import type {
  ApiProvider,
  CallApiContextParams,
  EnvOverrides,
  ProviderResponse,
} from '../../../types';
import type { ConversationHistoryConfig, ConversationHistoryResponse } from './types';

interface ConversationListItem extends Omit<ConversationHistoryResponse, 'status' | 'created_at'> {
  status: string;
  created_at?: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  message_count?: number;
}

/**
 * Provider for retrieving ElevenLabs conversation history
 *
 * Usage:
 * - Retrieve specific conversation by ID
 * - List all conversations for an agent
 * - Filter conversations by date range or status
 * - Export conversation transcripts and metadata
 */
export class ElevenLabsHistoryProvider implements ApiProvider {
  private client: ElevenLabsClient;
  private env?: EnvOverrides;
  config: ConversationHistoryConfig;

  constructor(
    modelName: string,
    options: {
      config?: Partial<ConversationHistoryConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    this.env = options.env;
    this.config = this.parseConfig(modelName, options);

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'ELEVENLABS_API_KEY environment variable is not set. Please set it to use ElevenLabs History.',
      );
    }

    this.client = new ElevenLabsClient({
      apiKey,
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
    });
  }

  id(): string {
    return this.config.label || 'elevenlabs:history';
  }

  toString(): string {
    return `[ElevenLabs History Provider: ${this.config.agentId || 'all'}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const startTime = Date.now();

    // Parse conversation ID from prompt or context
    const conversationIdVar = context?.vars?.conversationId;
    const conversationId =
      typeof conversationIdVar === 'string' ? conversationIdVar : prompt.trim();

    // If specific conversation ID provided, retrieve it
    if (conversationId && conversationId.length > 0 && !conversationId.includes('*')) {
      return this.getConversation(conversationId, startTime);
    }

    // Otherwise, list conversations for agent
    return this.listConversations(startTime, context);
  }

  /**
   * Retrieve a specific conversation by ID
   */
  private async getConversation(
    conversationId: string,
    startTime: number,
  ): Promise<ProviderResponse> {
    logger.debug('[ElevenLabs History] Retrieving conversation', {
      conversationId,
    });

    try {
      const response = await this.client.get<ConversationHistoryResponse>(
        `/convai/conversations/${conversationId}`,
      );

      const latency = Date.now() - startTime;

      return {
        output: JSON.stringify(response, null, 2),
        metadata: {
          conversationId: response.conversation_id,
          agentId: response.agent_id,
          status: response.status,
          duration: response.duration_seconds,
          turnCount: response.history?.length || 0,
          latency,
        },
      };
    } catch (error) {
      logger.error('[ElevenLabs History] Failed to retrieve conversation', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        error: `Failed to retrieve conversation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List conversations for an agent
   */
  private async listConversations(
    startTime: number,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const agentId = context?.vars?.agentId || this.config.agentId;

    if (!agentId) {
      return {
        error:
          'Agent ID is required to list conversations. Provide agentId in config or context.vars',
      };
    }

    logger.debug('[ElevenLabs History] Listing conversations', {
      agentId,
    });

    try {
      // Build query parameters
      const params = new URLSearchParams({ agent_id: String(agentId) });
      for (const [variable, parameter] of [
        ['startDate', 'call_start_after_unix'],
        ['endDate', 'call_start_before_unix'],
      ]) {
        const value = context?.vars?.[variable];
        if (value !== undefined && value !== null) {
          const isNumeric =
            typeof value === 'number' ||
            (typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim()));
          const seconds = isNumeric ? Number(value) : Date.parse(String(value)) / 1000;
          if (!Number.isFinite(seconds)) {
            throw new Error(
              `Invalid ${variable}: expected an ISO date or Unix timestamp in seconds`,
            );
          }
          params.set(parameter, String(Math.floor(seconds)));
        }
      }
      if (context?.vars?.limit !== undefined) {
        params.set('page_size', String(context.vars.limit));
      }
      if (context?.vars?.cursor !== undefined) {
        params.set('cursor', String(context.vars.cursor));
      }

      // Fetch conversations
      const url = `/convai/conversations?${params}`;
      const response = await this.client.get<{
        conversations: ConversationListItem[];
        has_more?: boolean;
        next_cursor?: string | null;
      }>(url);

      // The list API has no positive status filter. Apply it to this page locally.
      const status = context?.vars?.status;
      const nativeStatus =
        status === 'completed' ? 'done' : status === 'in_progress' ? 'in-progress' : status;
      const conversations = response.conversations.filter(
        (conv) => !status || conv.status === status || conv.status === nativeStatus,
      );

      const latency = Date.now() - startTime;

      // Format summary
      const summary = {
        agent_id: agentId,
        total_conversations: conversations.length,
        has_more: response.has_more,
        next_cursor: response.next_cursor,
        conversations: conversations.map((conv) => ({
          conversation_id: conv.conversation_id,
          status: conv.status,
          duration_seconds: conv.call_duration_secs ?? conv.duration_seconds,
          turn_count: conv.message_count ?? conv.history?.length ?? 0,
          created_at:
            conv.start_time_unix_secs === undefined
              ? conv.created_at
              : new Date(conv.start_time_unix_secs * 1000).toISOString(),
        })),
      };

      return {
        output: JSON.stringify(summary, null, 2),
        metadata: {
          agentId,
          conversationCount: conversations.length,
          hasMore: response.has_more,
          nextCursor: response.next_cursor,
          latency,
        },
      };
    } catch (error) {
      logger.error('[ElevenLabs History] Failed to list conversations', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        error: `Failed to list conversations: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return getElevenLabsApiKey(this, () => this.env);
  }

  /**
   * Parse configuration from constructor options
   */
  private parseConfig(
    _modelName: string,
    options: {
      config?: Partial<ConversationHistoryConfig>;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    },
  ): ConversationHistoryConfig {
    const { config } = options;

    return {
      apiKey: config?.apiKey,
      apiKeyEnvar: config?.apiKeyEnvar || 'ELEVENLABS_API_KEY',
      baseUrl: config?.baseUrl,
      timeout: config?.timeout || 30000,
      agentId: config?.agentId,
      label: options.label || config?.label || options.id,
    };
  }
}
