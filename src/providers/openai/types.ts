import { type OpenAiFunction, type OpenAiTool } from './util';
import type OpenAI from 'openai';

import type { MCPConfig } from '../mcp/types';

/**
 * Context provided to function callbacks for assistant providers
 */
export interface CallbackContext {
  /** The thread ID for the current conversation */
  threadId: string;
  /** The run ID for the current execution */
  runId: string;
  /** The assistant ID being used */
  assistantId: string;
  /** The provider type (e.g., 'openai', 'azure') */
  provider: string;
}

/**
 * Function callback that can receive context about the current assistant execution
 *
 * @param args - Function arguments. OpenAI Assistant provider passes parsed objects,
 *               Azure Assistant provider passes raw JSON strings.
 * @param context - Optional execution context with thread/run/assistant information
 */
export type AssistantFunctionCallback = (args: any, context?: CallbackContext) => Promise<string>;

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

// Responses API specific tool types
export interface OpenAiWebSearchTool {
  type: 'web_search_preview';
  search_context_size?: 'small' | 'medium' | 'large';
  user_location?: string;
}

export interface OpenAiCodeInterpreterTool {
  type: 'code_interpreter';
  container?: {
    type: 'auto' | string;
  };
}

export type OpenAiResponsesTool =
  | OpenAiTool
  | OpenAiMCPTool
  | OpenAiWebSearchTool
  | OpenAiCodeInterpreterTool;

export type OpenAiCompletionOptions = OpenAiSharedOptions & {
  temperature?: number;
  max_completion_tokens?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: (OpenAiTool | OpenAiMCPTool | OpenAiWebSearchTool | OpenAiCodeInterpreterTool)[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  tool_resources?: Record<string, any>;
  showThinking?: boolean;
  response_format?:
    | {
        type: 'json_object';
      }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            additionalProperties: false;
          };
        };
      };
  stop?: string[];
  seed?: number;
  passthrough?: object;
  reasoning_effort?: ReasoningEffort;
  reasoning?: Reasoning;
  service_tier?: ('auto' | 'default' | 'premium') | null;
  modalities?: string[];
  audio?: {
    bitrate?: string;
    format?: string | 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16' | 'aac';
    speed?: number;
    voice?: string;
  };

  // Responses API specific options
  instructions?: string;
  max_output_tokens?: number;
  max_tool_calls?: number;
  metadata?: Record<string, string>;
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
  store?: boolean;
  stream?: boolean;
  truncation?: 'auto' | 'disabled';
  user?: string;
  background?: boolean;
  webhook_url?: string;

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    AssistantFunctionCallback | string
  >;
  mcp?: MCPConfig;
};
