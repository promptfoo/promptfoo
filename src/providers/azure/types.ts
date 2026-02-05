import type { AssistantCreationOptions, FunctionDefinition } from '@azure/openai-assistants';

import type { EnvOverrides } from '../../types/env';
import type { MCPConfig } from '../mcp/types';
import type { AssistantFunctionCallback } from '../openai/types';

/**
 * Options for configuring retry behavior
 */
interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds before the first retry */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes?: number[];
  /** Error message patterns that should trigger a retry */
  retryableErrorMessages?: string[];
}

export interface AzureCompletionOptions {
  // Azure identity params
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;
  /** @deprecated Use isReasoningModel instead. Indicates if the model should be treated as a reasoning model */
  o1?: boolean;
  isReasoningModel?: boolean; // Indicates if the model should be treated as a reasoning model (o1, o3-mini, etc.)
  max_completion_tokens?: number; // Maximum number of tokens to generate for reasoning models

  // Azure cognitive services params
  deployment_id?: string;
  dataSources?: any;

  // Promptfoo supported params
  apiHost?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiVersion?: string;
  headers?: { [key: string]: string };

  // System prompt for chat models
  systemPrompt?: string;

  // OpenAI params
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: {
    name: string;
    description?: string;
    parameters: any;
  }[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: {
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: any;
    };
  }[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function?: { name: string } };
  response_format?:
    | { type: 'json_object' }
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
            $defs?: Record<string, any>;
          };
        };
      };
  stop?: string[];
  seed?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
  /**
   * Controls the verbosity of the model's responses. Only used for reasoning models (GPT-5, o1, o3, etc.).
   */
  verbosity?: 'low' | 'medium' | 'high';

  /**
   * If set, automatically call these functions when the model calls them.
   * Keys are function names, values are either functions or strings (JavaScript code).
   */
  functionToolCallbacks?: Record<string, AssistantFunctionCallback | string>;

  passthrough?: object;
  mcp?: MCPConfig;
}

export interface AzureModelCost {
  id: string;
  cost: {
    input: number;
    output: number;
  };
}

export type AzureAssistantOptions = AzureCompletionOptions &
  Partial<AssistantCreationOptions> & {
    /**
     * If set, automatically call these functions when the assistant activates
     * these function tools.
     */
    functionToolCallbacks?: Record<FunctionDefinition['name'], AssistantFunctionCallback | string>;
    /**
     * Model to use for the assistant.
     */
    modelName?: string;
    /**
     * Tool resources configuration, including vector store IDs.
     */
    tool_resources?: {
      file_search?: {
        vector_store_ids?: string[];
      };
    };
    /**
     * Maximum timeout in milliseconds for API client requests
     */
    timeoutMs?: number;
    /**
     * Maximum time in milliseconds to poll for a run to complete before timing out
     */
    maxPollTimeMs?: number;
    /**
     * Configuration for network request retry behavior
     */
    retryOptions?: RetryOptions;
  };

export interface AzureProviderOptions {
  config?: AzureCompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

export interface AzureAssistantProviderOptions {
  config?: AzureAssistantOptions & { projectUrl?: string };
  id?: string;
  env?: EnvOverrides;
  /** Azure AI Project URL for Foundry agent provider */
}

// =============================================================================
// Azure Video Generation Types (Sora)
// =============================================================================

/**
 * Valid Azure Sora video dimensions as width x height strings
 */
export type AzureVideoSize =
  | '480x480'
  | '854x480'
  | '720x720'
  | '1280x720'
  | '1080x1080'
  | '1920x1080';

/**
 * Valid Azure Sora video durations in seconds
 */
export type AzureVideoDuration = 5 | 10 | 15 | 20;

/**
 * Azure video job status values
 */
export type AzureVideoStatus =
  | 'queued'
  | 'preprocessing'
  | 'running'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/**
 * Azure video inpainting item for image-to-video
 */
export interface AzureVideoInpaintItem {
  frame_index: number;
  type: 'image' | 'video';
  file_name: string;
  crop_bounds?: {
    left_fraction: number;
    top_fraction: number;
    right_fraction: number;
    bottom_fraction: number;
  };
}

/**
 * Configuration options for Azure video generation (Sora)
 */
export interface AzureVideoOptions extends AzureCompletionOptions {
  // Video parameters (Azure uses different names than OpenAI)
  width?: number; // 480, 720, 854, 1080, 1280, 1920
  height?: number; // 480, 720, 1080
  n_seconds?: AzureVideoDuration; // 5, 10, 15, 20
  n_variants?: number; // Number of video variants to generate (default: 1)

  // Image-to-video inpainting
  inpaint_items?: AzureVideoInpaintItem[];

  // Polling configuration
  poll_interval_ms?: number; // Default: 10000 (10 seconds)
  max_poll_time_ms?: number; // Default: 600000 (10 minutes)

  // Output options
  download_thumbnail?: boolean; // Default: true
}

/**
 * Azure video generation (individual video within a job)
 */
export interface AzureVideoGeneration {
  object: 'video.generation';
  id: string;
  job_id: string;
  created_at: number;
  width: number;
  height: number;
  n_seconds: number;
  prompt: string;
}

/**
 * Azure video job response structure
 */
export interface AzureVideoJob {
  object: 'video.generation.job';
  id: string;
  status: AzureVideoStatus;
  created_at: number;
  finished_at: number | null;
  expires_at: number | null;
  generations: AzureVideoGeneration[];
  prompt: string;
  model: string;
  n_variants: number;
  n_seconds: number;
  height: number;
  width: number;
  inpaint_items: AzureVideoInpaintItem[] | null;
  failure_reason: string | null;
}

/**
 * Azure video provider options
 */
export interface AzureVideoProviderOptions {
  config?: AzureVideoOptions;
  id?: string;
  env?: EnvOverrides;
}
