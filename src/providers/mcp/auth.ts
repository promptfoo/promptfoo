import { z } from 'zod';

const OAuthScopesSchema = z.union([z.array(z.string()), z.string()]);

export const NoAuthSchema = z
  .object({
    type: z.union([z.literal(''), z.literal('none'), z.literal('no_auth')]),
  })
  .transform(() => undefined);

export const BearerAuthSchema = z.object({
  token: z.string(),
  type: z.literal('bearer'),
});

export const BasicAuthSchema = z.object({
  password: z.string(),
  type: z.literal('basic'),
  username: z.string(),
});

export const ApiKeyAuthSchema = z
  .object({
    api_key: z.string().optional(),
    keyName: z.string().optional(),
    placement: z.enum(['header', 'query']).optional(),
    type: z.literal('api_key'),
    value: z.string().optional(),
  })
  .refine((auth) => auth.value || auth.api_key, {
    message: 'api_key auth requires value or api_key',
  });

export const OAuthClientCredentialsAuthSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  grantType: z.literal('client_credentials').prefault('client_credentials'),
  scopes: OAuthScopesSchema.optional(),
  tokenUrl: z.string().optional(),
  type: z.literal('oauth'),
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

export const OptionalProviderAuthSchema = z.union([NoAuthSchema, ProviderAuthSchema]);

export function splitOAuthScopes(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function normalizeRenderedOAuthScopes(scopes: unknown): string[] | undefined {
  if (typeof scopes === 'string') {
    return splitOAuthScopes(scopes);
  }
  if (Array.isArray(scopes)) {
    return scopes.flatMap((scope) => (typeof scope === 'string' ? splitOAuthScopes(scope) : []));
  }
  return undefined;
}

export function normalizeRenderedAuth(auth: unknown): unknown {
  if (!auth || typeof auth !== 'object') {
    return auth;
  }
  const authObject = auth as Record<string, unknown>;
  if (authObject.type !== 'oauth' || authObject.scopes === undefined) {
    return auth;
  }
  return {
    ...authObject,
    scopes: normalizeRenderedOAuthScopes(authObject.scopes),
  };
}
