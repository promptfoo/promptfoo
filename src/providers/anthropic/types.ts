import type Anthropic from '@anthropic-ai/sdk';

import type { MCPConfig } from '../mcp/types';

// Web fetch tool configuration
export interface WebFetchToolConfig {
  type: 'web_fetch_20250910';
  name: 'web_fetch';
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  citations?: {
    enabled: boolean;
  };
  max_content_tokens?: number;
  cache_control?: Anthropic.Beta.Messages.BetaCacheControlEphemeral;
}

// Web search tool configuration (for reference)
export interface WebSearchToolConfig {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses?: number;
  cache_control?: Anthropic.Beta.Messages.BetaCacheControlEphemeral;
}

export type AnthropicToolConfig = WebFetchToolConfig | WebSearchToolConfig;

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
  cost?: number;
  extra_body?: Record<string, any>;
  headers?: Record<string, string>;
  max_tokens?: number;
  model?: string;
  stream?: boolean; // Enable streaming for long-running operations like extended thinking
  temperature?: number;
  thinking?: Anthropic.Messages.ThinkingConfigParam;
  tool_choice?: Anthropic.Messages.ToolChoice;
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
