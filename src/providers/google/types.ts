import type { MCPConfig } from '../mcp/types';

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

  // Image generation options
  n?: number; // Number of images to generate
  aspectRatio?: '1:1' | '16:9' | '9:16' | '3:4' | '4:3'; // Valid aspect ratios
  personGeneration?: 'allow_all' | 'allow_adult' | 'dont_allow';
  safetyFilterLevel?:
    | 'block_most'
    | 'block_some'
    | 'block_few'
    | 'block_fewest'
    | 'block_low_and_above';
  addWatermark?: boolean;
  seed?: number;

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

    // Thinking configuration
    thinkingConfig?: {
      thinkingBudget?: number;
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
