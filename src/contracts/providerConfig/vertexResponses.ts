import { z } from 'zod';
import { OpenAiResponsesConfigInputSchema } from './openai.js';
import { JsonObjectInputSchema, ProviderOptionsInputFieldsSchema } from './shared.js';

import type { OpenAiResponsesConfigInput } from './openai.js';

const scopes = z.union([z.string(), z.array(z.string())]);

// SDK client objects and API-key auth are not part of the portable OAuth contract.
const googleAuthOptions = z.strictObject({
  credentials: JsonObjectInputSchema.optional(),
  keyFile: z.string().optional(),
  keyFilename: z.string().optional(),
  projectId: z.string().optional(),
  scopes: scopes.optional(),
});

const replacedOpenAiFields = {
  apiKey: true,
  apiKeyEnvar: true,
  apiKeyRequired: true,
  useDefaultApiKey: true,
  apiHost: true,
  apiBaseUrl: true,
  organization: true,
} as const;

const googleFields = z.strictObject({
  projectId: z.string().optional().describe('Google Cloud project; may come from the environment'),
  credentials: z.string().optional().describe('Credential JSON string or file:// reference'),
  keyFilename: z.string().optional().describe('Path to a Google service account key file'),
  scopes: scopes.optional(),
  googleAuthOptions: googleAuthOptions.optional(),
});

const config = OpenAiResponsesConfigInputSchema.omit(replacedOpenAiFields).extend(
  googleFields.shape,
);

export type VertexResponsesConfigInput = Omit<
  OpenAiResponsesConfigInput,
  keyof typeof replacedOpenAiFields
> &
  z.input<typeof googleFields> &
  ({ apiBaseUrl?: never; region?: 'global' } | { apiBaseUrl: string; region?: string });

export const VertexResponsesConfigInputSchema: z.ZodType<
  VertexResponsesConfigInput,
  VertexResponsesConfigInput
> = z
  .union([
    config.extend({ region: z.literal('global').optional() }),
    config.extend({
      apiBaseUrl: z.string().min(1).describe('Onboarding or gateway base URL before /responses'),
      region: z.string().optional(),
    }),
  ])
  .describe('Serializable OpenAI Responses configuration for Google Cloud OAuth');

export type VertexResponsesProviderOptionsInput = z.input<
  typeof ProviderOptionsInputFieldsSchema
> & {
  id: `vertex:responses:${string}`;
  config?: VertexResponsesConfigInput;
};

export const VertexResponsesProviderOptionsInputSchema: z.ZodType<
  VertexResponsesProviderOptionsInput,
  VertexResponsesProviderOptionsInput
> = ProviderOptionsInputFieldsSchema.extend({
  id: z.templateLiteral(['vertex:responses:', z.string().regex(/^[^\s]+$/)]),
  config: VertexResponsesConfigInputSchema.optional(),
});

export const VertexResponsesConfigInputJsonSchema = z.toJSONSchema(
  VertexResponsesConfigInputSchema,
  { target: 'draft-07', io: 'input' },
);
export const VertexResponsesProviderOptionsInputJsonSchema = z.toJSONSchema(
  VertexResponsesProviderOptionsInputSchema,
  { target: 'draft-07', io: 'input' },
);
