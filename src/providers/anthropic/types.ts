import type Anthropic from '@anthropic-ai/sdk';

import type { MCPConfig } from '../mcp/types';
import type { OpenAIToolChoice } from '../shared';

type AnthropicServerToolCaller = 'direct' | 'code_execution_20250825' | 'code_execution_20260120';

interface BaseAnthropicServerToolConfig {
  allowed_callers?: AnthropicServerToolCaller[];
  cache_control?: Anthropic.Messages.CacheControlEphemeral;
  defer_loading?: boolean;
  max_uses?: number;
  strict?: boolean;
}

interface BaseWebFetchToolConfig extends BaseAnthropicServerToolConfig {
  name: 'web_fetch';
  allowed_domains?: string[];
  blocked_domains?: string[];
  citations?: {
    enabled: boolean;
  };
  max_content_tokens?: number;
}

interface BaseWebSearchToolConfig extends BaseAnthropicServerToolConfig {
  name: 'web_search';
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: Anthropic.Messages.UserLocation;
}

// Web fetch tool configuration (v1 — does not support use_cache)
export interface WebFetchToolConfig extends BaseWebFetchToolConfig {
  type: 'web_fetch_20250910';
}

// Web fetch tool configuration (stable 2026-02-09 version)
export interface WebFetchToolConfig20260209 extends BaseWebFetchToolConfig {
  type: 'web_fetch_20260209';
}

// Web fetch tool configuration (2026-03-09 version, adds use_cache)
export interface WebFetchToolConfigV2 extends BaseWebFetchToolConfig {
  type: 'web_fetch_20260309';
  use_cache?: boolean;
}

/**
 * Web fetch tool configuration (latest, 2026-03-18). Adds `response_inclusion`:
 * `'excluded'` drops the nested server_tool_use/result block pair from the response,
 * which keeps large fetched pages out of the transcript. Direct calls and paused
 * code_execution calls are always returned in full so they can be replayed.
 */
export interface WebFetchToolConfig20260318 extends BaseWebFetchToolConfig {
  type: 'web_fetch_20260318';
  use_cache?: boolean;
  response_inclusion?: 'full' | 'excluded';
}

// Web search tool configuration (for reference)
export interface WebSearchToolConfig extends BaseWebSearchToolConfig {
  type: 'web_search_20250305';
}

// Web search tool configuration (stable 2026-02-09 version)
export interface WebSearchToolConfig20260209 extends BaseWebSearchToolConfig {
  type: 'web_search_20260209';
}

/** Web search tool configuration (latest, 2026-03-18). See WebFetchToolConfig20260318. */
export interface WebSearchToolConfig20260318 extends BaseWebSearchToolConfig {
  type: 'web_search_20260318';
  response_inclusion?: 'full' | 'excluded';
}

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
  thinking?: Anthropic.Messages.ThinkingConfigParam;
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
