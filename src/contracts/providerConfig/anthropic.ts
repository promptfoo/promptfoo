import { z } from 'zod';
import { McpConfigInputSchema } from './mcp.js';
import {
  FileReferenceInputSchema,
  JsonObjectInputSchema,
  ProviderOptionsInputFieldsSchema,
} from './shared.js';

export const AnthropicSharedConfigInputSchema = z.strictObject({
  apiKey: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  apiKeyRequired: z
    .boolean()
    .optional()
    .describe(
      'Defaults to true at runtime; false allows supported Claude Code OAuth authentication',
    ),
  headers: z.record(z.string(), z.string()).optional(),
  cost: z.number().optional(),
  inputCost: z.number().optional(),
  outputCost: z.number().optional(),
});
const CacheControl = z.strictObject({
  type: z.literal('ephemeral'),
  ttl: z.enum(['5m', '1h']).optional(),
});
const CustomTool = z.strictObject({
  type: z.literal('custom').optional(),
  name: z.string(),
  description: z.string().optional(),
  input_schema: JsonObjectInputSchema,
  cache_control: CacheControl.nullable().optional(),
  strict: z.boolean().optional(),
  defer_loading: z.boolean().optional(),
  allowed_callers: z.array(z.string()).optional(),
  input_examples: z.array(JsonObjectInputSchema).optional(),
});
// Anthropic versioned built-in tool payloads are intentionally open JSON.
const BuiltInTool = JsonObjectInputSchema.and(
  z.object({
    type: z
      .string()
      .regex(
        /^(?:web_search|web_fetch|memory|computer|bash|text_editor|code_execution|tool_search_tool_regex|tool_search_tool_bm25)_\d{8}$/,
      ),
    name: z.string(),
  }),
);
const OpenAiFunctionTool = z.strictObject({
  type: z.literal('function'),
  function: z.strictObject({
    name: z.string(),
    description: z.string().optional(),
    parameters: JsonObjectInputSchema,
    strict: z.boolean().optional(),
  }),
});
const Tools = z.union([
  FileReferenceInputSchema,
  z.array(z.union([CustomTool, BuiltInTool, OpenAiFunctionTool, FileReferenceInputSchema])),
]);
const Thinking = z.union([
  z.strictObject({
    type: z.literal('enabled'),
    budget_tokens: z.number(),
    display: z.enum(['summarized', 'omitted']).optional(),
  }),
  z.strictObject({
    type: z.literal('adaptive'),
    display: z.enum(['summarized', 'omitted']).optional(),
  }),
  z.strictObject({ type: z.literal('disabled') }),
  z.strictObject({ type: z.literal('between_tools') }),
]);
const ToolChoice = z.union([
  z.enum(['auto', 'none', 'required']),
  z.strictObject({
    type: z.enum(['auto', 'none', 'any']),
    disable_parallel_tool_use: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('tool'),
    name: z.string(),
    disable_parallel_tool_use: z.boolean().optional(),
  }),
  z.strictObject({ type: z.literal('function'), function: z.strictObject({ name: z.string() }) }),
]);
export const AnthropicMessagesConfigInputSchema = AnthropicSharedConfigInputSchema.extend({
  model: z.string().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  cache_control: CacheControl.nullable().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  extra_body: JsonObjectInputSchema.optional(),
  metadata: z.strictObject({ user_id: z.string().nullable().optional() }).optional(),
  service_tier: z.enum(['auto', 'standard_only']).optional(),
  stream: z.boolean().optional(),
  thinking: Thinking.optional(),
  tools: Tools.optional(),
  tool_choice: ToolChoice.optional(),
  beta: z.array(z.string()).optional(),
  showThinking: z.boolean().optional(),
  mcp: McpConfigInputSchema.optional(),
  max_tool_calls: z.number().optional(),
  output_format: z
    .union([
      FileReferenceInputSchema,
      z.strictObject({
        type: z.literal('json_schema'),
        schema: z.union([JsonObjectInputSchema, FileReferenceInputSchema]),
      }),
    ])
    .optional(),
}).describe('Serializable Anthropic Messages configuration');
export const AnthropicCompletionConfigInputSchema = AnthropicSharedConfigInputSchema.extend({
  max_tokens_to_sample: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  mcp: McpConfigInputSchema.optional(),
}).describe('Serializable legacy Anthropic Completions configuration');

export const AnthropicProviderOptionsInputSchema = z.union([
  ProviderOptionsInputFieldsSchema.extend({
    id: z.templateLiteral(['anthropic:messages:', z.string().regex(/[\s\S]+/)]),
    config: AnthropicMessagesConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: z.templateLiteral(['anthropic:completion:', z.string().regex(/[\s\S]+/)]),
    config: AnthropicCompletionConfigInputSchema.optional(),
  }),
]);
export type AnthropicSharedConfigInput = z.input<typeof AnthropicSharedConfigInputSchema>;
export type AnthropicMessagesConfigInput = z.input<typeof AnthropicMessagesConfigInputSchema>;
export type AnthropicCompletionConfigInput = z.input<typeof AnthropicCompletionConfigInputSchema>;
export type AnthropicProviderOptionsInput = z.input<typeof AnthropicProviderOptionsInputSchema>;
export const AnthropicSharedConfigInputJsonSchema = z.toJSONSchema(
  AnthropicSharedConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const AnthropicMessagesConfigInputJsonSchema = z.toJSONSchema(
  AnthropicMessagesConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const AnthropicCompletionConfigInputJsonSchema = z.toJSONSchema(
  AnthropicCompletionConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const AnthropicProviderOptionsInputJsonSchema = z.toJSONSchema(
  AnthropicProviderOptionsInputSchema,
  { target: 'draft-07', io: 'input' },
);
