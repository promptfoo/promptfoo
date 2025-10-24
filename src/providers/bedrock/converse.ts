import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { parseChatPrompt } from '../shared';
import { AwsBedrockGenericProvider } from './index';
import type {
  ConverseCommandInput,
  ConverseCommandOutput,
  Message,
} from '@aws-sdk/client-bedrock-runtime';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
} from '../../types/providers';
import type { TokenUsage } from '../../types/shared';

import type { BedrockOptions } from './index';

export interface AwsBedrockConverseOptions extends BedrockOptions {
  // Future: add Converse-specific options here
}

/**
 * AWS Bedrock Converse API Provider
 *
 * Supports two modes:
 * 1. Prompt ARN mode: Uses bedrock://PROMPT_ID URLs with native variable substitution
 * 2. Messages mode: Works with regular prompts (text or chat format)
 *
 * Key benefits over invokeModel:
 * - Unified API across all Bedrock models
 * - Native prompt ARN support
 * - Streaming support
 * - Tool use (function calling)
 * - Better guardrails integration
 */
export class AwsBedrockConverseProvider
  extends AwsBedrockGenericProvider
  implements ApiProvider
{
  constructor(
    modelName: string,
    options: {
      config?: AwsBedrockConverseOptions & Record<string, any>;
      id?: string;
      env?: Record<string, string | undefined>;
    } = {},
  ) {
    super(modelName, options);
  }

  id(): string {
    return `bedrock-converse:${this.modelName}`;
  }

  toString(): string {
    return `[Amazon Bedrock Converse Provider ${this.modelName}]`;
  }


  /**
   * Parse prompt into Converse API message format
   */
  private parseMessagesForConverse(prompt: string): Message[] {
    // Try to parse as chat format first
    try {
      const parsed = parseChatPrompt<
        Array<{ role: string; content: string | any[] | Record<string, any> }>
      >(prompt, []);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        // Fallback to plain text
        return [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ];
      }

      // Filter out system messages (handled separately in Converse API)
      const userMessages = parsed.filter((msg: any) => msg.role !== 'system');

      // Convert to Converse format
      return userMessages.map((msg: any) => {
        // Handle multimodal content (array of content blocks)
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role as 'user' | 'assistant',
            content: msg.content, // Already in correct format with text/image/document blocks
          };
        }

        // Handle object content (e.g., from Nova multimodal format)
        if (typeof msg.content === 'object' && msg.content !== null) {
          // If it's already a content block with image/document/text, wrap in array
          if ('image' in msg.content || 'document' in msg.content || 'text' in msg.content) {
            return {
              role: msg.role as 'user' | 'assistant',
              content: [msg.content],
            };
          }
          // Otherwise stringify as text
          return {
            role: msg.role as 'user' | 'assistant',
            content: [{ text: JSON.stringify(msg.content) }],
          };
        }

        // Handle simple string content
        return {
          role: msg.role as 'user' | 'assistant',
          content: [{ text: String(msg.content) }],
        };
      });
    } catch {
      // Fallback to plain text
      return [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ];
    }
  }

  /**
   * Extract system messages from prompt
   */
  private extractSystemPrompt(prompt: string): string | undefined {
    try {
      const parsed = parseChatPrompt<
        Array<{ role: string; content: string | Record<string, any> }>
      >(prompt, []);

      if (!Array.isArray(parsed)) {
        return undefined;
      }

      const systemMessages = parsed.filter((msg: any) => msg.role === 'system');

      if (systemMessages.length > 0) {
        return systemMessages.map((msg: any) => String(msg.content)).join('\n');
      }
    } catch {
      // Not a chat format
    }

    return undefined;
  }

  /**
   * Call Converse API with bedrock:// prompt URL
   * Fetches the prompt template, renders variables, then uses Converse
   */
  private async callWithBedrockPrompt(
    bedrockPromptUrl: string,
    context: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const { parseBedrockPromptUrl } = await import('../../integrations/bedrockPrompt');
    const { getPrompt } = await import('../../integrations/bedrockPrompt');

    // Parse the URL to get prompt ID and version
    const { promptId, version } = parseBedrockPromptUrl(bedrockPromptUrl);

    logger.debug('Fetching Bedrock prompt for Converse API', {
      promptId,
      version,
      variables: Object.keys(context.vars || {}),
    });

    // Fetch and render the prompt template with variables
    const renderedPrompt = await getPrompt(promptId, version, undefined, context.vars);

    // Now use the rendered prompt with Converse API
    return this.callWithMessages(renderedPrompt, context);
  }

  /**
   * Call Converse API with messages
   */
  private async callWithMessages(
    prompt: string,
    context: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const messages = this.parseMessagesForConverse(prompt);
    const systemPrompt = this.extractSystemPrompt(prompt);
    const toolConfig = this.buildToolConfig(context);
    const additionalModelFields = this.buildAdditionalModelFields(context);

    const converseInput: ConverseCommandInput = {
      modelId: this.modelName,
      messages,
      ...(systemPrompt ? { system: [{ text: systemPrompt }] } : {}),
      inferenceConfig: this.buildInferenceConfig(context),
      ...(toolConfig ? { toolConfig } : {}),
      ...(additionalModelFields ? { additionalModelRequestFields: additionalModelFields } : {}),
      ...(this.config.guardrailIdentifier
        ? {
            guardrailConfig: {
              guardrailIdentifier: String(this.config.guardrailIdentifier),
              guardrailVersion: this.config.guardrailVersion
                ? String(this.config.guardrailVersion)
                : undefined,
            },
          }
        : {}),
    };

    logger.debug('Calling Bedrock Converse API with messages', {
      modelId: this.modelName,
      messageCount: messages.length,
      hasSystem: !!systemPrompt,
      hasTools: !!toolConfig,
      hasAdditionalFields: !!additionalModelFields,
    });

    return this.executeConverseRequest(converseInput);
  }

  /**
   * Build inference config from context
   */
  private buildInferenceConfig(context: CallApiContextParams): any {
    const config = { ...this.config, ...context.prompt?.config };

    return {
      ...(config.max_tokens ? { maxTokens: config.max_tokens } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.top_p !== undefined ? { topP: config.top_p } : {}),
      ...(config.stop_sequences ? { stopSequences: config.stop_sequences } : {}),
    };
  }

  /**
   * Build tool configuration for Converse API
   */
  private buildToolConfig(context: CallApiContextParams): any | undefined {
    const config = { ...this.config, ...context.prompt?.config };

    if (config.toolConfig || config.tools) {
      // If toolConfig is provided directly, use it
      if (config.toolConfig) {
        return config.toolConfig;
      }

      // Otherwise convert tools to toolConfig format
      if (config.tools && Array.isArray(config.tools)) {
        return {
          tools: config.tools,
          ...(config.tool_choice ? { toolChoice: config.tool_choice } : {}),
        };
      }
    }

    return undefined;
  }

  /**
   * Build additional model request fields for model-specific parameters
   */
  private buildAdditionalModelFields(context: CallApiContextParams): any | undefined {
    const config = { ...this.config, ...context.prompt?.config };
    const fields: Record<string, any> = {};

    // Claude-specific parameters
    if (config.thinking) {
      fields.thinking = config.thinking;
    }
    if (config.showThinking !== undefined) {
      fields.showThinking = config.showThinking;
    }
    if (config.anthropic_version) {
      fields.anthropic_version = config.anthropic_version;
    }

    // OpenAI-specific parameters
    if (config.reasoning_effort) {
      fields.reasoning_effort = config.reasoning_effort;
    }

    // Pass through any other additionalModelRequestFields
    if (config.additionalModelRequestFields) {
      Object.assign(fields, config.additionalModelRequestFields);
    }

    return Object.keys(fields).length > 0 ? fields : undefined;
  }

  /**
   * Execute Converse API request
   */
  private async executeConverseRequest(
    input: ConverseCommandInput,
  ): Promise<ProviderResponse> {
    const cache = await getCache();
    const cacheKey = `bedrock-converse:${this.modelName}:${JSON.stringify(input)}`;

    // Check cache
    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug('Using cached Bedrock Converse response');
        return JSON.parse(cachedResponse as string);
      }
    }

    try {
      const bedrockRuntime = await this.getBedrockInstance();
      const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

      const command = new ConverseCommand(input);
      const response: ConverseCommandOutput = await bedrockRuntime.send(command);

      logger.debug('Bedrock Converse API response received', {
        stopReason: response.stopReason,
        usage: response.usage,
      });

      const providerResponse = this.formatConverseResponse(response);

      // Cache the response
      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(providerResponse));
      }

      return providerResponse;
    } catch (err) {
      logger.error('Bedrock Converse API error', { error: err });
      return {
        error: `Bedrock Converse API error: ${String(err)}`,
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }

  /**
   * Format Converse API response
   */
  private formatConverseResponse(response: ConverseCommandOutput): ProviderResponse {
    // Extract text and tool use from response
    let output = '';
    const toolCalls: any[] = [];

    if (response.output?.message?.content) {
      for (const content of response.output.message.content) {
        if (content.text) {
          output += content.text;
        }
        if (content.toolUse) {
          toolCalls.push(content.toolUse);
          // Also include tool use in output for visibility
          output += `\n[Tool Use: ${content.toolUse.name}]`;
        }
      }
    }

    // Extract token usage
    const tokenUsage: TokenUsage = {
      total: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0),
      prompt: response.usage?.inputTokens || 0,
      completion: response.usage?.outputTokens || 0,
      cached: 0,
    };

    // Build metadata
    const metadata: Record<string, any> = {
      stopReason: response.stopReason,
    };

    if (toolCalls.length > 0) {
      metadata.toolCalls = toolCalls;
    }

    if (response.trace) {
      metadata.trace = response.trace;
    }

    return {
      output,
      tokenUsage,
      cost: this.calculateCost(tokenUsage),
      metadata,
    };
  }

  /**
   * Calculate cost (placeholder - would need pricing data)
   */
  private calculateCost(tokenUsage: TokenUsage): number | undefined {
    // TODO: Implement cost calculation based on model pricing
    return undefined;
  }

  /**
   * Main API call method
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const ctx: CallApiContextParams = context || { vars: {}, prompt: { raw: prompt, label: prompt } };

    // Check if using bedrock:// prompt
    if (prompt.startsWith('bedrock://')) {
      telemetry.record('feature_used', {
        feature: 'bedrock_converse_with_bedrock_prompt',
      });
      return this.callWithBedrockPrompt(prompt, ctx);
    }

    // Otherwise use messages mode
    telemetry.record('feature_used', {
      feature: 'bedrock_converse_messages',
    });
    return this.callWithMessages(prompt, ctx);
  }
}
