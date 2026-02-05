import { WebClient } from '@slack/web-api';
import logger from '../logger';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';

export interface SlackProviderOptions {
  id?: string;
  config?: {
    /** Slack Bot User OAuth Token (xoxb-...) */
    token?: string;
    /** Channel ID (C...) or user ID (U...) to send messages to */
    channel?: string;
    /** Response collection strategy */
    responseStrategy?: 'first' | 'user' | 'timeout';
    /** User ID to wait for responses from (when responseStrategy is 'user') */
    waitForUser?: string;
    /** Timeout in milliseconds (default: 60000) */
    timeout?: number;
    /** Whether to include thread timestamp in output */
    includeThread?: boolean;
    /** Custom message formatting function */
    formatMessage?: (prompt: string) => string;
    /** Whether to mention users in the message */
    mentionUsers?: boolean;
    /** Thread timestamp to reply in */
    threadTs?: string;
  };
}

interface SlackMessage {
  type: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}

export class SlackProvider implements ApiProvider {
  private client: WebClient;
  private options: SlackProviderOptions;

  constructor(options: SlackProviderOptions = {}) {
    this.options = options;

    const token = options.config?.token || process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'Slack provider requires a token. Set SLACK_BOT_TOKEN or provide it in config.',
      );
    }

    if (!options.config?.channel) {
      throw new Error('Slack provider requires a channel ID');
    }

    this.client = new WebClient(token);
  }

  id(): string {
    return this.options.id || 'slack';
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    _options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config = this.options.config!;
    const channel = config.channel!;
    const timeout = config.timeout || 60000;
    const responseStrategy = config.responseStrategy || 'first';

    try {
      // Format the message if a custom formatter is provided
      const messageText = config.formatMessage ? config.formatMessage(prompt) : prompt;

      // Send the message
      const startTime = Date.now();
      const postResult = await this.client.chat.postMessage({
        channel,
        text: messageText,
        thread_ts: config.threadTs,
        // Parse mode for better formatting
        mrkdwn: true,
      });

      if (!postResult.ok || !postResult.ts) {
        throw new Error('Failed to post message to Slack');
      }

      const messageTs = postResult.ts;

      // Handle different response collection strategies
      let responseText: string;
      const responseMetadata: Record<string, any> = {
        messageTs,
        channel,
      };

      switch (responseStrategy) {
        case 'timeout':
          // Just wait for the timeout and collect all responses
          responseText = await this.collectResponsesUntilTimeout(channel, messageTs, timeout);
          break;

        case 'user':
          if (!config.waitForUser) {
            throw new Error('waitForUser must be specified when using "user" response strategy');
          }
          responseText = await this.waitForUserResponse(
            channel,
            messageTs,
            config.waitForUser,
            timeout,
          );
          responseMetadata.waitForUser = config.waitForUser;
          break;

        case 'first':
        default:
          responseText = await this.waitForFirstResponse(channel, messageTs, timeout);
          break;
      }

      if (config.includeThread) {
        responseMetadata.threadTs = messageTs;
      }

      // Calculate response time
      responseMetadata.responseTime = Date.now() - startTime;

      return {
        output: responseText,
        metadata: responseMetadata,
      };
    } catch (error: any) {
      logger.error(`Slack provider error: ${error}`);

      // Handle specific Slack API errors
      if (error?.data?.error) {
        const slackError = error.data.error;
        switch (slackError) {
          case 'channel_not_found':
            return { error: `Channel ${channel} not found. Please check the channel ID.` };
          case 'not_in_channel':
            return { error: `Bot is not in channel ${channel}. Please invite the bot first.` };
          case 'missing_scope':
            return { error: 'Bot token is missing required scopes. Please check permissions.' };
          case 'ratelimited':
            return { error: 'Slack API rate limit exceeded. Please try again later.' };
          default:
            return { error: `Slack API error: ${slackError}` };
        }
      }

      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async waitForFirstResponse(
    channel: string,
    afterTs: string,
    timeout: number,
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Get conversation history
        const result = await this.client.conversations.history({
          channel,
          oldest: afterTs,
          limit: 10,
        });

        if (result.messages && result.messages.length > 0) {
          // Find first non-bot message after our message
          const response = (result.messages as unknown as SlackMessage[])
            .filter((msg) => msg.ts !== afterTs && msg.type === 'message' && !msg.bot_id)
            .sort((a, b) => parseFloat(a.ts || '0') - parseFloat(b.ts || '0'))[0];

          if (response && response.text) {
            return response.text;
          }
        }

        // Wait before polling again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error fetching Slack messages: ${error}`);
        throw error;
      }
    }

    throw new Error(`Timeout waiting for Slack response after ${timeout}ms`);
  }

  private async waitForUserResponse(
    channel: string,
    afterTs: string,
    userId: string,
    timeout: number,
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.client.conversations.history({
          channel,
          oldest: afterTs,
          limit: 20,
        });

        if (result.messages && result.messages.length > 0) {
          const response = (result.messages as unknown as SlackMessage[])
            .filter((msg) => msg.ts !== afterTs && msg.type === 'message' && msg.user === userId)
            .sort((a, b) => parseFloat(a.ts || '0') - parseFloat(b.ts || '0'))[0];

          if (response && response.text) {
            return response.text;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error fetching Slack messages: ${error}`);
        throw error;
      }
    }

    throw new Error(`Timeout waiting for response from user ${userId} after ${timeout}ms`);
  }

  private async collectResponsesUntilTimeout(
    channel: string,
    afterTs: string,
    timeout: number,
  ): Promise<string> {
    const startTime = Date.now();
    const responses: string[] = [];
    const seenTimestamps = new Set<string>([afterTs]);

    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.client.conversations.history({
          channel,
          oldest: afterTs,
          limit: 50,
        });

        if (result.messages && result.messages.length > 0) {
          const newResponses = (result.messages as unknown as SlackMessage[])
            .filter(
              (msg) => !seenTimestamps.has(msg.ts || '') && msg.type === 'message' && !msg.bot_id,
            )
            .sort((a, b) => parseFloat(a.ts || '0') - parseFloat(b.ts || '0'));

          newResponses.forEach((msg) => {
            if (msg.ts) {
              seenTimestamps.add(msg.ts);
            }
            if (msg.text) {
              responses.push(msg.text);
            }
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Error fetching Slack messages: ${error}`);
        throw error;
      }
    }

    return responses.join('\n\n');
  }
}

// Export convenience function for creating from provider string
export function createSlackProvider(
  channel: string,
  options?: Omit<SlackProviderOptions, 'config'>,
): SlackProvider {
  return new SlackProvider({
    ...options,
    config: {
      channel,
    },
  });
}
