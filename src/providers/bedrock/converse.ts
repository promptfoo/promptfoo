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
import { isJavascriptFile } from '../../util/fileExtensions';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { isClaudeOpus47Model } from '../anthropic/util';
import { MCPClient } from '../mcp/client';
import { providerRegistry } from '../providerRegistry';
import {
  isOpenAIToolArray,
  isOpenAIToolChoice,
  type OpenAIToolChoice,
  openaiToolChoiceToBedrock,
  openaiToolsToBedrock,
} from '../shared';
import { AwsBedrockGenericProvider, type BedrockOptions, createBedrockCacheKeyHash } from './base';
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
import type { MCPConfig, MCPTool } from '../mcp/types';

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
  mcp?: MCPConfig;
  tool_choice?: OpenAIToolChoice | 'any' | { tool: { name: string } };

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
  // Claude Opus 4.7
  'anthropic.claude-opus-4-7': { input: 5, output: 25 },
  // Claude Opus 4.6
  'anthropic.claude-opus-4-6': { input: 5, output: 25 },
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
 * Convert various tool formats to Converse API format.
 * Supports OpenAI, Anthropic, and native Bedrock formats.
 */
function convertToolsToConverseFormat(tools: BedrockConverseToolConfig[]): Tool[] {
  // Check if entire array is OpenAI format
  if (isOpenAIToolArray(tools)) {
    return openaiToolsToBedrock(tools) as Tool[];
  }

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

    // Shorthand tool format (has 'name' and 'parameters' but no 'input_schema')
    if (tool.name && 'parameters' in tool && !('input_schema' in tool)) {
      return {
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: (tool.parameters || { type: 'object', properties: {} }) as DocumentType,
          },
        },
      } as Tool;
    }

    // Anthropic format (has 'name' and 'input_schema')
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

function transformMCPToolsToBedrockConverse(tools: MCPTool[]): BedrockConverseToolConfig[] {
  // Bedrock rejects duplicate tool names with ValidationException. When two
  // configured MCP servers expose a tool with the same name, keep only the
  // first occurrence and warn about the collision so the user can rename one.
  const seen = new Set<string>();
  const result: BedrockConverseToolConfig[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      logger.warn(
        `[Bedrock Converse] Duplicate MCP tool name '${tool.name}' detected; using the first server's definition.`,
      );
      continue;
    }
    seen.add(tool.name);
    const { $schema: _$schema, ...cleanSchema } = tool.inputSchema || {};
    result.push({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: {
            type: 'object',
            ...cleanSchema,
          } as DocumentType,
        },
      },
    });
  }
  return result;
}

function normalizeMCPToolContent(content: unknown): string {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if ('text' in part && (part as { text?: unknown }).text != null) {
            return String((part as { text?: unknown }).text);
          }
          if ('json' in part) {
            return JSON.stringify((part as { json?: unknown }).json);
          }
          if ('data' in part) {
            return JSON.stringify((part as { data?: unknown }).data);
          }
          logger.debug('[Bedrock Converse] Unknown MCP content shape, serializing as JSON', {
            keys: Object.keys(part as object),
          });
          return JSON.stringify(part);
        }
        return String(part);
      })
      .join('\n');
  }
  return JSON.stringify(content);
}

/**
 * Extract a printable message from an unknown thrown value without losing
 * non-`Error` payloads to `[object Object]`.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Coerces a tool_use input value into a plain object suitable for `MCPClient.callTool`.
 * Total: never throws. Malformed JSON strings yield `{}` so an MCP call still happens with
 * empty args rather than crashing the whole eval row.
 */
function parseToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    if (!input) {
      return {};
    }
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      logger.warn(`[Bedrock Converse] Failed to parse tool_use input as JSON: ${err}`);
      return {};
    }
  }
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

/**
 * True when an MCP server config has at least one transport (command+args, path, or url).
 * Empty strings count as unset.
 */
function isMCPServerConfigured(
  server: { command?: string; path?: string; url?: string } | undefined,
): boolean {
  if (!server) {
    return false;
  }
  return Boolean(server.command || server.path || server.url);
}

function hasUsableMCPServer(mcp: MCPConfig | undefined): boolean {
  if (!mcp) {
    return false;
  }
  if (mcp.server && isMCPServerConfigured(mcp.server)) {
    return true;
  }
  return Boolean(mcp.servers?.some(isMCPServerConfigured));
}

function joinMcpErrors(errors: string[]): string | undefined {
  return errors.length > 0 ? errors.join('; ') : undefined;
}

function formatMcpToolResult(name: string, content: unknown): string {
  return `MCP Tool Result (${name}): ${normalizeMCPToolContent(content)}`;
}

function formatMcpToolError(name: string, message: string): string {
  return `MCP Tool Error (${name}): ${message}`;
}

interface StreamingToolUseBlock {
  toolUseId?: string;
  name?: string;
  input: string;
}

/**
 * Parses streaming tool_use input that arrived as concatenated JSON deltas.
 * Always returns a plain object (the only shape `MCPClient.callTool` accepts);
 * `failed` is `true` when the raw text was non-empty but not valid JSON, so
 * callers can surface the parse error rather than silently calling MCP with
 * `{}`.
 */
function parseStreamingToolInput(raw: string): {
  value: Record<string, unknown>;
  failed: boolean;
} {
  if (!raw) {
    return { value: {}, failed: false };
  }
  try {
    return { value: parseToolInput(JSON.parse(raw)), failed: false };
  } catch (err) {
    logger.warn(
      `[Bedrock Converse] Streaming tool_use input was not valid JSON: ${errorMessage(err)}`,
    );
    // Don't pass the broken string downstream; tracking the parse failure
    // here lets us surface it as an error on the response.
    return { value: {}, failed: true };
  }
}

/**
 * Convert tool choice to Converse API format.
 * Supports OpenAI tool choice format and native Bedrock format.
 */
function isNamedConverseToolChoice(toolChoice: unknown): toolChoice is { tool: { name: string } } {
  if (!toolChoice || typeof toolChoice !== 'object' || !('tool' in toolChoice)) {
    return false;
  }

  const tool = (toolChoice as { tool?: unknown }).tool;
  return Boolean(
    tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string',
  );
}

function convertToolChoiceToConverseFormat(toolChoice: unknown): ToolChoice | undefined {
  // Handle OpenAI tool choice format (strings 'auto'/'none'/'required' and object form)
  if (isOpenAIToolChoice(toolChoice)) {
    return openaiToolChoiceToBedrock(toolChoice);
  }

  // Handle native Bedrock format
  if (toolChoice === 'any') {
    return { any: {} };
  }
  if (isNamedConverseToolChoice(toolChoice)) {
    return { tool: { name: toolChoice.tool.name } };
  }
  return { auto: {} };
}

function isDisabledToolChoice(toolChoice: unknown): boolean {
  return toolChoice === 'none';
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
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private mcpInitError: Error | null = null;
  private registeredForShutdown = false;
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
    if (this.config.mcp?.enabled && hasUsableMCPServer(this.config.mcp)) {
      // Attach a sink-handler so a failed init never surfaces as an unhandled
      // promise rejection if the provider is constructed but never invoked
      // (e.g., during config validation or provider listing). The error is
      // surfaced lazily when callApi/callApiStreaming awaits the promise.
      this.initializationPromise = this.initializeMCP().catch((err) => {
        this.mcpInitError = err instanceof Error ? err : new Error(String(err));
        logger.error(`[Bedrock Converse] MCP initialization failed: ${this.mcpInitError.message}`);
      });
    }
  }

  id(): string {
    return `bedrock:converse:${this.modelName}`;
  }

  toString(): string {
    return `[AWS Bedrock Converse Provider ${this.modelName}]`;
  }

  private async initializeMCP(): Promise<void> {
    if (!this.config.mcp) {
      return;
    }
    this.mcpClient = new MCPClient(this.config.mcp);
    // Register BEFORE awaiting initialize() so a partial init failure
    // (e.g., one server connects, a later server fails) still gets cleaned
    // up by `providerRegistry.shutdownAll()`. `cleanup()` is resilient to a
    // rejected initializationPromise.
    if (!this.registeredForShutdown) {
      providerRegistry.register(this);
      this.registeredForShutdown = true;
    }
    await this.mcpClient.initialize();
  }

  /**
   * Called by `providerRegistry.shutdownAll()` from the evaluator. Delegates
   * to `cleanup()` so external callers can use either name.
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Releases the MCP client and any spawned transport (e.g. stdio child
   * processes). Safe to call multiple times and resilient to a failed init —
   * partially-initialized state is still attempted to be torn down so we don't
   * leak resources.
   */
  async cleanup(): Promise<void> {
    if (!this.mcpClient && this.initializationPromise == null) {
      return;
    }
    if (this.initializationPromise != null) {
      try {
        await this.initializationPromise;
      } catch (err) {
        logger.warn(
          `[Bedrock Converse] MCP init had failed; cleaning up anyway: ${errorMessage(err)}`,
        );
      }
    }
    if (this.mcpClient) {
      try {
        await this.mcpClient.cleanup();
      } catch (err) {
        logger.error(`[Bedrock Converse] MCP client cleanup failed: ${errorMessage(err)}`);
      }
      this.mcpClient = null;
    }
    this.initializationPromise = null;
    if (this.registeredForShutdown) {
      providerRegistry.unregister(this);
      this.registeredForShutdown = false;
    }
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
      this.config.maxTokens ??
      this.config.max_tokens ??
      getEnvInt('AWS_BEDROCK_MAX_TOKENS') ??
      undefined;

    const temperatureValue =
      this.config.temperature ?? getEnvFloat('AWS_BEDROCK_TEMPERATURE') ?? undefined;

    const topPValue = this.config.topP ?? this.config.top_p ?? getEnvFloat('AWS_BEDROCK_TOP_P');

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
    // Claude Opus 4.7 deprecates `temperature` at the model level — any request
    // that includes it on Bedrock returns ValidationException. Drop the value
    // regardless of where it came from (config or AWS_BEDROCK_TEMPERATURE).
    const isOpus47 = isClaudeOpus47Model(this.modelName);
    const temperature = reasoningEnabled || isOpus47 ? undefined : temperatureValue;
    const topP = reasoningEnabled ? undefined : topPValue;

    // Only return config if at least one field is set
    if (
      maxTokens !== undefined ||
      temperature !== undefined ||
      topP !== undefined ||
      stopSequences
    ) {
      return {
        ...(maxTokens === undefined ? {} : { maxTokens }),
        ...(temperature === undefined ? {} : { temperature }),
        ...(topP === undefined ? {} : { topP }),
        ...(stopSequences ? { stopSequences } : {}),
      };
    }

    return undefined;
  }

  /**
   * Build the tool configuration from options
   * Merges prompt.config with provider config, with prompt.config taking precedence
   */
  private async buildToolConfig(
    vars?: Record<string, VarValue>,
    promptConfig?: Partial<BedrockConverseOptions>,
  ): Promise<ToolConfiguration | undefined> {
    const configToolChoice = this.getEffectiveToolChoice(promptConfig);
    if (isDisabledToolChoice(configToolChoice)) {
      return undefined;
    }

    const mcpTools = this.mcpClient
      ? transformMCPToolsToBedrockConverse(this.mcpClient.getAllTools())
      : [];

    // Merge prompt.config.tools with this.config.tools (prompt.config takes precedence)
    const configTools = promptConfig?.tools ?? this.config.tools;
    if (mcpTools.length === 0 && (!configTools || configTools.length === 0)) {
      return undefined;
    }

    // Load tools from external file with variable rendering if needed
    const tools = configTools ? await maybeLoadToolsFromExternalFile(configTools, vars) : [];
    if (mcpTools.length === 0 && (!tools || tools.length === 0)) {
      return undefined;
    }

    // Bedrock rejects duplicate tool names with ValidationException. MCP-discovered
    // tools take precedence; explicit config.tools entries with conflicting names
    // are dropped with a warning so users can detect the collision.
    const mcpToolNames = new Set(
      mcpTools
        .map((tool) => tool.toolSpec?.name)
        .filter((name): name is string => typeof name === 'string'),
    );
    const dedupedConfigTools = (tools || []).filter((tool: BedrockConverseToolConfig) => {
      const name = tool.toolSpec?.name ?? tool.function?.name ?? tool.name;
      if (typeof name === 'string' && mcpToolNames.has(name)) {
        logger.warn(
          `[Bedrock Converse] Tool name '${name}' is defined in both config.tools and an MCP server; using the MCP-provided tool.`,
        );
        return false;
      }
      return true;
    });

    const converseTools = convertToolsToConverseFormat([...mcpTools, ...dedupedConfigTools]);
    const toolChoice = configToolChoice
      ? convertToolChoiceToConverseFormat(configToolChoice)
      : undefined;

    return {
      tools: converseTools,
      ...(toolChoice ? { toolChoice } : {}),
    };
  }

  private getEffectiveToolChoice(promptConfig?: Partial<BedrockConverseOptions>): unknown {
    return (
      promptConfig?.tool_choice ??
      promptConfig?.toolChoice ??
      this.config.tool_choice ??
      this.config.toolChoice
    );
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
    // Only wait on MCP init when this request actually needs MCP. A
    // tool-disabled request must not stall on a slow or hung MCP transport,
    // and a recorded init error must not block a request that opted out of
    // tools entirely.
    const initErrorResponse = await this.awaitMcpReadyForRequest(context);
    if (initErrorResponse) {
      return initErrorResponse;
    }

    const inferenceConfig = this.buildInferenceConfig();

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'bedrock',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: inferenceConfig?.maxTokens,
      temperature: inferenceConfig?.temperature,
      topP: inferenceConfig?.topP,
      stopSequences: inferenceConfig?.stopSequences,
      // Promptfoo context from test case if available
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
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

    // Wrap the API call in a span
    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
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
    const toolConfig = await this.buildToolConfig(
      context?.vars,
      context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
    );
    const toolsDisabled = isDisabledToolChoice(
      this.getEffectiveToolChoice(
        context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
      ),
    );
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
    const region = this.getRegion();
    const cacheKey = `bedrock:converse:${this.modelName}:${region}:${createBedrockCacheKeyHash({
      config: this.config,
      params: converseInput,
      region,
    })}`;

    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug('Returning cached response');
        const parsed = JSON.parse(cachedResponse as string) as ConverseCommandOutput;
        const result = await this.parseResponse(parsed, toolsDisabled);
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

    return await this.parseResponse(response, toolsDisabled);
  }

  /**
   * Resolves the effective tool choice for a request without touching the MCP
   * client. Used by `callApi`/`callApiStreaming` to short-circuit MCP init for
   * tool-disabled requests so a hung MCP transport never stalls them.
   */
  private isRequestToolsDisabled(context?: CallApiContextParams): boolean {
    return isDisabledToolChoice(
      this.getEffectiveToolChoice(
        context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
      ),
    );
  }

  /**
   * Awaits MCP init only when this request actually needs MCP, then returns an
   * error response if init failed. Tool-disabled requests skip both the wait
   * and the error check entirely so they can proceed even with MCP offline.
   * Returns `undefined` when the request can proceed.
   */
  private async awaitMcpReadyForRequest(
    context?: CallApiContextParams,
  ): Promise<ProviderResponse | undefined> {
    if (this.isRequestToolsDisabled(context)) {
      return undefined;
    }
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    if (!this.mcpInitError) {
      return undefined;
    }
    return {
      error: `Bedrock Converse MCP initialization failed: ${this.mcpInitError.message}`,
    };
  }

  /**
   * Invoke a single MCP tool and return a formatted result string plus the
   * error string (if any). Centralizes the try/catch + error-message wrapping
   * shared by streaming and non-streaming dispatch paths. Caller is
   * responsible for ensuring `this.mcpClient` is non-null and that `name`
   * matches a discovered MCP tool.
   */
  private async dispatchMcpToolCall(
    name: string,
    input: unknown,
  ): Promise<{ output: string; error?: string }> {
    try {
      const mcpResult = await this.mcpClient!.callTool(name, parseToolInput(input));
      if (mcpResult?.error) {
        const msg = formatMcpToolError(name, String(mcpResult.error));
        return { output: msg, error: msg };
      }
      return { output: formatMcpToolResult(name, mcpResult?.content) };
    } catch (err) {
      logger.error(`[Bedrock Converse] MCP tool execution failed for ${name}: ${err}`);
      const msg = formatMcpToolError(name, errorMessage(err));
      return { output: msg, error: msg };
    }
  }

  /**
   * Format streaming tool_use blocks for output. Routes blocks to MCP when
   * MCP is enabled and a matching tool exists; otherwise falls back to
   * default tool_use JSON serialization.
   */
  private async formatStreamingToolUseBlocks(
    blocks: StreamingToolUseBlock[],
    toolsDisabled: boolean,
  ): Promise<{ toolUseParts: string[]; mcpErrors: string[] }> {
    const toolUseParts: string[] = [];
    const mcpErrors: string[] = [];
    const mcpTools = this.mcpClient?.getAllTools() ?? [];

    for (const toolBlock of blocks) {
      if (!toolBlock.name) {
        continue;
      }
      const { value: parsedInput, failed: parseFailed } = parseStreamingToolInput(toolBlock.input);
      const matchedMcpTool = mcpTools.find((tool) => tool.name === toolBlock.name);

      if (toolsDisabled || !this.mcpClient || !matchedMcpTool) {
        toolUseParts.push(
          JSON.stringify({
            type: 'tool_use',
            id: toolBlock.toolUseId,
            name: toolBlock.name,
            input: parsedInput,
          }),
        );
        continue;
      }

      if (parseFailed) {
        const msg = formatMcpToolError(toolBlock.name, 'model emitted invalid JSON arguments');
        toolUseParts.push(msg);
        mcpErrors.push(msg);
        continue;
      }

      const { output, error } = await this.dispatchMcpToolCall(toolBlock.name, parsedInput);
      toolUseParts.push(output);
      if (error) {
        mcpErrors.push(error);
      }
    }

    return { toolUseParts, mcpErrors };
  }

  /**
   * Execute MCP tool calls for the given tool_use blocks. Blocks whose name
   * doesn't match a discovered MCP tool are skipped silently; the caller is
   * responsible for deciding what to do with them. Returns formatted result
   * strings and any errors encountered.
   */
  private async executeMcpToolCalls(
    blocks: { name: string; input: unknown }[],
  ): Promise<{ results: string[]; errors: string[] }> {
    const results: string[] = [];
    const errors: string[] = [];

    if (!this.mcpClient) {
      return { results, errors };
    }
    const tools = this.mcpClient.getAllTools();

    for (const { name, input } of blocks) {
      if (!name || !tools.find((tool) => tool.name === name)) {
        continue;
      }
      const { output, error } = await this.dispatchMcpToolCall(name, input);
      results.push(output);
      if (error) {
        errors.push(error);
      }
    }

    return { results, errors };
  }

  /**
   * Parse the Converse API response into ProviderResponse format
   */
  private async parseResponse(
    response: ConverseCommandOutput,
    toolsDisabled = false,
  ): Promise<ProviderResponse> {
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

    const toolUseBlocks = content.filter(
      (block): block is ContentBlock & { toolUse: NonNullable<ContentBlock['toolUse']> } =>
        'toolUse' in block && block.toolUse !== undefined,
    );

    // Mixed dispatch: each tool_use block goes to MCP if a matching MCP tool
    // exists, otherwise to a configured `functionToolCallbacks` entry, otherwise
    // falls through to the default `tool_use` JSON serialization. We aggregate
    // results across the whole response so a mix of MCP + local callbacks both
    // run instead of one short-circuiting the other.
    const mcpToolNames = new Set(
      this.mcpClient ? this.mcpClient.getAllTools().map((tool) => tool.name) : [],
    );
    const dispatchResults: string[] = [];
    const mcpErrors: string[] = [];
    const handledIndexes = new Set<number>();

    if (!toolsDisabled && toolUseBlocks.length > 0) {
      // 1) MCP for matching tool names.
      const mcpEligible: { idx: number; name: string; input: unknown }[] = [];
      toolUseBlocks.forEach((block, idx) => {
        const name = block.toolUse.name;
        if (this.mcpClient && name && mcpToolNames.has(name)) {
          mcpEligible.push({ idx, name, input: block.toolUse.input });
        }
      });

      if (mcpEligible.length > 0) {
        const mcpResult = await this.executeMcpToolCalls(mcpEligible);
        for (const { idx } of mcpEligible) {
          handledIndexes.add(idx);
        }
        dispatchResults.push(...mcpResult.results);
        mcpErrors.push(...mcpResult.errors);
      }

      // 2) functionToolCallbacks for any remaining (non-MCP) tool_use blocks.
      if (this.config.functionToolCallbacks) {
        for (let idx = 0; idx < toolUseBlocks.length; idx++) {
          if (handledIndexes.has(idx)) {
            continue;
          }
          const block = toolUseBlocks[idx];
          const functionName = block.toolUse.name;
          if (!functionName || !this.config.functionToolCallbacks[functionName]) {
            continue;
          }
          try {
            const args =
              typeof block.toolUse.input === 'string'
                ? block.toolUse.input
                : JSON.stringify(block.toolUse.input || {});
            const result = await this.executeFunctionCallback(functionName, args);
            dispatchResults.push(result);
            handledIndexes.add(idx);
          } catch (err) {
            logger.warn(
              `[Bedrock Converse] Function callback failed for ${functionName}: ${errorMessage(err)}; falling back to tool_use output`,
            );
            // Leave the block unhandled so the default serialization below
            // surfaces it.
          }
        }
      }
    }

    // 3) Default tool_use JSON for any remaining unhandled blocks. Rendered
    // alongside any MCP / callback results so a mixed response shows everything.
    // Skip when tools are disabled — in that case we want the regular text
    // extraction path below to render text + tool_use as one combined output
    // (matching the pre-MCP contract).
    if (!toolsDisabled && toolUseBlocks.length > 0 && handledIndexes.size < toolUseBlocks.length) {
      const fallbackText = extractTextFromContentBlocks(
        toolUseBlocks
          .filter((_, idx) => !handledIndexes.has(idx))
          .map((block) => ({ toolUse: block.toolUse })) as ContentBlock[],
        showThinking,
      );
      if (fallbackText) {
        dispatchResults.push(fallbackText);
      }
    }

    if (dispatchResults.length > 0) {
      // Surface MCP failures via the response `error` field so downstream
      // consumers (assertions, exit codes, redteam grader) treat broken MCP
      // calls as failures rather than greenlighting them on the strength of an
      // embedded "MCP Tool Error: ..." string. Malformed-output stop reasons
      // take precedence since they're a model-level (not tool-level) failure.
      const error = malformedError ?? joinMcpErrors(mcpErrors);
      return {
        output: dispatchResults.join('\n'),
        tokenUsage,
        ...(cost === undefined ? {} : { cost }),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        ...(guardrails ? { guardrails } : {}),
        ...(error ? { error } : {}),
      };
    }

    // No tool_use blocks (or tools disabled) — fall through to the regular text
    // output extraction.
    const output = extractTextFromContentBlocks(content, showThinking);

    return {
      output,
      tokenUsage,
      ...(cost === undefined ? {} : { cost }),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(guardrails ? { guardrails } : {}),
      ...(malformedError ? { error: malformedError } : {}),
    };
  }

  /**
   * Streaming API call using ConverseStream.
   *
   * Tool handling in streaming mode:
   * - **MCP tools** ARE executed automatically when an MCP server is
   *   configured and the model emits a `tool_use` block matching a discovered
   *   MCP tool. Results (or error strings) are inlined in the response output.
   * - **`functionToolCallbacks`** are NOT executed in streaming mode. Local
   *   callback dispatch only runs in non-streaming `callApi`. Streaming
   *   `tool_use` blocks for non-MCP tools fall through to the default
   *   `{ "type": "tool_use", ... }` JSON serialization.
   *
   * Use non-streaming mode if you need automatic local callback execution.
   */
  async callApiStreaming(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse & { stream?: AsyncIterable<string> }> {
    // Same MCP-init gating as `callApi`: tool-disabled requests must not stall
    // on a slow or failed MCP transport.
    const initErrorResponse = await this.awaitMcpReadyForRequest(context);
    if (initErrorResponse) {
      return initErrorResponse;
    }

    // Parse the prompt into messages
    const { messages, system } = parseConverseMessages(prompt);

    // Build the request (same as non-streaming)
    const inferenceConfig = this.buildInferenceConfig();
    const toolConfig = await this.buildToolConfig(
      context?.vars,
      context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
    );
    const toolsDisabled = isDisabledToolChoice(
      this.getEffectiveToolChoice(
        context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
      ),
    );
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
      const toolUseBlocks = new Map<number, StreamingToolUseBlock>();

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
      const { toolUseParts, mcpErrors } = await this.formatStreamingToolUseBlocks(
        Array.from(toolUseBlocks.values()),
        toolsDisabled,
      );

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

      // Surface MCP failures via the response `error` field. If the model also
      // produced a malformed-output stop reason, that takes precedence since it
      // is a model-level failure rather than a tool-level one.
      const error = malformedError ?? joinMcpErrors(mcpErrors);

      return {
        output: finalOutput,
        tokenUsage,
        ...(cost === undefined ? {} : { cost }),
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        ...(error ? { error } : {}),
      };
    } catch (err: any) {
      return {
        error: `Bedrock ConverseStream API error: ${err?.message || String(err)}`,
      };
    }
  }
}
