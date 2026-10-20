import { z } from 'zod';
import { McpClientConfigInputSchema } from './mcp.js';
import {
  FileReferenceInputSchema,
  JsonObjectInputSchema,
  ProviderOptionsInputFieldsSchema,
} from './shared.js';

export const OpenAiSharedConfigInputSchema = z.strictObject({
  apiKey: z.string().optional().describe('API key; omitted uses provider environment settings'),
  apiKeyEnvar: z
    .string()
    .optional()
    .describe('Name of the environment variable containing the API key'),
  apiKeyRequired: z.boolean().optional(),
  useDefaultApiKey: z.boolean().optional(),
  apiHost: z.string().optional().describe('API host; supports environment templates'),
  apiBaseUrl: z.string().optional().describe('API base URL; supports environment templates'),
  organization: z.string().optional(),
  cost: z.number().optional(),
  inputCost: z.number().optional(),
  outputCost: z.number().optional(),
  audioCost: z.number().optional(),
  audioInputCost: z.number().optional(),
  audioOutputCost: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  maxRetries: z
    .number()
    .optional()
    .describe('Defaults to 4 at runtime; negative values are clamped to zero'),
});

// OpenAI requires an object at the schema root; nested JSON Schema keywords remain open.
const SchemaDocument = z.union([JsonObjectInputSchema, FileReferenceInputSchema]);
const FunctionDefinition = z.strictObject({
  name: z.string(),
  description: z.string().nullable().optional(),
  parameters: JsonObjectInputSchema.nullable().optional(),
  output_schema: JsonObjectInputSchema.nullable().optional(),
  strict: z.boolean().nullable().optional(),
  defer_loading: z.boolean().optional(),
  async: z.boolean().optional(),
  allowed_callers: z
    .array(z.enum(['direct', 'programmatic']))
    .nullable()
    .optional(),
});
const ChatFunctionDefinition = FunctionDefinition.pick({
  name: true,
  description: true,
  parameters: true,
  strict: true,
}).extend({
  description: z.string().optional(),
  parameters: JsonObjectInputSchema.optional(),
});
const ChatFunctionTool = z.strictObject({
  type: z.literal('function'),
  function: ChatFunctionDefinition,
});
const ResponsesFunctionTool = FunctionDefinition.extend({ type: z.literal('function') });
const McpToolFields = z.strictObject({
  type: z.literal('mcp'),
  server_label: z.string(),
  allowed_callers: z
    .array(z.enum(['direct', 'programmatic']))
    .nullable()
    .optional(),
  server_url: z.string().optional(),
  connector_id: z.string().optional(),
  tunnel_id: z.string().optional(),
  authorization: z.string().optional(),
  server_description: z.string().optional(),
  defer_loading: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).nullable().optional(),
  allowed_tools: z
    .union([
      z.array(z.string()),
      z.strictObject({
        tool_names: z.array(z.string()).optional(),
        read_only: z.boolean().optional(),
      }),
    ])
    .nullable()
    .optional(),
  require_approval: z
    .union([
      z.enum(['always', 'never']),
      z.strictObject({
        always: z
          .strictObject({
            tool_names: z.array(z.string()).optional(),
            read_only: z.boolean().optional(),
          })
          .optional(),
        never: z
          .strictObject({
            tool_names: z.array(z.string()).optional(),
            read_only: z.boolean().optional(),
          })
          .optional(),
      }),
    ])
    .nullable()
    .optional(),
});
const McpTool = z.union([
  McpToolFields.extend({ server_url: z.string() }),
  McpToolFields.extend({ connector_id: z.string() }),
  McpToolFields.extend({ tunnel_id: z.string() }),
]);
// Built-in tool payloads evolve independently of promptfoo; retain JSON extension fields.
const WebSearchTool = JsonObjectInputSchema.and(
  z.object({
    type: z.enum([
      'web_search',
      'web_search_preview',
      'web_search_2025_08_26',
      'web_search_preview_2025_03_11',
    ]),
    external_web_access: z.boolean().optional(),
    return_token_budget: z.enum(['default', 'unlimited']).optional(),
    search_context_size: z.enum(['low', 'medium', 'high']).optional(),
  }),
);
const CodeInterpreterTool = JsonObjectInputSchema.and(
  z.object({
    type: z.literal('code_interpreter'),
    container: z.union([
      z.string(),
      z
        .object({
          type: z.literal('auto'),
          file_ids: z.array(z.string()).optional(),
          memory_limit: z.enum(['1g', '4g', '16g', '64g']).nullable().optional(),
        })
        .catchall(z.json()),
    ]),
  }),
);
const FileSearchTool = JsonObjectInputSchema.and(
  z.object({
    type: z.literal('file_search'),
    vector_store_ids: z.array(z.string()),
    max_num_results: z.number().optional(),
  }),
);
const CustomTool = z
  .object({
    type: z.literal('custom'),
    name: z.string(),
    description: z.string().optional(),
    format: JsonObjectInputSchema.optional(),
    allowed_callers: z
      .array(z.enum(['direct', 'programmatic']))
      .nullable()
      .optional(),
    async: z.boolean().optional(),
    defer_loading: z.boolean().optional(),
  })
  .catchall(z.json());
const NamespaceTool = z
  .object({
    type: z.literal('namespace'),
    name: z.string(),
    description: z.string(),
    tools: z.array(z.union([ResponsesFunctionTool, CustomTool])),
  })
  .catchall(z.json());
const ToolSearchTool = z
  .object({
    type: z.literal('tool_search'),
    description: z.string().nullable().optional(),
    execution: z.enum(['server', 'client']).optional(),
    parameters: z.json().nullable().optional(),
  })
  .catchall(z.json());
const ComputerPreviewTool = z
  .object({
    type: z.literal('computer_use_preview'),
    display_width: z.number(),
    display_height: z.number(),
    environment: z.enum(['windows', 'mac', 'linux', 'ubuntu', 'browser']),
  })
  .catchall(z.json());
const BuiltInTool = z
  .object({
    type: z.enum([
      'computer',
      'programmatic_tool_calling',
      'image_generation',
      'local_shell',
      'shell',
      'apply_patch',
    ]),
  })
  .catchall(z.json());
const Tool = z.union([
  ChatFunctionTool,
  ResponsesFunctionTool,
  McpTool,
  WebSearchTool,
  CodeInterpreterTool,
  FileSearchTool,
  CustomTool,
  NamespaceTool,
  ToolSearchTool,
  ComputerPreviewTool,
  BuiltInTool,
]);
const ChatCustomTool = z
  .object({
    type: z.literal('custom'),
    custom: z
      .object({
        name: z.string(),
        description: z.string().optional(),
        format: JsonObjectInputSchema.optional(),
      })
      .catchall(z.json()),
  })
  .catchall(z.json());
// The loader flattens arrays only when every entry loads as an array. Keep references separate.
const ChatTools = z.union([
  FileReferenceInputSchema,
  z.array(FileReferenceInputSchema),
  z.array(z.union([ChatFunctionTool, ChatCustomTool])),
]);
const ResponsesTools = z.union([
  FileReferenceInputSchema,
  z.array(FileReferenceInputSchema),
  z.array(Tool),
]);
const ChatToolChoice = z.union([
  z.enum(['none', 'auto', 'required']),
  z.strictObject({ type: z.literal('function'), function: z.strictObject({ name: z.string() }) }),
  z.strictObject({ type: z.literal('custom'), custom: z.strictObject({ name: z.string() }) }),
]);
const NamedToolChoice = z
  .object({ type: z.enum(['function', 'custom']), name: z.string() })
  .catchall(z.json());
const McpToolChoice = z
  .object({
    type: z.literal('mcp'),
    server_label: z.string(),
    name: z.string().nullable().optional(),
  })
  .catchall(z.json());
const BuiltInToolChoice = z
  .object({
    type: z.enum([
      'web_search',
      'web_search_preview',
      'web_search_preview_2025_03_11',
      'file_search',
      'code_interpreter',
      'image_generation',
      'computer',
      'computer_use',
      'computer_use_preview',
      'shell',
      'apply_patch',
      'tool_search',
    ]),
  })
  .catchall(z.json());
const ToolChoice = z.union([
  z.enum(['none', 'auto', 'required']),
  z.strictObject({ type: z.literal('function'), function: z.strictObject({ name: z.string() }) }),
  NamedToolChoice,
  McpToolChoice,
  BuiltInToolChoice,
  z
    .object({
      type: z.literal('allowed_tools'),
      mode: z.enum(['auto', 'required']),
      tools: z.array(z.union([NamedToolChoice, McpToolChoice, BuiltInToolChoice])),
    })
    .catchall(z.json()),
]);
const NestedResponseFormat = z.strictObject({
  type: z.literal('json_schema'),
  json_schema: z.strictObject({
    name: z.string(),
    description: z.string().optional(),
    strict: z.boolean().nullable().optional(),
    schema: SchemaDocument,
  }),
});
const FlatResponseFormat = z.strictObject({
  type: z.literal('json_schema'),
  name: z.string().optional(),
  strict: z
    .literal(true)
    .optional()
    .describe('Responses config.response_format uses strict mode at runtime'),
  schema: SchemaDocument,
});
const BasicResponseFormat = z.strictObject({ type: z.enum(['text', 'json_object']) });
const ChatResponseFormat = z.union([
  FileReferenceInputSchema,
  BasicResponseFormat,
  NestedResponseFormat,
]);
const ResponsesResponseFormat = z.union([
  FileReferenceInputSchema,
  BasicResponseFormat,
  NestedResponseFormat.extend({
    json_schema: NestedResponseFormat.shape.json_schema.omit({ description: true }).extend({
      strict: z
        .literal(true)
        .optional()
        .describe('Responses config.response_format uses strict mode at runtime'),
    }),
  }),
  FlatResponseFormat,
]);

const ReasoningEffort = z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const Template = z
  .templateLiteral([z.string(), '{{', z.string().regex(/[\s\S]+/), '}}', z.string()])
  .describe('Runtime template expression');
const Reasoning = z.strictObject({
  context: z
    .union([z.enum(['auto', 'current_turn', 'all_turns']), Template])
    .nullable()
    .optional(),
  effort: z.union([ReasoningEffort, Template]).nullable().optional(),
  mode: z
    .union([z.enum(['standard', 'pro']), Template])
    .nullable()
    .optional(),
  summary: z
    .union([z.enum(['auto', 'concise', 'detailed']), Template])
    .nullable()
    .optional(),
});
const ServiceTier = z
  .enum(['auto', 'default', 'fast', 'flex', 'priority', 'premium', 'ultrafast', 'scale'])
  .nullable();

const TextRequestFields = OpenAiSharedConfigInputSchema.extend({
  model: z.string().optional().describe('Model used when the provider ID omits a model name'),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  service_tier: ServiceTier.optional(),
  passthrough: JsonObjectInputSchema.optional().describe(
    'Additional request fields passed to the API',
  ),
});
const CompletionFields = TextRequestFields.extend({
  max_tokens: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  best_of: z.number().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  seed: z.number().optional(),
});
const ConversationFields = TextRequestFields.extend({
  reasoning_effort: z.union([ReasoningEffort, Template]).nullable().optional(),
  reasoning: Reasoning.optional(),
  verbosity: z.enum(['low', 'medium', 'high']).optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_options: z
    .strictObject({
      mode: z.enum(['implicit', 'explicit']).optional(),
      ttl: z.literal('30m').optional(),
    })
    .optional(),
  prompt_cache_retention: z.enum(['in_memory', '24h']).nullable().optional(),
  safety_identifier: z.string().optional(),
  user: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  store: z.boolean().optional(),
  omitDefaults: z.boolean().optional(),
});
const ChatFields = ConversationFields.extend({
  max_tokens: CompletionFields.shape.max_tokens,
  frequency_penalty: CompletionFields.shape.frequency_penalty,
  presence_penalty: CompletionFields.shape.presence_penalty,
  stop: CompletionFields.shape.stop,
  seed: CompletionFields.shape.seed,
  max_completion_tokens: z.number().optional(),
  functions: z.union([FileReferenceInputSchema, z.array(ChatFunctionDefinition)]).optional(),
  function_call: z
    .union([z.enum(['none', 'auto']), z.strictObject({ name: z.string() })])
    .optional(),
  tools: ChatTools.optional(),
  tool_choice: ChatToolChoice.optional(),
  tool_resources: JsonObjectInputSchema.optional(),
  response_format: ChatResponseFormat.optional(),
  showThinking: z.boolean().optional(),
  modalities: z.array(z.string()).optional(),
  audio: z
    .strictObject({
      bitrate: z.string().optional(),
      format: z.string().optional(),
      speed: z.number().optional(),
      voice: z.string().optional(),
    })
    .optional(),
  functionToolCallbacks: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Inline callback code or file:// references; functions are supported only in-process',
    ),
  mcp: McpClientConfigInputSchema.extend({
    enabled: z
      .boolean()
      .describe(
        'Set true to initialize MCP tools; the provider checks this before loading the client',
      ),
  }).optional(),
});

export const OpenAiCompletionConfigInputSchema = CompletionFields.describe(
  'Serializable legacy OpenAI Completions configuration',
);
export const OpenAiChatConfigInputSchema = ChatFields.describe(
  'Serializable OpenAI Chat Completions configuration',
);
export const OpenAiResponsesConfigInputSchema = ConversationFields.extend({
  tools: ResponsesTools.optional(),
  tool_choice: ToolChoice.optional(),
  response_format: ResponsesResponseFormat.optional(),
  instructions: z.string().optional(),
  max_output_tokens: z.number().int().min(16).optional(),
  max_tool_calls: z.number().optional(),
  access_programs: z
    .strictObject({ cyber: z.enum(['standard', 'daybreak_blue', 'daybreak_red']).optional() })
    .optional(),
  include: z.array(z.string()).nullable().optional(),
  parallel_tool_calls: z.boolean().optional(),
  previous_response_id: z.string().optional(),
  stream: z.boolean().optional(),
  truncation: z.enum(['auto', 'disabled']).optional(),
  background: z.boolean().optional(),
  webhook_url: z.string().optional(),
}).describe(
  'Serializable OpenAI Responses configuration; use max_output_tokens for the output limit',
);
export const OpenAiEmbeddingConfigInputSchema = OpenAiSharedConfigInputSchema.extend({
  model: z.string().optional(),
  passthrough: JsonObjectInputSchema.optional().describe(
    'Embedding request fields such as dimensions and encoding_format',
  ),
}).describe('Serializable OpenAI embeddings configuration');

const ChatOptions = ProviderOptionsInputFieldsSchema.extend({
  id: z.union([z.literal('openai:chat'), z.templateLiteral(['openai:chat:', z.string()])]),
  config: OpenAiChatConfigInputSchema.optional(),
});
const CompletionOptions = ProviderOptionsInputFieldsSchema.extend({
  id: z.union([
    z.literal('openai:completion'),
    z.templateLiteral(['openai:completion:', z.string()]),
  ]),
  config: OpenAiCompletionConfigInputSchema.optional(),
});
const ResponsesOptions = ProviderOptionsInputFieldsSchema.extend({
  id: z.union([
    z.literal('openai:responses'),
    z.templateLiteral(['openai:responses:', z.string()]),
  ]),
  config: OpenAiResponsesConfigInputSchema.optional(),
});
const EmbeddingOptions = ProviderOptionsInputFieldsSchema.extend({
  id: z.union([
    z.literal('openai:embedding'),
    z.literal('openai:embeddings'),
    z.templateLiteral(['openai:embedding:', z.string()]),
    z.templateLiteral(['openai:embeddings:', z.string()]),
  ]),
  config: OpenAiEmbeddingConfigInputSchema.optional(),
});

/** Explicit API routes keep config correlated with id and cannot fall back to an unrestricted branch. */
export const OpenAiProviderOptionsInputSchema = z.union([
  ChatOptions,
  CompletionOptions,
  ResponsesOptions,
  EmbeddingOptions,
]);
export type OpenAiSharedConfigInput = z.input<typeof OpenAiSharedConfigInputSchema>;
export type OpenAiCompletionConfigInput = z.input<typeof OpenAiCompletionConfigInputSchema>;
export type OpenAiChatConfigInput = z.input<typeof OpenAiChatConfigInputSchema>;
export type OpenAiResponsesConfigInput = z.input<typeof OpenAiResponsesConfigInputSchema>;
export type OpenAiEmbeddingConfigInput = z.input<typeof OpenAiEmbeddingConfigInputSchema>;
export type OpenAiProviderOptionsInput = z.input<typeof OpenAiProviderOptionsInputSchema>;

export const OpenAiSharedConfigInputJsonSchema = z.toJSONSchema(OpenAiSharedConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const OpenAiCompletionConfigInputJsonSchema = z.toJSONSchema(
  OpenAiCompletionConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const OpenAiChatConfigInputJsonSchema = z.toJSONSchema(OpenAiChatConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const OpenAiResponsesConfigInputJsonSchema = z.toJSONSchema(
  OpenAiResponsesConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const OpenAiEmbeddingConfigInputJsonSchema = z.toJSONSchema(
  OpenAiEmbeddingConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const OpenAiProviderOptionsInputJsonSchema = z.toJSONSchema(
  OpenAiProviderOptionsInputSchema,
  { target: 'draft-07', io: 'input' },
);
