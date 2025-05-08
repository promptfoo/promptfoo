import type Anthropic from '@anthropic-ai/sdk';
import type { MCPConfig } from '../mcp/types';

export interface AnthropicWebSearchConfig {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: {
    type: 'approximate';
    city: string;
    region: string;
    country: string;
    timezone: string;
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
  temperature?: number;
  thinking?: Anthropic.Messages.ThinkingConfigParam;
  tool_choice?: Anthropic.Messages.ToolChoice;
  tools?: Anthropic.Tool[];
  web_search?: AnthropicWebSearchConfig;
  top_k?: number;
  top_p?: number;
  beta?: string[]; // For features like 'output-128k-2025-02-19'
  showThinking?: boolean;
  mcp?: MCPConfig;
}

export interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  mcp?: MCPConfig;
}
