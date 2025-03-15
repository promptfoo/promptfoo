import type Anthropic from '@anthropic-ai/sdk';

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
  top_k?: number;
  top_p?: number;
  beta?: string[]; // For features like 'output-128k-2025-02-19'
  showThinking?: boolean;
}

export interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}
