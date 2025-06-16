import type { MCPConfig } from '../mcp/types';

export interface OpenAiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiKeyRequired?: boolean;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

export interface OpenAiFunction {
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface OpenAiFunctionCall {
  name: string;
}

export interface OpenAiTool {
  type: 'function' | 'mcp';
  function?: OpenAiFunction;
  server_label?: string;
  server_url?: string;
  require_approval?: string | Record<string, any>;
  headers?: Record<string, string>;
  allowed_tools?: string[];
}

export interface OpenAiToolChoice {
  type: 'function';
  function?: {
    name: string;
  };
}

export interface OpenAiResponseFormat {
  type: 'json_object' | 'json_schema' | 'text';
  json_schema?: {
    name: string;
    strict?: boolean;
    schema?: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/**
 * **o-series models only**
 *
 * Constrains effort on reasoning for
 * [reasoning models](https://platform.openai.com/docs/guides/reasoning). Currently
 * supported values are `low`, `medium`, and `high`. Reducing reasoning effort can
 * result in faster responses and fewer tokens used on reasoning in a response.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high' | null;

/**
 * **o-series models only**
 *
 * Configuration options for
 * [reasoning models](https://platform.openai.com/docs/guides/reasoning).
 */
export interface Reasoning {
  /**
   * **o-series models only**
   *
   * Constraints effort on reasoning for
   * [reasoning models](https://platform.openai.com/docs/guides/reasoning). Currently
   * supported values are `low`, `medium`, and `high`. Reducing reasoning effort can
   * result in faster responses and fewer tokens used on reasoning in a response.
   */
  effort?: ReasoningEffort;

  /**
   * A summary of the reasoning performed by the model. This can be useful for
   * debugging and understanding the model's reasoning process. One of `auto`,
   * `concise`, or `detailed`.
   */
  summary?: 'auto' | 'concise' | 'detailed' | null;
}

// OpenAI MCP tool configuration for Responses API
export interface OpenAiMCPTool {
  type: 'mcp';
  server_label: string;
  server_url: string;
  require_approval?:
    | 'never'
    | {
        never?: {
          tool_names: string[];
        };
      };
  allowed_tools?: string[];
  headers?: Record<string, string>;
}

export interface OpenAiCompletionOptions extends OpenAiSharedOptions {
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | OpenAiFunctionCall;
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | OpenAiToolChoice;
  tool_resources?: Record<string, any>;
  parallel_tool_calls?: boolean;
  response_format?: OpenAiResponseFormat;
  seed?: number;
  stop?: string | string[];
  max_tokens?: number;
  max_completion_tokens?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  user?: string;
  n?: number;
  reasoning_effort?: ReasoningEffort;
  reasoning?: Reasoning;
  service_tier?: ('auto' | 'default' | 'premium') | null;
  metadata?: Record<string, string>;
  store?: boolean;
  showThinking?: boolean;
  modalities?: string[];
  audio?: {
    bitrate?: string;
    format?: string | 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16' | 'aac';
    speed?: number;
    voice?: string;
  };
  passthrough?: object;
  functionToolCallbacks?: Record<string, (arg: string) => Promise<string>>;
  mcp?: MCPConfig;
  // Responses API specific
  instructions?: string;
  max_output_tokens?: number;
  stream?: boolean;
}
