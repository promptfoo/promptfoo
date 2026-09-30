import { z } from 'zod';
import { BasicAuthSchema, BearerAuthSchema } from './auth.js';

const OAuthFields = {
  type: z.literal('oauth'),
  tokenUrl: z.string().describe('Token endpoint; supports templates. HTTP does not use discovery'),
  scopes: z.array(z.string()).optional().describe('OAuth scopes; each entry supports templates'),
  clientId: z.string().describe('OAuth client ID; supports templates'),
  clientSecret: z.string().describe('OAuth client secret; supports templates'),
};

const HttpAuthVariants = [
  z.strictObject({ ...OAuthFields, grantType: z.literal('client_credentials') }),
  z.strictObject({
    ...OAuthFields,
    clientId: OAuthFields.clientId.optional(),
    clientSecret: OAuthFields.clientSecret.optional(),
    grantType: z.literal('password'),
    username: z.string().describe('Resource-owner username; supports templates'),
    password: z.string().describe('Resource-owner password; supports templates'),
  }),
  BasicAuthSchema.strict(),
  BearerAuthSchema.strict(),
  z.strictObject({
    type: z.literal('api_key'),
    value: z.string().describe('API key; supports templates'),
    placement: z.enum(['header', 'query']).describe('Where to send the API key; required for HTTP'),
    keyName: z.string().describe('Header or query parameter name; supports templates'),
  }),
  z
    .strictObject({
      type: z.literal('file'),
      path: z
        .string()
        .min(1)
        .describe('Authentication module reference; loaded only during execution'),
    })
    .describe(
      'Load token and expiration variables at runtime; use {{ token }} in headers or body to send the token',
    ),
] as const;

export const HttpAuthInputSchema = z.union(HttpAuthVariants);
export const HttpAuthSchema = z.union(HttpAuthVariants.map((variant) => variant.strip()));
export type HttpAuthInput = z.input<typeof HttpAuthInputSchema>;
export const HttpAuthInputJsonSchema = z.toJSONSchema(HttpAuthInputSchema, {
  target: 'draft-07',
  io: 'input',
  unrepresentable: 'throw',
});
