import { z } from 'zod';

const OAuthScopesSchema = z
  .union([z.array(z.string()), z.string()])
  .describe(
    'OAuth scopes as a string or array; templates are rendered before runtime normalization',
  );

const NoAuthInputSchema = z.object({
  type: z
    .enum(['', 'none', 'no_auth'])
    .describe('Do not generate authentication headers or query parameters'),
});

export const NoAuthSchema = NoAuthInputSchema.transform(() => undefined);

export const BearerAuthSchema = z.object({
  token: z.string().describe('Bearer token; supports runtime template substitution'),
  type: z.literal('bearer'),
});

export const BasicAuthSchema = z.object({
  password: z.string().describe('Basic-auth password; may be empty and supports templates'),
  type: z.literal('basic'),
  username: z.string().describe('Basic-auth username; supports templates'),
});

const ApiKeyAuthBaseSchema = z.object({
  api_key: z
    .string()
    .describe('Legacy alias for value; used when value is empty or omitted')
    .optional(),
  keyName: z.string().optional().describe('Header or query parameter name; defaults to X-API-Key'),
  placement: z
    .enum(['header', 'query'])
    .optional()
    .describe('Where to send the API key; defaults to header'),
  type: z.literal('api_key'),
  value: z
    .string()
    .describe('API key; supports templates and takes precedence over api_key')
    .optional(),
});

export const ApiKeyAuthSchema = z.union(
  [
    ApiKeyAuthBaseSchema.extend({ value: ApiKeyAuthBaseSchema.shape.value.unwrap().min(1) }),
    ApiKeyAuthBaseSchema.extend({ api_key: ApiKeyAuthBaseSchema.shape.api_key.unwrap().min(1) }),
  ],
  { error: 'api_key auth requires value or api_key' },
);

const OAuthClientCredentialsAuthInputSchema = z.object({
  clientId: z.string().describe('OAuth client ID; supports templates'),
  clientSecret: z.string().describe('OAuth client secret; supports templates'),
  grantType: z
    .literal('client_credentials')
    .optional()
    .describe('Defaults to client_credentials at runtime'),
  scopes: OAuthScopesSchema.optional(),
  tokenUrl: z
    .string()
    .optional()
    .describe('OAuth token endpoint; the shared MCP client discovers it when omitted'),
  type: z.literal('oauth'),
});

export const OAuthClientCredentialsAuthSchema = OAuthClientCredentialsAuthInputSchema.extend({
  grantType: z.literal('client_credentials').prefault('client_credentials'),
});

export const OAuthPasswordAuthSchema = z.object({
  clientId: OAuthClientCredentialsAuthInputSchema.shape.clientId.optional(),
  clientSecret: OAuthClientCredentialsAuthInputSchema.shape.clientSecret.optional(),
  grantType: z.literal('password'),
  password: z.string().describe('OAuth resource-owner password; supports templates'),
  scopes: OAuthScopesSchema.optional(),
  tokenUrl: OAuthClientCredentialsAuthInputSchema.shape.tokenUrl,
  type: z.literal('oauth'),
  username: z.string().describe('OAuth resource-owner username; supports templates'),
});

export const ProviderAuthSchema = z.union([
  BearerAuthSchema,
  BasicAuthSchema,
  ApiKeyAuthSchema,
  OAuthClientCredentialsAuthSchema,
  OAuthPasswordAuthSchema,
]);

export const McpAuthInputSchema = z.union([
  NoAuthInputSchema.strict(),
  BearerAuthSchema.strict(),
  BasicAuthSchema.strict(),
  z.union(
    ApiKeyAuthSchema.options.map((schema) => schema.strict()),
    {
      error: 'api_key auth requires value or api_key',
    },
  ),
  OAuthClientCredentialsAuthInputSchema.strict(),
  OAuthPasswordAuthSchema.strict(),
]);

export const McpAuthSchema = z.union([NoAuthSchema, ProviderAuthSchema]);

export type McpAuthInput = z.input<typeof McpAuthInputSchema>;
export type McpAuthParsed = z.output<typeof McpAuthSchema>;

export const McpAuthInputJsonSchema = z.toJSONSchema(McpAuthInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
});
