import { z } from 'zod';
import {
  OpenAiChatConfigInputSchema,
  OpenAiCompletionConfigInputSchema,
  OpenAiResponsesConfigInputSchema,
} from './openai.js';
import { ProviderOptionsInputFieldsSchema } from './shared.js';

/** Azure credentials may also come from environment variables or managed identity. */
export const AzureSharedConfigInputSchema = z.strictObject({
  apiKey: z.string().optional(),
  apiKeyEnvar: z.string().optional(),
  apiHost: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  apiVersion: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  azureClientId: z.string().optional(),
  azureClientSecret: z.string().optional(),
  azureTenantId: z.string().optional(),
  azureAuthorityHost: z.string().optional(),
  azureTokenScope: z.string().optional(),
  deployment_id: z.string().optional(),
});

const ChatFields = OpenAiChatConfigInputSchema.pick({
  temperature: true,
  max_tokens: true,
  max_completion_tokens: true,
  top_p: true,
  frequency_penalty: true,
  presence_penalty: true,
  best_of: true,
  functions: true,
  function_call: true,
  tools: true,
  tool_choice: true,
  response_format: true,
  stop: true,
  seed: true,
  reasoning_effort: true,
  verbosity: true,
  functionToolCallbacks: true,
  passthrough: true,
  mcp: true,
  omitDefaults: true,
})
  .extend(AzureSharedConfigInputSchema.shape)
  .extend({
    modelName: z.string().optional(),
    systemPrompt: z.string().optional(),
    dataSources: z.json().optional().describe('Azure retrieval data-source request payload'),
    isReasoningModel: z.boolean().optional(),
    isClaudeOpus47OrLater: z.boolean().optional(),
    o1: z
      .boolean()
      .optional()
      .meta({ deprecated: true, description: 'Use isReasoningModel instead' }),
  });
export const AzureChatConfigInputSchema = ChatFields.describe(
  'Serializable Azure Chat Completions configuration',
);
export const AzureResponsesConfigInputSchema = ChatFields.omit({
  max_tokens: true,
  max_completion_tokens: true,
  best_of: true,
  stop: true,
  frequency_penalty: true,
  presence_penalty: true,
  functions: true,
  function_call: true,
})
  .extend(
    OpenAiResponsesConfigInputSchema.pick({
      tools: true,
      tool_choice: true,
      model: true,
      response_format: true,
      instructions: true,
      max_output_tokens: true,
      max_tool_calls: true,
      previous_response_id: true,
      truncation: true,
      metadata: true,
      parallel_tool_calls: true,
      stream: true,
      store: true,
    }).shape,
  )
  .extend({
    service_tier: z.enum(['auto', 'default', 'flex', 'priority']).nullable().optional(),
  })
  .describe('Serializable Azure Responses configuration');
export const AzureCompletionConfigInputSchema = OpenAiCompletionConfigInputSchema.pick({
  max_tokens: true,
  temperature: true,
  top_p: true,
  presence_penalty: true,
  frequency_penalty: true,
  best_of: true,
  stop: true,
  passthrough: true,
})
  .extend(AzureSharedConfigInputSchema.shape)
  .describe('Serializable Azure legacy Completions configuration');
export const AzureEmbeddingConfigInputSchema = AzureSharedConfigInputSchema.extend({
  dimensions: z.number().optional(),
}).describe('Serializable Azure embeddings configuration');

// Chat, Responses and Completions require deployments; embeddings retain the legacy default.
const Prefix = z.enum(['azure', 'azureopenai']);
const Deployment = z.string().regex(/[\s\S]+/);
export const AzureProviderOptionsInputSchema = z.union([
  ProviderOptionsInputFieldsSchema.extend({
    id: z.templateLiteral([Prefix, ':chat:', Deployment]),
    config: AzureChatConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: z.templateLiteral([Prefix, ':responses:', Deployment]),
    config: AzureResponsesConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: z.templateLiteral([Prefix, ':completion:', Deployment]),
    config: AzureCompletionConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: z.union([
      z.templateLiteral([Prefix, ':embedding']),
      z.templateLiteral([Prefix, ':embedding:', z.string()]),
    ]),
    config: AzureEmbeddingConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: z.union([
      z.templateLiteral([Prefix, ':embeddings']),
      z.templateLiteral([Prefix, ':embeddings:', z.string()]),
    ]),
    config: AzureEmbeddingConfigInputSchema.optional(),
  }),
]);

export type AzureSharedConfigInput = z.input<typeof AzureSharedConfigInputSchema>;
export type AzureChatConfigInput = z.input<typeof AzureChatConfigInputSchema>;
export type AzureResponsesConfigInput = z.input<typeof AzureResponsesConfigInputSchema>;
export type AzureCompletionConfigInput = z.input<typeof AzureCompletionConfigInputSchema>;
export type AzureEmbeddingConfigInput = z.input<typeof AzureEmbeddingConfigInputSchema>;
export type AzureProviderOptionsInput = z.input<typeof AzureProviderOptionsInputSchema>;

export const AzureSharedConfigInputJsonSchema = z.toJSONSchema(AzureSharedConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const AzureChatConfigInputJsonSchema = z.toJSONSchema(AzureChatConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const AzureResponsesConfigInputJsonSchema = z.toJSONSchema(AzureResponsesConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const AzureCompletionConfigInputJsonSchema = z.toJSONSchema(
  AzureCompletionConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const AzureEmbeddingConfigInputJsonSchema = z.toJSONSchema(AzureEmbeddingConfigInputSchema, {
  target: 'draft-07',
  io: 'input',
});
export const AzureProviderOptionsInputJsonSchema = z.toJSONSchema(AzureProviderOptionsInputSchema, {
  target: 'draft-07',
  io: 'input',
});
