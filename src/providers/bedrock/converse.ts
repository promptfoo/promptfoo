/**
 * AWS Bedrock Converse API Provider
 *
 * This provider implements the AWS Bedrock Converse API, which provides a unified
 * interface for all Bedrock models. It supports:
 * - Extended thinking (reasoning/ultrathink) for Claude models
 * - Tool calling with standardized format
 * - Streaming responses via ConverseStream
 * - Performance configuration (latency optimization, service tiers)
 * - Guardrails integration
 * - Cache token tracking
 */

import path from 'path';

import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import telemetry from '../../telemetry';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { type TargetSpanContext, withTargetSpan } from '../../tracing/targetTracer';
import { isJavascriptFile } from '../../util/fileExtensions';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { AwsBedrockGenericProvider, type BedrockOptions } from './base';
import type {
  ContentBlock,
  ConverseCommandInput,
  ConverseCommandOutput,
  ConverseStreamCommandInput,
  GuardrailConfiguration,
  GuardrailTrace,
  InferenceConfiguration,
  Message,
  PerformanceConfiguration,
  ServiceTier,
  SystemContentBlock,
  Tool,
  ToolChoice,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/providers';
import type { TokenUsage, VarValue } from '../../types/shared';

/**
 * Configuration options for the Bedrock Converse API provider
 * Extends base BedrockOptions with Converse-specific parameters
 */
export interface BedrockConverseOptions extends BedrockOptions {
  // Inference configuration (standard Converse API params)
  maxTokens?: number;
  max_tokens?: number; // Alias for compatibility
  temperature?: number;
  topP?: number;
  top_p?: number; // Alias for compatibility
  stopSequences?: string[];
  stop?: string[]; // Alias for compatibility

  // Extended thinking (Claude models)
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };

  // Reasoning configuration (Amazon Nova 2 models)
  // Note: When reasoning is enabled, temperature/topP/topK must NOT be set
  // When maxReasoningEffort is 'high', maxTokens must also NOT be set
  reasoningConfig?: {
    type: 'enabled' | 'disabled';
    maxReasoningEffort?: 'low' | 'medium' | 'high';
  };

  // Performance configuration
  performanceConfig?: {
    latency: 'standard' | 'optimized';
  };
  serviceTier?: {
    type: 'priority' | 'default' | 'flex';
  };

  // Tool configuration
  tools?: BedrockConverseToolConfig[];
  toolChoice?: 'auto' | 'any' | { tool: { name: string } };

  // Function tool callbacks for executing tools locally
  // Keys are function names, values are file:// references or inline function strings
  functionToolCallbacks?: Record<string, string | Function>;

  // Additional model-specific parameters
  additionalModelRequestFields?: Record<string, unknown>;
  additionalModelResponseFieldPaths?: string[];

  // Streaming
  streaming?: boolean;
}

/**
 * Tool configuration for Converse API
 */
export interface BedrockConverseToolConfig {
  toolSpec?: {
    name: string;
    description?: string;
    inputSchema?: {
      json: DocumentType;
    };
  };
  // Support for OpenAI-compatible format
  type?: 'function';
  function?: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
  // Support for Anthropic format
  name?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

/**
 * Bedrock model pricing per 1M tokens
 * Prices as of 2025 - may need updates
 */
const BEDROCK_CONVERSE_PRICING: Record<string, { input: number; output: number }> = {
  // Claude Opus 4.5
  'anthropic.claude-opus-4-5': { input: 5, output: 25 },
  // Claude Opus 4/4.1
  'anthropic.claude-opus-4': { input: 15, output: 75 },
  // Claude Sonnet 4/4.5
  'anthropic.claude-sonnet-4': { input: 3, output: 15 },
  // Claude Haiku 4.5
  'anthropic.claude-haiku-4': { input: 1, output: 5 },
  // Claude 3.x
  'anthropic.claude-3-opus': { input: 15, output: 75 },
  'anthropic.claude-3-5-sonnet': { input: 3, output: 15 },
  'anthropic.claude-3-7-sonnet': { input: 3, output: 15 },
  'anthropic.claude-3-5-haiku': { input: 0.8, output: 4 },
  'anthropic.claude-3-haiku': { input: 0.25, output: 1.25 },
  // Amazon Nova
  'amazon.nova-micro': { input: 0.035, output: 0.14 },
  'amazon.nova-lite': { input: 0.06, output: 0.24 },
  'amazon.nova-pro': { input: 0.8, output: 3.2 },
  'amazon.nova-premier': { input: 2.5, output: 10 },
  // Amazon Nova 2 (reasoning models) - pricing estimated, verify at aws.amazon.com/bedrock/pricing
  'amazon.nova-2-lite': { input: 0.15, output: 0.6 },
  // Amazon Titan Text
  'amazon.titan-text-lite': { input: 0.15, output: 0.2 },
  'amazon.titan-text-express': { input: 0.8, output: 1.6 },
  'amazon.titan-text-premier': { input: 0.5, output: 1.5 },
  // Meta Llama
  'meta.llama3-1-8b': { input: 0.22, output: 0.22 },
  'meta.llama3-1-70b': { input: 0.99, output: 0.99 },
  'meta.llama3-1-405b': { input: 5.32, output: 16 },
  'meta.llama3-2-1b': { input: 0.1, output: 0.1 },
  'meta.llama3-2-3b': { input: 0.15, output: 0.15 },
  'meta.llama3-2-11b': { input: 0.35, output: 0.35 },
  'meta.llama3-2-90b': { input: 2.0, output: 2.0 },
  'meta.llama3-3-70b': { input: 0.99, output: 0.99 },
  'meta.llama4-scout': { input: 0.17, output: 0.68 },
  'meta.llama4-maverick': { input: 0.17, output: 0.68 },
  'meta.llama4': { input: 1.0, output: 3.0 },
  // Mistral
  'mistral.mistral-7b': { input: 0.15, output: 0.2 },
  'mistral.mixtral-8x7b': { input: 0.45, output: 0.7 },
  'mistral.mistral-large': { input: 4, output: 12 },
  'mistral.mistral-small': { input: 1, output: 3 },
  'mistral.pixtral-large': { input: 2, output: 6 },
  // AI21 Jamba
  'ai21.jamba-1-5-mini': { input: 0.2, output: 0.4 },
  'ai21.jamba-1-5-large': { input: 2, output: 8 },
  // Cohere
  'cohere.command-r': { input: 0.5, output: 1.5 },
  'cohere.command-r-plus': { input: 3, output: 15 },
  // DeepSeek
  'deepseek.deepseek-r1': { input: 1.35, output: 5.4 },
  'deepseek.r1': { input: 1.35, output: 5.4 },
  // Qwen
  'qwen.qwen3-32b': { input: 0.2, output: 0.6 },
  'qwen.qwen3-235b': { input: 0.18, output: 0.54 },
  'qwen.qwen3-coder-30b': { input: 0.2, output: 0.6 },
  'qwen.qwen3-coder-480b': { input: 1.5, output: 7.5 },
  'qwen.qwen3': { input: 0.5, output: 1.5 },
  // Writer Palmyra
  'writer.palmyra-x5': { input: 0.6, output: 6 },
  'writer.palmyra-x4': { input: 2.5, output: 10 },
  // OpenAI GPT-OSS
  'openai.gpt-oss-120b': { input: 1.0, output: 3.0 },
  'openai.gpt-oss-20b': { input: 0.3, output: 0.9 },
};

/**
 * Calculate cost based on model and token usage
 */
function calculateBedrockConverseCost(
  modelId: string,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }

  // Find matching pricing
  const normalizedModelId = modelId.toLowerCase();
  for (const [modelPrefix, pricing] of Object.entries(BEDROCK_CONVERSE_PRICING)) {
    if (normalizedModelId.includes(modelPrefix)) {
      const inputCost = (promptTokens / 1_000_000) * pricing.input;
      const outputCost = (completionTokens / 1_000_000) * pricing.output;
      return inputCost + outputCost;
    }
  }

  return undefined;
}

/**
 * Convert various tool formats to Converse API format
 */
function convertToolsToConverseFormat(tools: BedrockConverseToolConfig[]): Tool[] {
  return tools.map((tool): Tool => {
    // Already in Converse format - cast to expected type
    if (tool.toolSpec) {
      return { toolSpec: tool.toolSpec } as Tool;
    }

    // OpenAI-compatible format
    if (tool.type === 'function' && tool.function) {
      return {
        toolSpec: {
          name: tool.function.name,
          description: tool.function.description,
          inputSchema: {
            json: (tool.function.parameters || {}) as DocumentType,
          },
        },
      } as Tool;
    }

    // Anthropic format
    if (tool.name) {
      return {
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: (tool.input_schema || {}) as DocumentType,
          },
        },
      } as Tool;
    }

    throw new Error(`Invalid tool configuration: ${JSON.stringify(tool)}`);
  });
}

/**
 * Convert tool choice to Converse API format
 */
function convertToolChoiceToConverseFormat(
  toolChoice: 'auto' | 'any' | { tool: { name: string } },
): ToolChoice {
  if (toolChoice === 'auto') {
    return { auto: {} };
  }
  if (toolChoice === 'any') {
    return { any: {} };
  }
  if (typeof toolChoice === 'object' && toolChoice.tool) {
    return { tool: { name: toolChoice.tool.name } };
  }
  return { auto: {} };
}

/**
 * Parse prompt into Converse API message format
 */
export function parseConverseMessages(prompt: string): {
  messages: Message[];
  system?: SystemContentBlock[];
} {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(prompt);
    if (Array.isArray(parsed)) {
      const systemMessages: SystemContentBlock[] = [];
      const messages: Message[] = [];

      for (const msg of parsed) {
        if (msg.role === 'system') {
          // System messages go to the system field
          const content =
            typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          systemMessages.push({ text: content });
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          // Convert content to ContentBlock format
          const contentBlocks: ContentBlock[] = [];

          if (typeof msg.content === 'string') {
            contentBlocks.push({ text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (typeof block === 'string') {
                contentBlocks.push({ text: block });
              } else if (block.type === 'text') {
                contentBlocks.push({ text: block.text });
              } else if (block.type === 'image' || block.image) {
                // Handle image content - multiple formats supported
                const imageData = block.image || block;
                let bytes: Buffer | undefined;
                let format: string = 'png';

                // Determine format from various sources
                if (imageData.format) {
                  format = imageData.format;
                } else if (imageData.source?.media_type) {
                  format = imageData.source.media_type.split('/')[1] || 'png';
                }

                // Get bytes from various sources
                if (imageData.source?.bytes) {
                  const rawBytes = imageData.source.bytes;
                  if (typeof rawBytes === 'string') {
                    // Check for data URL format: data:image/jpeg;base64,...
                    if (rawBytes.startsWith('data:')) {
                      const matches = rawBytes.match(/^data:image\/([^;]+);base64,(.+)$/);
                      if (matches) {
                        format = matches[1] === 'jpg' ? 'jpeg' : matches[1];
                        bytes = Buffer.from(matches[2], 'base64');
                      }
                    } else {
                      // Assume raw base64 string
                      bytes = Buffer.from(rawBytes, 'base64');
                    }
                  } else if (Buffer.isBuffer(rawBytes)) {
                    bytes = rawBytes;
                  }
                } else if (imageData.source?.data) {
                  // Anthropic format: {source: {type: 'base64', media_type: '...', data: '...'}}
                  bytes = Buffer.from(imageData.source.data, 'base64');
                }

                if (bytes) {
                  // Normalize format names for Converse API
                  if (format === 'jpg') {
                    format = 'jpeg';
                  }
                  contentBlocks.push({
                    image: {
                      format: format as 'png' | 'jpeg' | 'gif' | 'webp',
                      source: { bytes },
                    },
                  });
                } else {
                  logger.warn('Could not parse image content block', { block });
                }
              } else if (block.type === 'image_url' || block.image_url) {
                // OpenAI-compatible image_url format
                const imageUrl = block.image_url?.url || block.url;
                if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
                  const matches = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
                  if (matches) {
                    const format = matches[1] === 'jpg' ? 'jpeg' : matches[1];
                    const bytes = Buffer.from(matches[2], 'base64');
                    contentBlocks.push({
                      image: {
                        format: format as 'png' | 'jpeg' | 'gif' | 'webp',
                        source: { bytes },
                      },
                    });
                  }
                } else {
                  logger.warn('Unsupported image_url format (only data URLs supported)', {
                    imageUrl,
                  });
                }
              } else if (block.type === 'document' || block.document) {
                // Handle document content
                const docData = block.document || block;
                let bytes: Buffer | undefined;
                const format: string = docData.format || 'txt';
                const name: string = docData.name || 'document';

                if (docData.source?.bytes) {
                  const rawBytes = docData.source.bytes;
                  if (typeof rawBytes === 'string') {
                    // Check for data URL format
                    if (rawBytes.startsWith('data:')) {
                      const matches = rawBytes.match(/^data:[^;]+;base64,(.+)$/);
                      if (matches) {
                        bytes = Buffer.from(matches[1], 'base64');
                      }
                    } else {
                      bytes = Buffer.from(rawBytes, 'base64');
                    }
                  } else if (Buffer.isBuffer(rawBytes)) {
                    bytes = rawBytes;
                  }
                }

                if (bytes) {
                  contentBlocks.push({
                    document: {
                      format: format as
                        | 'pdf'
                        | 'csv'
                        | 'doc'
                        | 'docx'
                        | 'xls'
                        | 'xlsx'
                        | 'html'
                        | 'txt'
                        | 'md',
                      name,
                      source: { bytes },
                    },
                  });
                } else {
                  logger.warn('Could not parse document content block', { block });
                }
              } else if (block.type === 'tool_use' || block.toolUse) {
                const toolUseData = block.toolUse || block;
                contentBlocks.push({
                  toolUse: {
                    toolUseId: toolUseData.toolUseId || toolUseData.id,
                    name: toolUseData.name,
                    input: toolUseData.input,
                  },
                });
              } else if (block.type === 'tool_result' || block.toolResult) {
                const toolResultData = block.toolResult || block;
                contentBlocks.push({
                  toolResult: {
                    toolUseId: toolResultData.toolUseId || toolResultData.tool_use_id,
                    content: Array.isArray(toolResultData.content)
                      ? toolResultData.content.map((c: any) =>
                          typeof c === 'string' ? { text: c } : c,
                        )
                      : [{ text: String(toolResultData.content) }],
                    status: toolResultData.status,
                  },
                });
              } else {
                // Unknown block type, try to convert to text
                contentBlocks.push({ text: JSON.stringify(block) });
              }
            }
          } else {
            contentBlocks.push({ text: JSON.stringify(msg.content) });
          }

          messages.push({
            role: msg.role,
            content: contentBlocks,
          });
        }
      }

      return {
        messages,
        system: systemMessages.length > 0 ? systemMessages : undefined,
      };
    }
  } catch {
    // Not JSON, try line-based parsing
  }

  // Parse as line-based format or plain text
  const lines = prompt.split('\n');
  const messages: Message[] = [];
  let system: SystemContentBlock[] | undefined;
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      messages.push({
        role: currentRole,
        content: [{ text: currentContent.join('\n') }],
      });
      currentContent = [];
    }
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.toLowerCase().startsWith('system:')) {
      pushMessage();
      system = [{ text: trimmedLine.slice(7).trim() }];
      currentRole = null;
    } else if (trimmedLine.toLowerCase().startsWith('user:')) {
      pushMessage();
      currentRole = 'user';
      const content = trimmedLine.slice(5).trim();
      if (content) {
        currentContent.push(content);
      }
    } else if (trimmedLine.toLowerCase().startsWith('assistant:')) {
      pushMessage();
      currentRole = 'assistant';
      const content = trimmedLine.slice(10).trim();
      if (content) {
        currentContent.push(content);
      }
    } else if (currentRole) {
      currentContent.push(line);
    } else {
      // No role prefix, treat as user message
      currentRole = 'user';
      currentContent.push(line);
    }
  }

  pushMessage();

  // If no messages were parsed, treat entire prompt as user message
  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: [{ text: prompt }],
    });
  }

  return { messages, system };
}

/**
 * Extract text output from Converse API response content blocks
 */
function extractTextFromContentBlocks(
  content: ContentBlock[],
  showThinking: boolean = true,
): string {
  const parts: string[] = [];

  for (const block of content) {
    if ('text' in block && block.text) {
      parts.push(block.text);
    } else if ('reasoningContent' in block && block.reasoningContent) {
      // Handle extended thinking content
      const reasoning = block.reasoningContent;
      if (showThinking) {
        if ('reasoningText' in reasoning && reasoning.reasoningText) {
          const thinkingText = reasoning.reasoningText.text || '';
          const signature = reasoning.reasoningText.signature || '';
          parts.push(`<thinking>\n${thinkingText}\n</thinking>`);
          if (signature) {
            parts.push(`Signature: ${signature}`);
          }
        } else if ('redactedContent' in reasoning && reasoning.redactedContent) {
          parts.push('<thinking>[Redacted]</thinking>');
        }
      }
    } else if ('toolUse' in block && block.toolUse) {
      // Format tool use for output
      parts.push(
        JSON.stringify({
          type: 'tool_use',
          id: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: block.toolUse.input,
        }),
      );
    }
  }

  return parts.join('\n\n');
}

/**
 * AWS Bedrock Converse API Provider
 */
export class AwsBedrockConverseProvider extends AwsBedrockGenericProvider implements ApiProvider {
  declare config: BedrockConverseOptions;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(
    modelName: string,
    options: { config?: BedrockConverseOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};

    // Record telemetry
    if (this.config.thinking) {
      telemetry.record('feature_used', {
        feature: 'extended_thinking',
        provider: 'bedrock_converse',
      });
    }
    if (this.config.reasoningConfig?.type === 'enabled') {
      telemetry.record('feature_used', {
        feature: 'nova2_reasoning',
        provider: 'bedrock_converse',
      });
    }
    if (this.config.tools) {
      telemetry.record('feature_used', {
        feature: 'tool_use',
        provider: 'bedrock_converse',
      });
    }
  }

  id(): string {
    return `bedrock:converse:${this.modelName}`;
  }

  toString(): string {
    return `[AWS Bedrock Converse Provider ${this.modelName}]`;
  }

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `[Bedrock Converse] Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(functionName: string, args: string): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = this.config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`[Bedrock Converse] Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      // Format the result
      if (result === undefined || result === null) {
        return '';
      } else if (typeof result === 'object') {
        try {
          return JSON.stringify(result);
        } catch (error) {
          logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
          return String(result);
        }
      } else {
        return String(result);
      }
    } catch (error: any) {
      logger.error(
        `[Bedrock Converse] Error executing function '${functionName}': ${error.message || String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Build the inference configuration from options
   *
   * Handles Amazon Nova 2 reasoning constraints:
   * - When reasoningConfig.type === 'enabled': temperature/topP must NOT be set
   * - When maxReasoningEffort === 'high': maxTokens must also NOT be set
   */
  private buildInferenceConfig(): InferenceConfiguration | undefined {
    // Check reasoning mode constraints for Nova 2 models
    const reasoningEnabled = this.config.reasoningConfig?.type === 'enabled';
    const isHighEffort = this.config.reasoningConfig?.maxReasoningEffort === 'high';

    // Get potential values
    const maxTokensValue =
      this.config.maxTokens ||
      this.config.max_tokens ||
      getEnvInt('AWS_BEDROCK_MAX_TOKENS') ||
      undefined;

    const temperatureValue =
      this.config.temperature ?? getEnvFloat('AWS_BEDROCK_TEMPERATURE') ?? undefined;

    const topPValue = this.config.topP || this.config.top_p || getEnvFloat('AWS_BEDROCK_TOP_P');

    let stopSequences = this.config.stopSequences || this.config.stop;
    if (!stopSequences) {
      const envStop = getEnvString('AWS_BEDROCK_STOP');
      if (envStop) {
        try {
          stopSequences = JSON.parse(envStop);
        } catch {
          // Ignore invalid JSON
        }
      }
    }

    // Apply reasoning constraints:
    // - maxTokens: only include if NOT (reasoning enabled AND high effort)
    // - temperature/topP: only include if reasoning is NOT enabled
    const maxTokens = reasoningEnabled && isHighEffort ? undefined : maxTokensValue;
    const temperature = reasoningEnabled ? undefined : temperatureValue;
    const topP = reasoningEnabled ? undefined : topPValue;

    // Only return config if at least one field is set
    if (
      maxTokens !== undefined ||
      temperature !== undefined ||
      topP !== undefined ||
      stopSequences
    ) {
      return {
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(topP !== undefined ? { topP } : {}),
        ...(stopSequences ? { stopSequences } : {}),
      };
    }

    return undefined;
  }

  /**
   * Build the tool configuration from options
   */
  private async buildToolConfig(
    vars?: Record<string, VarValue>,
  ): Promise<ToolConfiguration | undefined> {
    if (!this.config.tools || this.config.tools.length === 0) {
      return undefined;
    }

    // Load tools from external file with variable rendering if needed
    const tools = await maybeLoadToolsFromExternalFile(this.config.tools, vars);
    if (!tools || tools.length === 0) {
      return undefined;
    }

    const converseTools = convertToolsToConverseFormat(tools);
    const toolChoice = this.config.toolChoice
      ? convertToolChoiceToConverseFormat(this.config.toolChoice)
      : undefined;

    return {
      tools: converseTools,
      ...(toolChoice ? { toolChoice } : {}),
    };
  }

  /**
   * Build the guardrail configuration
   */
  private buildGuardrailConfig(): GuardrailConfiguration | undefined {
    if (!this.config.guardrailIdentifier) {
      return undefined;
    }

    return {
      guardrailIdentifier: String(this.config.guardrailIdentifier),
      guardrailVersion: String(this.config.guardrailVersion || 'DRAFT'),
      ...(this.config.trace ? { trace: this.config.trace as GuardrailTrace } : {}),
    };
  }

  /**
   * Build additional model request fields (including thinking config and reasoningConfig)
   */
  private buildAdditionalModelRequestFields(): DocumentType | undefined {
    const fields: Record<string, unknown> = {
      ...(this.config.additionalModelRequestFields || {}),
    };

    // Add thinking configuration for Claude models
    if (this.config.thinking) {
      fields.thinking = this.config.thinking;
    }

    // Add reasoning configuration for Amazon Nova 2 models
    if (this.config.reasoningConfig) {
      fields.reasoningConfig = this.config.reasoningConfig;
    }

    return Object.keys(fields).length > 0 ? (fields as DocumentType) : undefined;
  }

  /**
   * Build performance configuration
   */
  private buildPerformanceConfig(): PerformanceConfiguration | undefined {
    if (!this.config.performanceConfig) {
      return undefined;
    }
    return {
      latency: this.config.performanceConfig.latency,
    };
  }

  /**
   * Build service tier configuration
   */
  private buildServiceTier(): ServiceTier | undefined {
    if (!this.config.serviceTier) {
      return undefined;
    }
    return {
      type: this.config.serviceTier.type,
    };
  }

  /**
   * Main API call using Converse API
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Get inference config for tracing context
    const maxTokens =
      this.config.maxTokens ||
      this.config.max_tokens ||
      getEnvInt('AWS_BEDROCK_MAX_TOKENS') ||
      undefined;
    const temperature =
      this.config.temperature ?? getEnvFloat('AWS_BEDROCK_TEMPERATURE') ?? undefined;
    const topP = this.config.topP || this.config.top_p || getEnvFloat('AWS_BEDROCK_TOP_P');
    const stopSequences = this.config.stopSequences || this.config.stop;

    // Set up outer target span context (service name based on context label)
    const targetSpanContext: TargetSpanContext = {
      targetType: 'llm',
      providerId: this.id(),
      traceparent: context?.traceparent,
      promptLabel: context?.prompt?.label,
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      iteration: context?.iteration,
    };

    return withTargetSpan(targetSpanContext, async () => {
      // Set up inner GenAI span context (provider-specific service name)
      const spanContext: GenAISpanContext = {
        system: 'bedrock',
        operationName: 'chat',
        model: this.modelName,
        providerId: this.id(),
        // Optional request parameters
        maxTokens,
        temperature,
        topP,
        stopSequences,
        // Promptfoo context from test case if available
        testIndex: context?.test?.vars?.__testIdx as number | undefined,
        promptLabel: context?.prompt?.label,
        evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
        iteration: context?.iteration,
        // W3C Trace Context for linking to evaluation trace
        traceparent: context?.traceparent,
      };

      // Result extractor to set response attributes on the span
      const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
        const result: GenAISpanResult = {};

        if (response.tokenUsage) {
          result.tokenUsage = {
            prompt: response.tokenUsage.prompt,
            completion: response.tokenUsage.completion,
            total: response.tokenUsage.total,
          };
        }

        // Extract finish reason if available from metadata
        const stopReason = (response.metadata as { stopReason?: string } | undefined)?.stopReason;
        if (stopReason) {
          result.finishReasons = [stopReason];
        }

        return result;
      };

      // Wrap the API call in a GenAI span (inner span with provider-specific service name)
      return withGenAISpan(
        spanContext,
        () => this.callApiInternal(prompt, context),
        resultExtractor,
      );
    });
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    // Parse the prompt into messages
    const { messages, system } = parseConverseMessages(prompt);

    // Build the request
    const inferenceConfig = this.buildInferenceConfig();
    const toolConfig = await this.buildToolConfig(context?.vars);
    const guardrailConfig = this.buildGuardrailConfig();
    const additionalModelRequestFields = this.buildAdditionalModelRequestFields();
    const performanceConfig = this.buildPerformanceConfig();
    const serviceTier = this.buildServiceTier();

    const converseInput: ConverseCommandInput = {
      modelId: this.modelName,
      messages,
      ...(system ? { system } : {}),
      ...(inferenceConfig ? { inferenceConfig } : {}),
      ...(toolConfig ? { toolConfig } : {}),
      ...(guardrailConfig ? { guardrailConfig } : {}),
      ...(additionalModelRequestFields ? { additionalModelRequestFields } : {}),
      ...(this.config.additionalModelResponseFieldPaths
        ? { additionalModelResponseFieldPaths: this.config.additionalModelResponseFieldPaths }
        : {}),
      ...(performanceConfig ? { performanceConfig } : {}),
      ...(serviceTier ? { serviceTier } : {}),
    };

    logger.debug('Calling AWS Bedrock Converse API', {
      modelId: this.modelName,
      messageCount: messages.length,
      hasSystem: !!system,
      hasTools: !!toolConfig,
      hasThinking: !!this.config.thinking,
    });

    // Check cache
    const cache = await getCache();
    const cacheKey = `bedrock:converse:${this.modelName}:${JSON.stringify(converseInput)}`;

    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug('Returning cached response');
        const parsed = JSON.parse(cachedResponse as string) as ConverseCommandOutput;
        const result = await this.parseResponse(parsed);
        return { ...result, cached: true };
      }
    }

    // Make the API call
    let response: ConverseCommandOutput;
    try {
      const bedrockInstance = await this.getBedrockInstance();

      // Import and use ConverseCommand
      const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const command = new ConverseCommand(converseInput);
      response = await bedrockInstance.send(command);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      logger.error('Bedrock Converse API error', { error: errorMessage });

      // Provide helpful error messages for common issues
      if (errorMessage.includes('ValidationException')) {
        return {
          error: `Bedrock Converse API validation error: ${errorMessage}. Check that your model supports the Converse API and all parameters are valid.`,
        };
      }
      if (errorMessage.includes('AccessDeniedException')) {
        return {
          error: `Bedrock access denied: ${errorMessage}. Ensure you have bedrock:InvokeModel permission and model access is enabled.`,
        };
      }

      return {
        error: `Bedrock Converse API error: ${errorMessage}`,
      };
    }

    // Cache the response
    if (isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    logger.debug('Bedrock Converse API response received', {
      stopReason: response.stopReason,
      hasUsage: !!response.usage,
      hasMetrics: !!response.metrics,
    });

    return await this.parseResponse(response);
  }

  /**
   * Parse the Converse API response into ProviderResponse format
   */
  private async parseResponse(response: ConverseCommandOutput): Promise<ProviderResponse> {
    // Extract output text
    const outputMessage = response.output?.message;
    const content = outputMessage?.content || [];
    const showThinking = this.config.showThinking !== false;

    // Extract token usage
    const usage = response.usage;
    const promptTokens = usage?.inputTokens;
    const completionTokens = usage?.outputTokens;
    const totalTokens = usage?.totalTokens;
    const cacheReadTokens = usage?.cacheReadInputTokens;
    const cacheWriteTokens = usage?.cacheWriteInputTokens;

    const tokenUsage: Partial<TokenUsage> = {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens || (promptTokens || 0) + (completionTokens || 0),
      numRequests: 1,
    };

    // Calculate cost
    const cost = calculateBedrockConverseCost(this.modelName, promptTokens, completionTokens);

    // Build metadata
    const metadata: Record<string, unknown> = {};

    // Add latency
    if (response.metrics?.latencyMs) {
      metadata.latencyMs = response.metrics.latencyMs;
    }

    // Add stop reason
    if (response.stopReason) {
      metadata.stopReason = response.stopReason;
    }

    // Add cache token info
    if (cacheReadTokens !== undefined || cacheWriteTokens !== undefined) {
      metadata.cacheTokens = {
        read: cacheReadTokens,
        write: cacheWriteTokens,
      };
    }

    // Add performance config info
    if (response.performanceConfig) {
      metadata.performanceConfig = response.performanceConfig;
    }

    // Add service tier info
    if (response.serviceTier) {
      metadata.serviceTier = response.serviceTier;
    }

    // Add additional model response fields
    if (response.additionalModelResponseFields) {
      metadata.additionalModelResponseFields = response.additionalModelResponseFields;
    }

    // Add trace info if present
    if (response.trace) {
      metadata.trace = response.trace;
    }

    // Check for guardrail intervention
    const guardrails =
      response.stopReason === 'guardrail_intervened'
        ? { flagged: true, reason: 'guardrail_intervened' }
        : undefined;

    // Check for malformed output stop reasons (added in AWS SDK 3.943.0)
    let malformedError: string | undefined;
    if (response.stopReason === 'malformed_model_output') {
      malformedError = 'Model produced invalid output. The response could not be parsed correctly.';
      metadata.isModelError = true;
    } else if (response.stopReason === 'malformed_tool_use') {
      malformedError =
        'Model produced a malformed tool use request. Check tool configuration and input schema.';
      metadata.isModelError = true;
    }

    // Handle function tool callbacks if configured
    if (this.config.functionToolCallbacks) {
      const toolUseBlocks = content.filter(
        (block): block is ContentBlock & { toolUse: NonNullable<ContentBlock['toolUse']> } =>
          'toolUse' in block && block.toolUse !== undefined,
      );

      if (toolUseBlocks.length > 0) {
        const results: string[] = [];
        let hasSuccessfulCallback = false;

        for (const block of toolUseBlocks) {
          const functionName = block.toolUse.name;
          if (functionName && this.config.functionToolCallbacks[functionName]) {
            try {
              const args =
                typeof block.toolUse.input === 'string'
                  ? block.toolUse.input
                  : JSON.stringify(block.toolUse.input || {});
              const result = await this.executeFunctionCallback(functionName, args);
              results.push(result);
              hasSuccessfulCallback = true;
            } catch (_error) {
              // If callback fails, fall back to original behavior
              logger.debug(
                `[Bedrock Converse] Function callback failed for ${functionName}, falling back to tool_use output`,
              );
              hasSuccessfulCallback = false;
              break;
            }
          }
        }

        if (hasSuccessfulCallback && results.length > 0) {
          return {
            output: results.join('\n'),
            tokenUsage,
            ...(cost !== undefined ? { cost } : {}),
            ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
            ...(guardrails ? { guardrails } : {}),
            ...(malformedError ? { error: malformedError } : {}),
          };
        }
      }
    }

    // Default output extraction
    const output = extractTextFromContentBlocks(content, showThinking);

    return {
      output,
      tokenUsage,
      ...(cost !== undefined ? { cost } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(guardrails ? { guardrails } : {}),
      ...(malformedError ? { error: malformedError } : {}),
    };
  }

  /**
   * Streaming API call using ConverseStream
   *
   * Note: functionToolCallbacks are not executed in streaming mode.
   * Tool use blocks are captured and returned in the output, but callbacks
   * are not automatically invoked. Use non-streaming mode if you need
   * automatic tool callback execution.
   */
  async callApiStreaming(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse & { stream?: AsyncIterable<string> }> {
    // Parse the prompt into messages
    const { messages, system } = parseConverseMessages(prompt);

    // Build the request (same as non-streaming)
    const inferenceConfig = this.buildInferenceConfig();
    const toolConfig = await this.buildToolConfig(context?.vars);
    const guardrailConfig = this.buildGuardrailConfig();
    const additionalModelRequestFields = this.buildAdditionalModelRequestFields();
    const performanceConfig = this.buildPerformanceConfig();
    const serviceTier = this.buildServiceTier();

    const converseStreamInput: ConverseStreamCommandInput = {
      modelId: this.modelName,
      messages,
      ...(system ? { system } : {}),
      ...(inferenceConfig ? { inferenceConfig } : {}),
      ...(toolConfig ? { toolConfig } : {}),
      ...(guardrailConfig ? { guardrailConfig } : {}),
      ...(additionalModelRequestFields ? { additionalModelRequestFields } : {}),
      ...(performanceConfig ? { performanceConfig } : {}),
      ...(serviceTier ? { serviceTier } : {}),
    };

    logger.debug('Calling AWS Bedrock ConverseStream API', {
      modelId: this.modelName,
      messageCount: messages.length,
    });

    try {
      const bedrockInstance = await this.getBedrockInstance();
      const { ConverseStreamCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const command = new ConverseStreamCommand(converseStreamInput);
      const response = await bedrockInstance.send(command);

      // Collect the full response while also providing a stream
      let output = '';
      let reasoning = '';
      let stopReason: string | undefined;
      let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};

      // Track tool use blocks being streamed
      const toolUseBlocks: Map<number, { toolUseId?: string; name?: string; input: string }> =
        new Map();

      const showThinking = this.config.showThinking !== false;

      // Process the stream
      if (response.stream) {
        for await (const event of response.stream) {
          // Handle content block start - includes tool use and image initialization
          if ('contentBlockStart' in event && event.contentBlockStart) {
            const blockIndex = event.contentBlockStart.contentBlockIndex ?? 0;
            const start = event.contentBlockStart.start;
            if (start && 'toolUse' in start && start.toolUse) {
              toolUseBlocks.set(blockIndex, {
                toolUseId: start.toolUse.toolUseId,
                name: start.toolUse.name,
                input: '',
              });
            }
          }

          if ('contentBlockDelta' in event && event.contentBlockDelta?.delta) {
            const delta = event.contentBlockDelta.delta;
            const blockIndex = event.contentBlockDelta.contentBlockIndex ?? 0;

            if ('text' in delta && delta.text) {
              output += delta.text;
            }
            if ('reasoningContent' in delta && delta.reasoningContent && showThinking) {
              const rc = delta.reasoningContent as { text?: string };
              if (rc.text) {
                reasoning += rc.text;
              }
            }
            // Handle streaming tool use input
            if ('toolUse' in delta && delta.toolUse) {
              const toolBlock = toolUseBlocks.get(blockIndex);
              if (toolBlock && delta.toolUse.input) {
                toolBlock.input += delta.toolUse.input;
              }
            }
          }
          if ('messageStop' in event && event.messageStop) {
            stopReason = event.messageStop.stopReason;
          }
          if ('metadata' in event && event.metadata?.usage) {
            usage = event.metadata.usage;
          }
        }
      }

      // Format tool use blocks for output (same as non-streaming)
      const toolUseParts: string[] = [];
      for (const [, toolBlock] of toolUseBlocks) {
        if (toolBlock.name) {
          let parsedInput: unknown;
          try {
            parsedInput = toolBlock.input ? JSON.parse(toolBlock.input) : {};
          } catch {
            parsedInput = toolBlock.input;
          }
          toolUseParts.push(
            JSON.stringify({
              type: 'tool_use',
              id: toolBlock.toolUseId,
              name: toolBlock.name,
              input: parsedInput,
            }),
          );
        }
      }

      // Combine reasoning, output, and tool use
      const parts: string[] = [];
      if (reasoning) {
        parts.push(`<thinking>\n${reasoning}\n</thinking>`);
      }
      if (output) {
        parts.push(output);
      }
      if (toolUseParts.length > 0) {
        parts.push(...toolUseParts);
      }
      const finalOutput = parts.join('\n\n');

      // Check for malformed output stop reasons (added in AWS SDK 3.943.0)
      let malformedError: string | undefined;
      const metadata: Record<string, unknown> = {};
      if (stopReason) {
        metadata.stopReason = stopReason;
      }
      if (stopReason === 'malformed_model_output') {
        malformedError =
          'Model produced invalid output. The response could not be parsed correctly.';
        metadata.isModelError = true;
      } else if (stopReason === 'malformed_tool_use') {
        malformedError =
          'Model produced a malformed tool use request. Check tool configuration and input schema.';
        metadata.isModelError = true;
      }

      const tokenUsage: Partial<TokenUsage> = {
        prompt: usage.inputTokens,
        completion: usage.outputTokens,
        total: usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0),
        numRequests: 1,
      };

      const cost = calculateBedrockConverseCost(
        this.modelName,
        usage.inputTokens,
        usage.outputTokens,
      );

      return {
        output: finalOutput,
        tokenUsage,
        ...(cost !== undefined ? { cost } : {}),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        ...(malformedError ? { error: malformedError } : {}),
      };
    } catch (err: any) {
      return {
        error: `Bedrock ConverseStream API error: ${err?.message || String(err)}`,
      };
    }
  }
}
