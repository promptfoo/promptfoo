export {
  ApiKeyAuthSchema,
  BasicAuthSchema,
  BearerAuthSchema,
  McpAuthSchema as OptionalProviderAuthSchema,
  NoAuthSchema,
  OAuthClientCredentialsAuthSchema,
  OAuthPasswordAuthSchema,
  ProviderAuthSchema,
} from '../../contracts/providerConfig/auth';

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
