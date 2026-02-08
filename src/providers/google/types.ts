import type { GoogleAuthOptions } from 'google-auth-library';

import type { MCPConfig } from '../mcp/types';

/**
 * Model Armor configuration for Vertex AI integration.
 * Model Armor screens prompts and responses for safety, security, and compliance.
 * @see https://cloud.google.com/security-command-center/docs/model-armor-vertex-integration
 */
export interface ModelArmorConfig {
  /**
   * Full resource path to the Model Armor template for screening prompts.
   * Format: projects/{project}/locations/{location}/templates/{template_id}
   * @example "projects/my-project/locations/us-central1/templates/strict-safety"
   */
  promptTemplate?: string;

  /**
   * Full resource path to the Model Armor template for screening responses.
   * Format: projects/{project}/locations/{location}/templates/{template_id}
   * @example "projects/my-project/locations/us-central1/templates/strict-safety"
   */
  responseTemplate?: string;
}

interface Blob {
  mimeType: string;
  data: string; // base64-encoded string
}

export interface FunctionCall {
  name: string;
  args?: { [key: string]: any };
}

interface FunctionResponse {
  name: string;
  response: { [key: string]: any };
}

interface FileData {
  mimeType?: string;
  fileUri: string;
}

export interface Part {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

export interface Content {
  parts: Part[];
  role?: string;
}

export interface Schema {
  type: 'TYPE_UNSPECIFIED' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: { [key: string]: Schema };
  required?: string[];
  propertyOrdering?: string[];
  items?: Schema;
}

type SchemaType = Schema['type']; // Create a type alias for convenience

export const VALID_SCHEMA_TYPES: ReadonlyArray<SchemaType> = [
  'TYPE_UNSPECIFIED',
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
];

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Schema;
  response?: Schema;
}

interface GoogleSearchRetrieval {
  dynamicRetrievalConfig: {
    mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
    dynamicThreshold?: number;
  };
}

export interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  googleSearchRetrieval?: GoogleSearchRetrieval;
  codeExecution?: object;
  googleSearch?: object;

  // Note: These snake_case properties are supported but should be accessed with type assertions
  // Type definitions included for documentation purposes only
  // google_search_retrieval?: GoogleSearchRetrieval;
  // code_execution?: object;
  // google_search?: object;
}

export interface CompletionOptions {
  apiKey?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  /** Custom per-token cost override for cost calculation. */
  cost?: number;
  headers?: { [key: string]: string }; // Custom headers for the request
  projectId?: string;
  region?: string;
  publisher?: string;
  apiVersion?: string; // For Live API: 'v1alpha' or 'v1' (default: v1alpha)
  anthropicVersion?: string;
  anthropic_version?: string; // Alternative format
  /**
   * Google service account credentials.
   * Can be:
   * 1. JSON string containing service account key
   * 2. File path prefixed with 'file://' to load from external file
   * 3. Undefined to use default authentication (Application Default Credentials)
   */
  credentials?: string;

  // https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent#request-body
  context?: string;
  examples?: { input: string; output: string }[];
  safetySettings?: { category: string; probability: string }[];
  stopSequences?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  max_tokens?: number; // Alternative format for Claude models
  topP?: number;
  top_p?: number; // Alternative format for Claude models
  topK?: number;
  top_k?: number; // Alternative format for Claude models

  // Imagen image generation options
  n?: number; // Number of images to generate
  aspectRatio?: '1:1' | '16:9' | '9:16' | '3:4' | '4:3'; // Valid aspect ratios for Imagen
  personGeneration?: 'allow_all' | 'allow_adult' | 'dont_allow';
  safetyFilterLevel?:
    | 'block_most'
    | 'block_some'
    | 'block_few'
    | 'block_fewest'
    | 'block_low_and_above';
  addWatermark?: boolean;
  seed?: number;

  // Gemini native image generation options
  imageAspectRatio?:
    | '1:1'
    | '2:3'
    | '3:2'
    | '3:4'
    | '4:3'
    | '4:5'
    | '5:4'
    | '9:16'
    | '16:9'
    | '21:9';
  imageSize?: '1K' | '2K' | '4K';

  // Live API websocket timeout
  timeoutMs?: number;

  generationConfig?: {
    context?: string;
    examples?: { input: string; output: string }[];
    stopSequences?: string[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;

    // AI Studio
    response_mime_type?: string;
    response_schema?: string;

    // Live API
    response_modalities?: string[];

    // Speech configuration
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName?: string;
        };
      };
      languageCode?: string;
    };

    // Transcription configuration
    outputAudioTranscription?: Record<string, any>;
    inputAudioTranscription?: Record<string, any>;

    // Affective dialog (v1alpha only)
    enableAffectiveDialog?: boolean;

    // Proactive audio (v1alpha only)
    proactivity?: {
      proactiveAudio?: boolean;
    };

    // Thinking configuration for Gemini 2.5+ models
    // Gemini 3 Flash supports: MINIMAL, LOW, MEDIUM, HIGH
    // Gemini 3 Pro supports: LOW, HIGH
    thinkingConfig?: {
      thinkingBudget?: number;
      thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
    };
  };

  responseSchema?: string;

  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'MODE_UNSPECIFIED' | 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };

  tools?: Tool[];

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<string, ((arg: string) => Promise<any>) | string>;

  /**
   * If set, spawn a python process with the file and connect to its API
   * for function tool calls at the specified URL.
   */
  functionToolStatefulApi?: {
    url: string;
    file?: string;
    pythonExecutable?: string;
  };

  systemInstruction?: Content | string;

  /**
   * Model-specific configuration for Llama models
   */
  llamaConfig?: {
    safetySettings?: {
      enabled?: boolean;
      llama_guard_settings?: Record<string, unknown>;
    };
  };

  mcp?: MCPConfig;

  /**
   * Controls role mapping when converting from OpenAI format to Gemini format.
   * If true, uses 'assistant' role (for older Gemini versions).
   * If false (default), maps 'assistant' to 'model' (for newer Gemini versions).
   */
  useAssistantRole?: boolean;

  /**
   * Model Armor configuration for screening prompts and responses.
   * Only applicable for Vertex AI provider.
   * @see https://cloud.google.com/security-command-center/docs/model-armor-vertex-integration
   */
  modelArmor?: ModelArmorConfig;

  /**
   * Whether to use streaming API. Defaults to false.
   * Note: Model Armor floor settings only work with the non-streaming API.
   */
  streaming?: boolean;

  /**
   * Control Vertex AI express mode (API key authentication).
   *
   * Express mode is automatically enabled when an API key is available
   * (VERTEX_API_KEY, GOOGLE_API_KEY, or config.apiKey). Set to `false` to
   * explicitly disable express mode and force OAuth/ADC authentication.
   *
   * Note: Using API keys for Vertex may hit different quotas or fail with
   * project-scoped features (files, caches).
   *
   * @default Auto-enabled when API key is present
   * @see https://cloud.google.com/vertex-ai/generative-ai/docs/start/express-mode
   */
  expressMode?: boolean;

  /**
   * Google Cloud authentication options passed through to google-auth-library.
   *
   * Use this for advanced auth configuration like:
   * - Custom scopes
   * - keyFilename (path to service account key file)
   * - universeDomain (for private clouds)
   * - clientOptions
   *
   * @see https://github.com/googleapis/google-auth-library-nodejs
   */
  googleAuthOptions?: Partial<GoogleAuthOptions>;

  /**
   * Path to a service account key file.
   *
   * Convenience alias for `googleAuthOptions.keyFilename`.
   * The official SDK marks this as deprecated in favor of explicit credential loading,
   * but it remains functional for backward compatibility.
   *
   * @example '/path/to/service-account.json'
   */
  keyFilename?: string;

  /**
   * Custom OAuth scopes for authentication.
   *
   * Convenience alias for `googleAuthOptions.scopes`.
   * Defaults to 'https://www.googleapis.com/auth/cloud-platform'.
   *
   * @example ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/bigquery']
   */
  scopes?: string | string[];
}

/**
 * Configuration for the unified GoogleProvider.
 *
 * Extends CompletionOptions with explicit mode selection, aligning with
 * the Python SDK's `vertexai=True` parameter.
 *
 * @example
 * // Google AI Studio mode (default)
 * { vertexai: false }
 *
 * @example
 * // Vertex AI mode with OAuth
 * { vertexai: true, projectId: 'my-project', region: 'us-central1' }
 *
 * @example
 * // Vertex AI mode with API key (express mode)
 * { vertexai: true, apiKey: 'your-key' }
 */
export interface GoogleProviderConfig extends CompletionOptions {
  /**
   * Explicitly enable Vertex AI mode.
   *
   * When true: Uses Vertex AI endpoints with OAuth or API key authentication.
   * When false: Uses Google AI Studio endpoints with API key authentication.
   *
   * This mirrors the Python SDK's `vertexai=True` parameter.
   *
   * If not specified, mode is auto-detected:
   * 1. GOOGLE_GENAI_USE_VERTEXAI env var
   * 2. Presence of projectId or credentials (suggests Vertex)
   * 3. Default: false (Google AI Studio)
   *
   * @default undefined (auto-detect)
   */
  vertexai?: boolean;

  /**
   * Control mutual exclusivity validation behavior.
   *
   * When true: Throws an error if both apiKey AND projectId/region
   * are explicitly set. This aligns with Google's official SDK behavior.
   *
   * When false (default): Only warns about conflicts for backward compatibility.
   *
   * Note: This only applies to explicit config values, not environment variables.
   *
   * @default false
   */
  strictMutualExclusivity?: boolean;
}

// Claude API interfaces
interface ClaudeMessage {
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface ClaudeRequest {
  anthropic_version: string;
  stream: boolean;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  messages: ClaudeMessage[];
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
}

// =============================================================================
// Video Generation Types (Veo)
// =============================================================================

/**
 * Supported Veo video models
 */
export type GoogleVideoModel =
  | 'veo-3.1-generate-preview'
  | 'veo-3.1-fast-preview'
  | 'veo-3-generate'
  | 'veo-3-fast'
  | 'veo-2-generate';

/**
 * Supported aspect ratios for Veo video generation
 */
export type GoogleVideoAspectRatio = '16:9' | '9:16';

/**
 * Supported resolutions for Veo video generation
 */
export type GoogleVideoResolution = '720p' | '1080p';

/**
 * Valid video durations by model
 * Veo 3.1/3: 4, 6, 8 seconds
 * Veo 2: 5, 6, 8 seconds
 */
export type GoogleVideoDuration = 4 | 5 | 6 | 8;

/**
 * Person generation control settings
 */
export type GoogleVideoPersonGeneration = 'allow_all' | 'allow_adult' | 'dont_allow';

/**
 * Reference image for guiding video content (Veo 3.1 only)
 */
export interface GoogleVideoReferenceImage {
  /** Base64 encoded image data or file:// path */
  image: string;
  /** Type of reference: 'asset' for style/character/product guidance */
  referenceType: 'asset';
}

/**
 * Configuration options for Google video generation (Veo)
 */
export interface GoogleVideoOptions {
  // Model selection
  model?: GoogleVideoModel;

  // Video parameters
  aspectRatio?: GoogleVideoAspectRatio;
  resolution?: GoogleVideoResolution;
  durationSeconds?: GoogleVideoDuration;
  duration?: GoogleVideoDuration; // Alias for durationSeconds

  // Content guidance
  negativePrompt?: string;

  // Image-to-video: first frame
  image?: string; // Base64 or file:// path

  // Interpolation: last frame (Veo 3.1 only, requires image)
  lastFrame?: string; // Base64 or file:// path
  lastImage?: string; // Alias for lastFrame

  // Reference images (Veo 3.1 only, up to 3)
  // Can be string[] (file paths) or GoogleVideoReferenceImage[] (objects with referenceType)
  referenceImages?: (string | GoogleVideoReferenceImage)[];

  // Video extension (Veo 3.1 only)
  extendVideoId?: string; // Operation ID from previous Veo generation
  sourceVideo?: string; // Alias for extendVideoId (must be Veo operation ID, not file path)

  // Person generation control
  personGeneration?: GoogleVideoPersonGeneration;

  // Seed for improved (not guaranteed) determinism (Veo 3 only)
  seed?: number;

  // Polling configuration
  pollIntervalMs?: number; // Default: 10000 (10 seconds)
  maxPollTimeMs?: number; // Default: 600000 (10 minutes)

  // Vertex AI configuration
  projectId?: string; // Google Cloud project ID
  region?: string; // Vertex AI region (default: us-central1)
  credentials?: string; // Path to credentials file or JSON string
}

/**
 * Veo API operation response
 */
export interface GoogleVideoOperation {
  name: string;
  done?: boolean;
  metadata?: {
    progress?: number;
  };
  response?: {
    '@type'?: string;
    // New format: videos array with base64 encoded video
    videos?: Array<{
      bytesBase64Encoded: string;
    }>;
    // Legacy format with URI
    generateVideoResponse?: {
      generatedSamples: Array<{
        video: {
          uri: string;
        };
      }>;
    };
    raiMediaFilteredCount?: number;
  };
  error?: {
    code: number;
    message: string;
  };
}
