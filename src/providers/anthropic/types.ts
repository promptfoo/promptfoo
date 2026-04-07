import type Anthropic from '@anthropic-ai/sdk';

import type { MCPConfig } from '../mcp/types';
import type { OpenAIToolChoice } from '../shared';

type AnthropicServerToolCaller = 'direct' | 'code_execution_20250825' | 'code_execution_20260120';

interface BaseAnthropicServerToolConfig {
  allowed_callers?: AnthropicServerToolCaller[];
  cache_control?: Anthropic.Beta.Messages.BetaCacheControlEphemeral;
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

// Web fetch tool configuration (latest version with use_cache support)
export interface WebFetchToolConfigV2 extends BaseWebFetchToolConfig {
  type: 'web_fetch_20260309';
  use_cache?: boolean;
}

// Web search tool configuration (for reference)
export interface WebSearchToolConfig extends BaseWebSearchToolConfig {
  type: 'web_search_20250305';
}

// Web search tool configuration (stable 2026-02-09 version)
export interface WebSearchToolConfig20260209 extends BaseWebSearchToolConfig {
  type: 'web_search_20260209';
}

export type AnthropicToolConfig =
  | WebFetchToolConfig
  | WebFetchToolConfig20260209
  | WebFetchToolConfigV2
  | WebSearchToolConfig
  | WebSearchToolConfig20260209;

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

export interface AnthropicMessageOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  cache_control?: Anthropic.Messages.CacheControlEphemeral | null; // Top-level cache control - auto-applies to last cacheable block
  cost?: number;
  effort?: 'low' | 'medium' | 'high' | 'max'; // Controls output quality/speed tradeoff
  extra_body?: Record<string, any>;
  headers?: Record<string, string>;
  max_tokens?: number;
  metadata?: Anthropic.Messages.Metadata; // Request metadata for tracking/abuse detection
  model?: string;
  service_tier?: 'auto' | 'standard_only'; // Priority tier for API requests
  stop_sequences?: string[]; // Custom stop sequences
  stream?: boolean; // Enable streaming for long-running operations like extended thinking
  temperature?: number;
  thinking?: Anthropic.Messages.ThinkingConfigParam;
  tool_choice?: Anthropic.Messages.ToolChoice | OpenAIToolChoice;
  tools?: (Anthropic.Tool | AnthropicToolConfig)[];
  top_k?: number;
  top_p?: number;
  beta?: string[]; // For features like 'output-128k-2025-02-19', 'web-fetch-2025-09-10', 'structured-outputs-2025-11-13'
  showThinking?: boolean;
  mcp?: MCPConfig;
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
