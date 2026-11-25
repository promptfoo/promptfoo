import { z } from 'zod';
import {
  OpenAiChatConfigInputSchema,
  OpenAiCompletionConfigInputSchema,
  OpenAiEmbeddingConfigInputSchema,
} from './openai.js';
import { ProviderOptionsInputFieldsSchema } from './shared.js';

const LiteLLMProxyFields = {
  id: z.string().optional().describe('Override the provider instance ID, not the proxy model'),
  apiKey: z.string().optional().describe('Proxy API key; defaults to LITELLM_API_KEY'),
  apiKeyEnvar: z.string().optional().describe('Environment variable containing the proxy API key'),
  apiBaseUrl: z
    .string()
    .optional()
    .describe('Proxy base URL; defaults to LITELLM_API_BASE or http://0.0.0.0:4000'),
};

// Name the composed types so the public declarations reuse the OpenAI shapes.
type LiteLLMConfigSchema<Shape extends z.ZodRawShape> = z.ZodObject<
  Omit<Shape, 'model' | keyof typeof LiteLLMProxyFields> & typeof LiteLLMProxyFields,
  z.core.$strict
>;

// The LiteLLM wrapper takes the model from the provider ID, not config.model.
export const LiteLLMChatConfigInputSchema: LiteLLMConfigSchema<
  typeof OpenAiChatConfigInputSchema.shape
> = OpenAiChatConfigInputSchema.omit({ model: true })
  .extend(LiteLLMProxyFields)
  .describe('Serializable LiteLLM Chat Completions configuration');
export const LiteLLMCompletionConfigInputSchema: LiteLLMConfigSchema<
  typeof OpenAiCompletionConfigInputSchema.shape
> = OpenAiCompletionConfigInputSchema.omit({ model: true })
  .extend(LiteLLMProxyFields)
  .describe('Serializable LiteLLM legacy Completions configuration');
export const LiteLLMEmbeddingConfigInputSchema: LiteLLMConfigSchema<
  typeof OpenAiEmbeddingConfigInputSchema.shape
> = OpenAiEmbeddingConfigInputSchema.omit({ model: true })
  .extend(LiteLLMProxyFields)
  .describe('Serializable LiteLLM embeddings configuration');

const Model = z.string().regex(/[\s\S]+/);
// The factory treats these first segments as explicit modes. Keep the shorthand branch from
// accepting an invalid explicit-mode config as a chat config. Other colons can be in model IDs.
const ChatModelAlias = z
  .string()
  .regex(/(?!chat(?::|$)|completion(?::|$)|embeddings?(?::|$))[\s\S]+/);
const ChatId = z.union([
  z.templateLiteral(['litellm:chat:', Model]),
  z.templateLiteral(['litellm:', ChatModelAlias]),
]);
const CompletionId = z.templateLiteral(['litellm:completion:', Model]);
const EmbeddingId = z.templateLiteral([
  'litellm:',
  z.enum(['embedding', 'embeddings']),
  ':',
  Model,
]);

type LiteLLMOptionsSchema<Id extends z.ZodType, Config extends z.ZodType> = z.ZodObject<
  typeof ProviderOptionsInputFieldsSchema.shape & { id: Id; config: z.ZodOptional<Config> },
  z.core.$strict
>;
type ChatOptions = LiteLLMOptionsSchema<typeof ChatId, typeof LiteLLMChatConfigInputSchema>;
type CompletionOptions = LiteLLMOptionsSchema<
  typeof CompletionId,
  typeof LiteLLMCompletionConfigInputSchema
>;
type EmbeddingOptions = LiteLLMOptionsSchema<
  typeof EmbeddingId,
  typeof LiteLLMEmbeddingConfigInputSchema
>;

export const LiteLLMProviderOptionsInputSchema: z.ZodUnion<
  readonly [ChatOptions, CompletionOptions, EmbeddingOptions]
> = z.union([
  ProviderOptionsInputFieldsSchema.extend({
    id: ChatId,
    config: LiteLLMChatConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: CompletionId,
    config: LiteLLMCompletionConfigInputSchema.optional(),
  }),
  ProviderOptionsInputFieldsSchema.extend({
    id: EmbeddingId,
    config: LiteLLMEmbeddingConfigInputSchema.optional(),
  }),
]);

export type LiteLLMChatConfigInput = z.input<typeof LiteLLMChatConfigInputSchema>;
export type LiteLLMCompletionConfigInput = z.input<typeof LiteLLMCompletionConfigInputSchema>;
export type LiteLLMEmbeddingConfigInput = z.input<typeof LiteLLMEmbeddingConfigInputSchema>;
export type LiteLLMProviderOptionsInput = z.input<typeof LiteLLMProviderOptionsInputSchema>;

const jsonSchemaOptions = { target: 'draft-07', io: 'input' } as const;
export const LiteLLMChatConfigInputJsonSchema: z.core.ZodStandardJSONSchemaPayload<
  typeof LiteLLMChatConfigInputSchema
> = z.toJSONSchema(LiteLLMChatConfigInputSchema, jsonSchemaOptions);
export const LiteLLMCompletionConfigInputJsonSchema: z.core.ZodStandardJSONSchemaPayload<
  typeof LiteLLMCompletionConfigInputSchema
> = z.toJSONSchema(LiteLLMCompletionConfigInputSchema, jsonSchemaOptions);
export const LiteLLMEmbeddingConfigInputJsonSchema: z.core.ZodStandardJSONSchemaPayload<
  typeof LiteLLMEmbeddingConfigInputSchema
> = z.toJSONSchema(LiteLLMEmbeddingConfigInputSchema, jsonSchemaOptions);
export const LiteLLMProviderOptionsInputJsonSchema: z.core.ZodStandardJSONSchemaPayload<
  typeof LiteLLMProviderOptionsInputSchema
> = z.toJSONSchema(LiteLLMProviderOptionsInputSchema, jsonSchemaOptions);
