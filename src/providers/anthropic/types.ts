import type Anthropic from '@anthropic-ai/sdk';

import type { MCPConfig } from '../mcp/types';
import type { OpenAIToolChoice } from '../shared';

// Keep the public config names while using the SDK's version-specific fields.
export type WebFetchToolConfig = Anthropic.Messages.WebFetchTool20250910;
export type WebFetchToolConfig20260209 = Anthropic.Messages.WebFetchTool20260209;
export type WebFetchToolConfigV2 = Anthropic.Messages.WebFetchTool20260309;
export type WebFetchToolConfig20260318 = Anthropic.Messages.WebFetchTool20260318;
export type WebSearchToolConfig = Anthropic.Messages.WebSearchTool20250305;
export type WebSearchToolConfig20260209 = Anthropic.Messages.WebSearchTool20260209;
export type WebSearchToolConfig20260318 = Anthropic.Messages.WebSearchTool20260318;

export type MemoryToolConfig = Anthropic.Messages.MemoryTool20250818;

export type AnthropicToolConfig =
  | WebFetchToolConfig
  | WebFetchToolConfig20260209
  | WebFetchToolConfigV2
  | WebFetchToolConfig20260318
  | WebSearchToolConfig
  | WebSearchToolConfig20260209
  | WebSearchToolConfig20260318
  | MemoryToolConfig;

// Structured outputs configuration (JSON schema)
export interface OutputFormat {
  type: 'json_schema';
  schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: false;
    [key: string]: any;
  };
}

// Sonnet 5.5 adds this wire value before the pinned SDK's thinking union includes it.
export type ClaudeThinkingConfig =
  | Anthropic.Messages.ThinkingConfigParam
  | { type: 'between_tools' };

/** The reasoning-depth ladder Claude accepts on `output_config.effort`. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Options shared by every Anthropic provider. `AnthropicGenericProvider` types its
 * `config` as this, and the per-provider option interfaces extend it, so a field added
 * here reaches all of them instead of having to be copied.
 */
export interface AnthropicBaseOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  /**
   * When `false`, skip promptfoo's upfront API key check and authenticate
   * through a local Claude Code session (OAuth credential from the macOS
   * keychain or `$HOME/.claude/.credentials.json`). Lets Claude.ai Max /
   * Pro subscribers run evals — including `llm-rubric` grading — without a
   * separate Anthropic Console API key.
   *
   * Matches the `apiKeyRequired` option already exposed by the
   * `anthropic:claude-agent-sdk` provider.
   *
   * @default true
   */
  apiKeyRequired?: boolean;
  headers?: Record<string, string>;
  cost?: number;
  inputCost?: number;
  outputCost?: number;
}

export interface AnthropicMessageOptions extends AnthropicBaseOptions {
  cache_control?: Anthropic.Messages.CacheControlEphemeral | null; // Top-level cache control - auto-applies to last cacheable block
  effort?: ClaudeEffort; // Controls output quality/speed tradeoff
  extra_body?: Record<string, any>;
  max_tokens?: number;
  metadata?: Anthropic.Messages.Metadata; // Request metadata for tracking/abuse detection
  model?: string;
  service_tier?: 'auto' | 'standard_only'; // Priority tier for API requests
  stop_sequences?: string[]; // Custom stop sequences
  stream?: boolean; // Enable streaming for long-running operations like extended thinking
  temperature?: number;
  thinking?: ClaudeThinkingConfig;
  tool_choice?: Anthropic.Messages.ToolChoice | OpenAIToolChoice;
  tools?: (Anthropic.Messages.ToolUnion | AnthropicToolConfig)[];
  top_k?: number;
  top_p?: number;
  beta?: string[]; // For features like 'output-128k-2025-02-19', 'web-fetch-2025-09-10', 'structured-outputs-2025-11-13'
  showThinking?: boolean;
  mcp?: MCPConfig;
  /**
   * Maximum number of MCP tool executions across Anthropic Messages
   * continuations. Defaults to 8. This is enforced locally by promptfoo and is
   * not sent to Anthropic.
   */
  max_tool_calls?: number;
  output_format?: OutputFormat; // Structured outputs - JSON schema for response format
}

export interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  mcp?: MCPConfig;
}
