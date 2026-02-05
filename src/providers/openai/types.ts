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
  /** defaults to 4; set to 0 to disable retries; negative values are clamped to 0. */
  maxRetries?: number;
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | null;

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

export type GPT5Reasoning = Omit<Reasoning, 'effort'> & {
  effort?: ReasoningEffort | 'minimal';
};

/** Verbosity level supported by GPT-5 models */
export type GPT5Verbosity = 'low' | 'medium' | 'high';

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
  reasoning?: Reasoning | GPT5Reasoning;
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

  /**
   * GPT-5 only: Controls the verbosity of the model's responses. Ignored for non-GPT-5 models.
   */
  verbosity?: GPT5Verbosity;
};

// =============================================================================
// Video Generation Types (Sora)
// =============================================================================

/**
 * Supported Sora video models
 */
export type OpenAiVideoModel = 'sora-2' | 'sora-2-pro';

/**
 * Supported video sizes (aspect ratios)
 */
export type OpenAiVideoSize = '1280x720' | '720x1280';

/**
 * Valid video duration in seconds (Sora API only accepts these values)
 */
export type OpenAiVideoDuration = 4 | 8 | 12;

/**
 * Video generation job status
 */
export type OpenAiVideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

/**
 * Video content variants available for download
 */
export type OpenAiVideoVariant = 'video' | 'thumbnail' | 'spritesheet';

/**
 * Configuration options for OpenAI video generation (Sora)
 */
export interface OpenAiVideoOptions extends OpenAiSharedOptions {
  // Model selection
  model?: OpenAiVideoModel;

  // Video parameters
  size?: OpenAiVideoSize;
  seconds?: OpenAiVideoDuration;

  // Image-to-video: base64 image data or file path (file://path)
  input_reference?: string;

  // Remix mode: ID of previous video to modify
  remix_video_id?: string;

  // Polling configuration
  poll_interval_ms?: number; // Default: 10000 (10 seconds)
  max_poll_time_ms?: number; // Default: 600000 (10 minutes)

  // Output options
  download_thumbnail?: boolean; // Default: true
  download_spritesheet?: boolean; // Default: true
}

/**
 * Sora API video job response
 */
export interface OpenAiVideoJob {
  id: string;
  object: 'video';
  created_at: number;
  status: OpenAiVideoStatus;
  model: string;
  progress?: number; // 0-100
  seconds?: string;
  size?: string;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * Request body for creating a new video
 */
export interface OpenAiVideoCreateRequest {
  model: string;
  prompt: string;
  size?: string;
  seconds?: OpenAiVideoDuration;
  input_reference?: string;
}

/**
 * Request body for remixing an existing video
 */
export interface OpenAiVideoRemixRequest {
  prompt: string;
}
