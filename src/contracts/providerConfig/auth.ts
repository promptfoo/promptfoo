import { z } from 'zod';

const OAuthScopesSchema = z.union([z.array(z.string()), z.string()]);

const NoAuthInputSchema = z.object({
  type: z.enum(['', 'none', 'no_auth']),
});

export const NoAuthSchema = NoAuthInputSchema.transform(() => undefined);

export const BearerAuthSchema = z.object({
  token: z.string(),
  type: z.literal('bearer'),
});

export const BasicAuthSchema = z.object({
  password: z.string(),
  type: z.literal('basic'),
  username: z.string(),
});

const ApiKeyAuthBaseSchema = z.object({
  api_key: z.string().optional(),
  keyName: z.string().optional(),
  placement: z.enum(['header', 'query']).optional(),
  type: z.literal('api_key'),
  value: z.string().optional(),
});

export const ApiKeyAuthSchema = z.union(
  [
    ApiKeyAuthBaseSchema.extend({ value: z.string().min(1) }),
    ApiKeyAuthBaseSchema.extend({ api_key: z.string().min(1) }),
  ],
  { error: 'api_key auth requires value or api_key' },
);

const OAuthClientCredentialsAuthInputSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  grantType: z.literal('client_credentials').optional(),
  scopes: OAuthScopesSchema.optional(),
  tokenUrl: z.string().optional(),
  type: z.literal('oauth'),
});

export const OAuthClientCredentialsAuthSchema = OAuthClientCredentialsAuthInputSchema.extend({
  grantType: z.literal('client_credentials').prefault('client_credentials'),
});

export const OAuthPasswordAuthSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  grantType: z.literal('password'),
  password: z.string(),
  scopes: OAuthScopesSchema.optional(),
  tokenUrl: z.string().optional(),
  type: z.literal('oauth'),
  username: z.string(),
});

export const ProviderAuthSchema = z.union([
  BearerAuthSchema,
  BasicAuthSchema,
  ApiKeyAuthSchema,
  OAuthClientCredentialsAuthSchema,
  OAuthPasswordAuthSchema,
]);

export const McpAuthInputSchema = z.union([
  NoAuthInputSchema,
  BearerAuthSchema,
  BasicAuthSchema,
  ApiKeyAuthSchema,
  OAuthClientCredentialsAuthInputSchema,
  OAuthPasswordAuthSchema,
]);

export const McpAuthSchema = z.union([NoAuthSchema, ProviderAuthSchema]);

export type McpAuthInput = z.input<typeof McpAuthInputSchema>;
export type McpAuthParsed = z.output<typeof McpAuthSchema>;

export const McpAuthInputJsonSchema = z.toJSONSchema(McpAuthInputSchema, {
  target: 'draft-07',
  io: 'input',
});
