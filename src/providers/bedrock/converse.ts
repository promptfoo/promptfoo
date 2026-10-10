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

import { getCache, isCacheEnabled } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import telemetry from '../../telemetry';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { renderVarsInObject } from '../../util/render';
import {
  getClaudeModelWarningName,
  isAlwaysOnAdaptiveThinkingClaudeModel,
  isClaudeThinkingEnabled,
  isForcedToolChoiceUnsupportedClaudeModel,
  isSamplingParamsDeprecatedClaudeModel,
  normalizeClaudeThinkingConfig,
  resolveClaudeSamplingParams,
} from '../anthropic/util';
import {
  executeProviderFunctionCallback,
  loadProviderCallbackFromFileUrl,
} from '../functionCallbackUtils';
import { MCPClient } from '../mcp/client';
import { getMcpErrorMessage, isMcpErrorResult, normalizeMcpToolContent } from '../mcp/util';
import { providerRegistry } from '../providerRegistry';
import {
  isOpenAIToolChoice,
  type OpenAIToolChoice,
  openaiToolChoiceToBedrock,
  shouldBustProviderCache,
  withResponseCacheMetadata,
} from '../shared';
import { AwsBedrockGenericProvider, type BedrockOptions, createBedrockCacheKeyHash } from './base';
import { collectConverseStream } from './converseStream';
import { calculateBedrockCost } from './pricing';
import type {
  ContentBlock,
  ConverseCommandInput,
  ConverseCommandOutput,
  ConverseStreamCommandInput,
  GuardrailConfiguration,
  GuardrailStreamConfiguration,
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
import type { ClaudeEffort, ClaudeThinkingConfig } from '../anthropic/types';
import type { MCPConfig, MCPTool } from '../mcp/types';

function getOneHourCacheWriteTokens(
  cacheDetails?: ReadonlyArray<{ ttl?: string; inputTokens?: number }>,
): number {
  return (
    cacheDetails?.reduce(
      (total, detail) => total + (detail.ttl === '1h' ? (detail.inputTokens ?? 0) : 0),
      0,
    ) ?? 0
  );
}

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

  // Shared with the Anthropic Messages and Bedrock InvokeModel providers.
  thinking?: ClaudeThinkingConfig;

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
    type: 'priority' | 'default' | 'flex' | 'reserved';
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

  // Native Converse request fields. These are explicitly selected when building the request.
  system?: ConverseCommandInput['system'];
  inferenceConfig?: ConverseCommandInput['inferenceConfig'];
  toolConfig?: ConverseCommandInput['toolConfig'];
  guardrailConfig?: GuardrailStreamConfiguration;
  outputConfig?: ConverseCommandInput['outputConfig'];
  promptVariables?: ConverseCommandInput['promptVariables'];
  requestMetadata?: ConverseCommandInput['requestMetadata'];

  // Streaming
  streaming?: boolean;
}

/**
 * Tool configuration for Converse API
 */
export interface BedrockConverseToolConfig {
  cachePoint?: Tool['cachePoint'];
  systemTool?: Tool['systemTool'];
  toolSpec?: {
    strict?: boolean;
    name: string;
    description?: string;
    inputSchema?: {
      json: DocumentType;
    };
  };
  // Support for OpenAI-compatible format
  type?: 'function';
  function?: {
    strict?: boolean;
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
 * Convert various tool formats to Converse API format.
 * Supports OpenAI, Anthropic, and native Bedrock formats.
 */
function convertToolsToConverseFormat(tools: BedrockConverseToolConfig[]): Tool[] {
  return tools.map((tool): Tool => {
    if (tool.cachePoint) {
      return { cachePoint: tool.cachePoint };
    }
    if (tool.systemTool) {
      return { systemTool: tool.systemTool };
    }
    // Already in Converse format - cast to expected type
    if (tool.toolSpec) {
      return { toolSpec: tool.toolSpec } as Tool;
    }

    // OpenAI-compatible format
    if (tool.type === 'function' && tool.function) {
      return {
        toolSpec: {
          name: tool.function.name,
          ...(tool.function.strict === undefined ? {} : { strict: tool.function.strict }),
          description: tool.function.description,
          inputSchema: {
            json: (tool.function.parameters || { type: 'object', properties: {} }) as DocumentType,
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
  const normalizedContent = normalizeMcpToolContent(content, (part) => {
    logger.debug('[Bedrock Converse] Unknown MCP content shape, serializing as JSON', {
      keys: Object.keys(part),
    });
  });
  return `MCP Tool Result (${name}): ${normalizedContent}`;
}

function formatMcpToolError(name: string, message: string): string {
  return `MCP Tool Error (${name}): ${message}`;
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
  if (
    toolChoice === 'any' ||
    (typeof toolChoice === 'object' && toolChoice !== null && 'any' in toolChoice)
  ) {
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

const nativeContentKeys = [
  'text',
  'image',
  'document',
  'video',
  'audio',
  'toolUse',
  'toolResult',
  'guardContent',
  'reasoningContent',
  'cachePoint',
  'citationsContent',
  'searchResult',
  'toolAddition',
  'toolRemoval',
];

function isNativeContentBlock(block: Record<string, any>): boolean {
  if (
    !block ||
    typeof block !== 'object' ||
    block.type ||
    !nativeContentKeys.some((key) => key in block)
  ) {
    return false;
  }
  // Untyped compatibility blocks still need their format, ID, or content adapters below.
  if (block.image) {
    return Boolean(block.image.format && !block.image.source?.data);
  }
  if (block.document) {
    return Boolean(block.document.name);
  }
  if (block.toolUse) {
    return Boolean(block.toolUse.toolUseId);
  }
  if (block.toolResult) {
    return Boolean(
      block.toolResult.toolUseId &&
        Array.isArray(block.toolResult.content) &&
        block.toolResult.content.every((part: unknown) => typeof part !== 'string'),
    );
  }
  return true;
}

function decodeNativeBytes(bytes: unknown): Uint8Array {
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes);
  }
  if (typeof bytes === 'string') {
    return Buffer.from(bytes.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }
  if (
    bytes &&
    typeof bytes === 'object' &&
    'type' in bytes &&
    bytes.type === 'Buffer' &&
    'data' in bytes &&
    Array.isArray(bytes.data)
  ) {
    return Buffer.from(bytes.data);
  }
  // Older cache entries serialized plain Uint8Array values as numeric-key objects.
  if (bytes && typeof bytes === 'object' && !(bytes instanceof Uint8Array)) {
    const entries = Object.entries(bytes);
    if (
      entries.length &&
      entries.every(
        ([key, value], index) =>
          key === String(index) && Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      return Buffer.from(entries.map(([, value]) => value));
    }
  }
  return bytes as Uint8Array;
}

function normalizeNativeContentBlock(block: ContentBlock): ContentBlock {
  for (const key of ['image', 'document', 'video', 'audio'] as const) {
    const media = block[key];
    if (media?.source?.bytes !== undefined) {
      if (key === 'image' && block.image) {
        const match = String(media.source.bytes).match(/^data:image\/([^;]+);base64,/);
        if (match) {
          block.image.format = (match[1] === 'jpg' ? 'jpeg' : match[1]) as NonNullable<
            ContentBlock['image']
          >['format'];
        }
      }
      media.source.bytes = decodeNativeBytes(media.source.bytes);
    }
  }
  if (block.reasoningContent?.redactedContent) {
    block.reasoningContent.redactedContent = decodeNativeBytes(
      block.reasoningContent.redactedContent,
    );
  }
  if (block.toolResult?.content) {
    block.toolResult.content = block.toolResult.content.map(
      (part) => normalizeNativeContentBlock(part as ContentBlock) as typeof part,
    );
  }
  if (block.guardContent?.image?.source?.bytes) {
    block.guardContent.image.source.bytes = decodeNativeBytes(
      block.guardContent.image.source.bytes,
    );
  }
  return block;
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
          if (Array.isArray(msg.content)) {
            systemMessages.push(
              ...msg.content.map((block: SystemContentBlock | string) =>
                typeof block === 'string'
                  ? { text: block }
                  : (normalizeNativeContentBlock(block as ContentBlock) as SystemContentBlock),
              ),
            );
          } else {
            systemMessages.push({
              text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            });
          }
        } else if (msg.role === 'user' || msg.role === 'assistant') {
          // Convert content to ContentBlock format
          const contentBlocks: ContentBlock[] = [];

          if (typeof msg.content === 'string') {
            contentBlocks.push({ text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (typeof block === 'string') {
                contentBlocks.push({ text: block });
              } else if (isNativeContentBlock(block)) {
                contentBlocks.push(normalizeNativeContentBlock(block));
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
    } else if (block.citationsContent) {
      parts.push((block.citationsContent.content ?? []).map((part) => part.text ?? '').join(''));
    } else if (block.toolResult || block.image || block.audio || block.video) {
      parts.push(JSON.stringify(block));
    } else if ('reasoningContent' in block && block.reasoningContent) {
      // Handle extended thinking content
      const reasoning = block.reasoningContent;
      if (showThinking) {
        if ('reasoningText' in reasoning && reasoning.reasoningText) {
          const thinkingText = reasoning.reasoningText.text || '';
          const signature = reasoning.reasoningText.signature || '';
          // Adaptive thinking with the default display "omitted" (Claude 5)
          // returns an empty thinking block carrying only a signature —
          // exclude it, matching outputFromMessage on the Anthropic paths.
          if (thinkingText.trim() !== '') {
            parts.push(`<thinking>\n${thinkingText}\n</thinking>`);
            if (signature) {
              parts.push(`Signature: ${signature}`);
            }
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
  private forcedToolChoiceRemovalWarned = false;

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
    return loadProviderCallbackFromFileUrl(fileRef, '[Bedrock Converse]');
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    callId?: string,
  ): Promise<string> {
    return executeProviderFunctionCallback({
      functionName,
      args,
      callId,
      callbacks: this.config.functionToolCallbacks,
      cache: this.loadedFunctionCallbacks,
      logPrefix: '[Bedrock Converse]',
    });
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
    const native = this.config.inferenceConfig;
    const reasoning =
      this.config.reasoningConfig ??
      (this.config.additionalModelRequestFields
        ?.reasoningConfig as BedrockConverseOptions['reasoningConfig']);
    const reasoningEnabled = reasoning?.type === 'enabled';
    const isHighEffort = reasoning?.maxReasoningEffort === 'high';

    // Get potential values
    const maxTokensValue = native
      ? native.maxTokens
      : (this.config.maxTokens ??
        this.config.max_tokens ??
        getEnvInt('AWS_BEDROCK_MAX_TOKENS') ??
        undefined);

    const temperatureValue = native
      ? native.temperature
      : (this.config.temperature ?? getEnvFloat('AWS_BEDROCK_TEMPERATURE') ?? undefined);

    const topPValue = native
      ? native.topP
      : (this.config.topP ?? this.config.top_p ?? getEnvFloat('AWS_BEDROCK_TOP_P'));

    let stopSequences = native
      ? native.stopSequences
      : this.config.stopSequences || this.config.stop;
    if (!native && !stopSequences) {
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
    // Newer Claude models deprecate manual sampling controls at the model
    // level — a request that pins `temperature` or `topP` on Bedrock returns
    // ValidationException. Drop both regardless of where they came from (config
    // or AWS_BEDROCK_TEMPERATURE / AWS_BEDROCK_TOP_P).
    const samplingParamsDeprecated = isSamplingParamsDeprecatedClaudeModel(this.modelName);
    let temperature = reasoningEnabled || samplingParamsDeprecated ? undefined : temperatureValue;
    let topP = reasoningEnabled || samplingParamsDeprecated ? undefined : topPValue;
    // Converse relays Claude's own rules as ValidationExceptions: no temperature with topP,
    // and with extended thinking no temperature and a topP of at least 0.95. Other model
    // families accept both, so only Claude models go through the shared resolver.
    if (this.modelName.includes('anthropic.claude')) {
      const rawThinking = this.config.additionalModelRequestFields?.thinking as
        | { type?: string }
        | undefined;
      const { sampling, warnings } = resolveClaudeSamplingParams(
        { temperature, top_p: topP },
        {
          thinkingEnabled: isClaudeThinkingEnabled(this.config.thinking ?? rawThinking),
          samplingParamsDeprecated,
        },
      );
      for (const warning of warnings) {
        logger.warn(warning);
      }
      temperature = sampling.temperature;
      topP = sampling.top_p;
    }

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
    const configTools =
      promptConfig?.tools ??
      promptConfig?.toolConfig?.tools ??
      this.config.tools ??
      this.config.toolConfig?.tools;
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
    const requestedToolChoice = configToolChoice
      ? convertToolChoiceToConverseFormat(configToolChoice)
      : undefined;
    const modelRejectsForcedToolChoice = isForcedToolChoiceUnsupportedClaudeModel(this.modelName);
    const dropForcedToolChoice =
      (modelRejectsForcedToolChoice || isAlwaysOnAdaptiveThinkingClaudeModel(this.modelName)) &&
      requestedToolChoice !== undefined &&
      ('any' in requestedToolChoice || 'tool' in requestedToolChoice);
    if (dropForcedToolChoice && !this.forcedToolChoiceRemovalWarned) {
      const modelName = getClaudeModelWarningName(this.modelName) ?? 'this Claude model';
      logger.warn(
        modelRejectsForcedToolChoice
          ? `Forced tool choice (any/tool) is not supported on ${modelName} and has been omitted. The model decides when to call tools; remove toolChoice to silence this warning.`
          : `Forced tool choice (any/tool) is incompatible with the always-on adaptive thinking of ${modelName} and has been omitted. The model decides when to call tools; remove toolChoice to silence this warning.`,
      );
      this.forcedToolChoiceRemovalWarned = true;
    }
    const toolChoice = dropForcedToolChoice ? undefined : requestedToolChoice;

    return {
      tools: converseTools,
      ...(toolChoice ? { toolChoice } : {}),
    };
  }

  private getEffectiveToolChoice(promptConfig?: Partial<BedrockConverseOptions>): unknown {
    return (
      promptConfig?.tool_choice ??
      promptConfig?.toolChoice ??
      promptConfig?.toolConfig?.toolChoice ??
      this.config.tool_choice ??
      this.config.toolChoice ??
      this.config.toolConfig?.toolChoice
    );
  }

  /**
   * Build the guardrail configuration
   */
  private buildGuardrailConfig(): GuardrailConfiguration | undefined {
    if (this.config.guardrailConfig) {
      const { guardrailIdentifier, guardrailVersion, trace } = this.config.guardrailConfig;
      return {
        ...(guardrailIdentifier === undefined
          ? {}
          : { guardrailIdentifier: String(guardrailIdentifier) }),
        ...(guardrailVersion === undefined ? {} : { guardrailVersion: String(guardrailVersion) }),
        ...(trace ? { trace } : {}),
      };
    }
    if (!this.config.guardrailIdentifier) {
      return undefined;
    }

    return {
      // YAML can deserialize unquoted guardrail values as numbers despite their TypeScript types.
      guardrailIdentifier: String(this.config.guardrailIdentifier as unknown),
      guardrailVersion: String((this.config.guardrailVersion || 'DRAFT') as unknown),
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
    // Converse has no typed effort option, but `output_config.effort` is a supported escape
    // hatch through these raw fields, so read it back out for the effort-capped thinking rules
    // (turning thinking off at `xhigh`/`max` is a 400 on Opus 5 and Sonnet 5.5).
    const effort =
      (this.config.outputConfig?.effort as ClaudeEffort | undefined) ??
      (fields.output_config as { effort?: ClaudeEffort } | undefined)?.effort;
    // Raw additional fields must not bypass the model's sampling/thinking constraints. Every
    // sampling-deprecated Claude model (Claude 5, Opus 4.7/4.8) rejects temperature/top_p/top_k,
    // so strip them from the raw fields too; normalizeClaudeThinkingConfig then converts enabled
    // -> adaptive and applies the model's rules for `disabled` (dropped, or `between_tools`).
    if (isSamplingParamsDeprecatedClaudeModel(this.modelName)) {
      delete fields.temperature;
      delete fields.top_p;
      delete fields.top_k;
      const additionalThinking = fields.thinking as
        | { type: string; display?: 'summarized' | 'omitted' }
        | undefined;
      const normalizedThinking = normalizeClaudeThinkingConfig(
        this.modelName,
        additionalThinking,
        effort,
      );
      if (normalizedThinking === undefined) {
        delete fields.thinking;
      } else {
        fields.thinking = normalizedThinking;
      }
    }

    // Add thinking configuration for Claude models
    if (this.config.thinking) {
      const normalizedThinking = normalizeClaudeThinkingConfig(
        this.modelName,
        this.config.thinking,
        effort,
      );
      if (normalizedThinking !== undefined) {
        fields.thinking = normalizedThinking;
      }
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

  private getEffectiveInferenceConfig(): InferenceConfiguration | undefined {
    if (/^arn:[^:]+:bedrock:[^:]+:[^:]+:prompt\//.test(this.modelName)) {
      return undefined;
    }
    return this.buildInferenceConfig();
  }

  private async buildRequest(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ConverseCommandInput> {
    const { messages, system } = parseConverseMessages(prompt);
    const managedPrompt = /^arn:[^:]+:bedrock:[^:]+:[^:]+:prompt\//.test(this.modelName);
    const input: ConverseCommandInput = {
      modelId: this.modelName,
      ...(managedPrompt && !prompt.trim() ? {} : { messages }),
      guardrailConfig: this.buildGuardrailConfig(),
      additionalModelResponseFieldPaths: this.config.additionalModelResponseFieldPaths,
      performanceConfig: this.buildPerformanceConfig(),
      serviceTier: this.buildServiceTier(),
      outputConfig: this.config.outputConfig,
      promptVariables: renderVarsInObject(this.config.promptVariables, context?.vars),
      requestMetadata: this.config.requestMetadata,
    };
    if (managedPrompt) {
      const conflicting = [
        'inferenceConfig',
        'maxTokens',
        'max_tokens',
        'temperature',
        'topP',
        'top_p',
        'stopSequences',
        'stop',
        'system',
        'tools',
        'toolConfig',
        'toolChoice',
        'tool_choice',
        'thinking',
        'reasoningConfig',
        'additionalModelRequestFields',
      ] as const;
      if (
        system ||
        conflicting.some((key) => this.config[key] !== undefined) ||
        context?.prompt?.config?.tools ||
        context?.prompt?.config?.toolConfig ||
        context?.prompt?.config?.toolChoice !== undefined ||
        context?.prompt?.config?.tool_choice !== undefined
      ) {
        throw new Error(
          'Managed Bedrock prompts define system, inferenceConfig, toolConfig, and additionalModelRequestFields in Prompt management; remove these overrides',
        );
      }
      return input;
    }
    return {
      ...input,
      system:
        this.config.system?.map(
          (block) =>
            normalizeNativeContentBlock(
              structuredClone(block) as ContentBlock,
            ) as SystemContentBlock,
        ) ?? system,
      inferenceConfig: this.getEffectiveInferenceConfig(),
      toolConfig: await this.buildToolConfig(
        context?.vars,
        context?.prompt?.config as Partial<BedrockConverseOptions> | undefined,
      ),
      additionalModelRequestFields: this.buildAdditionalModelRequestFields(),
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

    const inferenceConfig = this.getEffectiveInferenceConfig();

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
      testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
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
    return withGenAISpan(
      spanContext,
      async () => {
        try {
          return await (this.config.streaming
            ? this.callApiStreaming(prompt, context)
            : this.callApiInternal(prompt, context));
        } catch (err) {
          return { error: `Bedrock Converse API error: ${errorMessage(err)}` };
        }
      },
      resultExtractor,
    );
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    streaming = false,
  ): Promise<ProviderResponse> {
    const converseInput: ConverseStreamCommandInput = await this.buildRequest(prompt, context);
    if (
      streaming &&
      converseInput.guardrailConfig &&
      this.config.guardrailConfig?.streamProcessingMode
    ) {
      converseInput.guardrailConfig.streamProcessingMode =
        this.config.guardrailConfig.streamProcessingMode;
    }
    const toolsDisabled = this.isRequestToolsDisabled(context);
    const betweenToolsThinking =
      (converseInput.additionalModelRequestFields as { thinking?: { type?: string } } | undefined)
        ?.thinking?.type === 'between_tools';

    // Check cache
    const cache = await getCache();
    const region = this.getRegion();
    const useCache = isCacheEnabled() && !shouldBustProviderCache(context);
    const cacheKey = `bedrock:${streaming ? 'converse-stream' : 'converse'}:${this.modelName}:${region}:${createBedrockCacheKeyHash(
      {
        config: this.config,
        params: { ...converseInput, requestMetadata: undefined },
        region,
      },
    )}`;

    if (useCache) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug('Returning cached response');
        const parsed = JSON.parse(cachedResponse as string) as ConverseCommandOutput;
        const result = await this.parseResponse(
          parsed,
          toolsDisabled,
          betweenToolsThinking,
          streaming,
        );
        return withResponseCacheMetadata(result, true);
      }
    }

    // Make the API call
    let response: ConverseCommandOutput;
    try {
      const bedrockInstance = await this.getBedrockInstance();

      // Import and use ConverseCommand
      const { ConverseCommand, ConverseStreamCommand } = await import(
        '@aws-sdk/client-bedrock-runtime'
      );
      response = streaming
        ? await collectConverseStream(
            await bedrockInstance.send(new ConverseStreamCommand(converseInput)),
          )
        : await bedrockInstance.send(new ConverseCommand(converseInput));
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
          error: `Bedrock access denied: ${errorMessage}. Ensure you have bedrock:${streaming ? 'InvokeModelWithResponseStream' : 'InvokeModel'} permission and model access is enabled.`,
        };
      }

      return {
        error: `Bedrock ${streaming ? 'ConverseStream' : 'Converse'} API error: ${errorMessage}`,
      };
    }

    // Cache the response
    if (useCache) {
      try {
        await cache.set(
          cacheKey,
          JSON.stringify(response, (_key, value) =>
            value instanceof Uint8Array ? { type: 'Buffer', data: Array.from(value) } : value,
          ),
        );
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    logger.debug('Bedrock Converse API response received', {
      stopReason: response.stopReason,
      hasUsage: !!response.usage,
      hasMetrics: !!response.metrics,
    });

    return await this.parseResponse(response, toolsDisabled, betweenToolsThinking, streaming);
  }

  /**
   * Resolves the effective tool choice for a request without touching the MCP
   * client. Used by `callApi`/`callApiStreaming` to short-circuit MCP init for
   * tool-disabled requests so a hung MCP transport never stalls them, and to supply
   * the `toolsDisabled` flag those methods pass on to `parseResponse`.
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
      if (isMcpErrorResult(mcpResult)) {
        const msg = formatMcpToolError(name, getMcpErrorMessage(mcpResult));
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
    betweenToolsThinking = false,
    preserveText = false,
  ): Promise<ProviderResponse> {
    // Extract output text
    const outputMessage = response.output?.message;
    const content = (outputMessage?.content || []).map(normalizeNativeContentBlock);
    const showThinking = this.config.showThinking !== false;

    // Extract token usage
    const usage = response.usage;
    const promptTokens = usage?.inputTokens;
    const completionTokens = usage?.outputTokens;
    const totalTokens = usage?.totalTokens;
    const cacheReadTokens = usage?.cacheReadInputTokens;
    const cacheWriteTokens = usage?.cacheWriteInputTokens;
    const cacheWrite1hTokens = getOneHourCacheWriteTokens(usage?.cacheDetails);

    const totalInputTokens =
      promptTokens === undefined
        ? undefined
        : promptTokens + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
    const tokenUsage: Partial<TokenUsage> = {
      prompt: totalInputTokens,
      completion: completionTokens,
      total:
        totalTokens ??
        (totalInputTokens !== undefined && completionTokens !== undefined
          ? totalInputTokens + completionTokens
          : undefined),
      numRequests: 1,
      ...(cacheReadTokens === undefined ? {} : { cached: cacheReadTokens }),
      ...(cacheReadTokens === undefined && cacheWriteTokens === undefined
        ? {}
        : {
            completionDetails: {
              ...(cacheReadTokens === undefined ? {} : { cacheReadInputTokens: cacheReadTokens }),
              ...(cacheWriteTokens === undefined
                ? {}
                : { cacheCreationInputTokens: cacheWriteTokens }),
            },
          }),
    };

    // Calculate cost
    const cost = calculateBedrockCost(
      this.modelName,
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      this.getRegion(),
      response.serviceTier?.type ? { type: response.serviceTier.type } : this.config.serviceTier,
      cacheWrite1hTokens,
    );

    // Build metadata
    const metadata: Record<string, unknown> = { content };

    // Add latency
    if (response.metrics?.latencyMs !== undefined) {
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
        'toolUse' in block &&
        block.toolUse !== undefined &&
        block.toolUse.type !== 'server_tool_use',
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

    if (!toolsDisabled && response.stopReason === 'tool_use' && toolUseBlocks.length > 0) {
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
            const result = await this.executeFunctionCallback(
              functionName,
              args,
              block.toolUse.toolUseId,
            );
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
      if (betweenToolsThinking || preserveText) {
        const progress = extractTextFromContentBlocks(
          content.filter((block) => (preserveText ? !block.toolUse : block.reasoningContent)),
          showThinking,
        );
        if (progress) {
          dispatchResults.unshift(progress);
        }
      }
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

  /** Aggregate ConverseStream with the same metadata, guardrails, and tool dispatch as Converse. */
  async callApiStreaming(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const initErrorResponse = await this.awaitMcpReadyForRequest(context);
    if (initErrorResponse) {
      return initErrorResponse;
    }
    try {
      return await this.callApiInternal(prompt, context, true);
    } catch (err) {
      return { error: `Bedrock ConverseStream API error: ${errorMessage(err)}` };
    }
  }
}
