import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import {
  VertexResponsesConfigInputJsonSchema,
  VertexResponsesConfigInputSchema,
  VertexResponsesProviderOptionsInputJsonSchema,
  VertexResponsesProviderOptionsInputSchema,
} from '../../src/contracts';

const id = 'vertex:responses:gpt-6-luna';
const ajv = new Ajv();
const validateProvider = ajv.compile(VertexResponsesProviderOptionsInputJsonSchema);
const validateConfig = ajv.compile(VertexResponsesConfigInputJsonSchema);

describe('portable OpenAI Responses on Google Cloud contracts', () => {
  it.each([
    {},
    {
      projectId: 'customer-project',
      region: 'global',
      max_output_tokens: 1024,
      reasoning: { effort: 'low' },
      stream: true,
      store: false,
    },
    {
      apiBaseUrl: 'https://example.test/v1',
      region: 'us-central1',
      keyFilename: '/keys/google.json',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
    { credentials: 'file://google.json' },
    { googleAuthOptions: { credentials: { type: 'external_account' }, keyFile: 'google.json' } },
  ])('accepts supported input in Zod and JSON Schema: %j', (config) => {
    expect(VertexResponsesConfigInputSchema.safeParse(config).success).toBe(true);
    expect(validateConfig(config)).toBe(true);
    const provider = { id, config, env: { GOOGLE_CLOUD_PROJECT: 'customer-project' } };
    expect(VertexResponsesProviderOptionsInputSchema.safeParse(provider).success).toBe(true);
    expect(validateProvider(provider)).toBe(true);
  });

  it.each([
    { apiKey: 'not-oauth' },
    { apiKeyEnvar: 'OPENAI_API_KEY' },
    { organization: 'org-test' },
    { googleAuthOptions: { apiKey: 'not-oauth' } },
    { region: 'us-central1' },
    { apiBaseUrl: '', region: 'us-central1' },
    { max_output_tokens: '1024' },
    { generationConfig: { maxOutputTokens: 1024 } },
  ])('rejects unsupported input in Zod and JSON Schema: %j', (config) => {
    expect(VertexResponsesConfigInputSchema.safeParse(config).success).toBe(false);
    expect(validateConfig(config)).toBe(false);
    expect(VertexResponsesProviderOptionsInputSchema.safeParse({ id, config }).success).toBe(false);
    expect(validateProvider({ id, config })).toBe(false);
  });

  it.each([
    'vertex:responses',
    'vertex:responses:',
    'vertex:responses:a b',
    'vertex:gemini-4-argon',
    'google:responses:model',
    'openai:responses:model',
  ])('rejects another or incomplete provider route: %s', (otherId) => {
    expect(VertexResponsesProviderOptionsInputSchema.safeParse({ id: otherId }).success).toBe(
      false,
    );
    expect(validateProvider({ id: otherId })).toBe(false);
  });
});
