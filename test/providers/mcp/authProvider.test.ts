import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOAuthTokenCache,
  PromptfooOAuthClientProvider,
} from '../../../src/providers/mcp/authProvider';

// Mock the util module to avoid actual HTTP requests
vi.mock('../../../src/providers/mcp/util', () => ({
  getOAuthToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

describe('PromptfooOAuthClientProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOAuthTokenCache();
  });

  afterEach(() => {
    clearOAuthTokenCache();
  });

  describe('client_credentials grant', () => {
    it('should create provider with correct metadata', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      expect(provider.clientMetadata.grant_types).toContain('client_credentials');
      expect(provider.redirectUrl).toBeUndefined();

      const clientInfo = provider.clientInformation();
      expect(clientInfo.client_id).toBe('test-client');
      expect(clientInfo.client_secret).toBe('test-secret');
    });

    it('should prepare token request with correct grant type', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });

      const params = provider.prepareTokenRequest();

      expect(params.get('grant_type')).toBe('client_credentials');
      expect(params.get('scope')).toBe('read write');
      expect(params.has('username')).toBe(false);
      expect(params.has('password')).toBe(false);
    });

    it('should use scope parameter when provided', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read'], // config scope
      });

      // Scope parameter should override config scope
      const params = provider.prepareTokenRequest('custom-scope');

      expect(params.get('scope')).toBe('custom-scope');
    });
  });

  describe('password grant', () => {
    it('should prepare token request with username and password', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'password',
        tokenUrl: 'https://auth.example.com/token',
        username: 'user@example.com',
        password: 'secret123',
      });

      const params = provider.prepareTokenRequest();

      expect(params.get('grant_type')).toBe('password');
      expect(params.get('username')).toBe('user@example.com');
      expect(params.get('password')).toBe('secret123');
    });

    it('should include optional clientId and clientSecret', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'password',
        clientId: 'optional-client',
        clientSecret: 'optional-secret',
        tokenUrl: 'https://auth.example.com/token',
        username: 'user@example.com',
        password: 'secret123',
      });

      const clientInfo = provider.clientInformation();
      expect(clientInfo.client_id).toBe('optional-client');
      expect(clientInfo.client_secret).toBe('optional-secret');
    });
  });

  describe('token caching', () => {
    it('should save and retrieve tokens', async () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      const tokens = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      provider.saveTokens(tokens);

      expect(await provider.tokens()).toEqual(tokens);
    });

    it('should share tokens between provider instances with same config', async () => {
      const config = {
        type: 'oauth' as const,
        grantType: 'client_credentials' as const,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      };

      const provider1 = new PromptfooOAuthClientProvider(config);
      const provider2 = new PromptfooOAuthClientProvider(config);

      const tokens = {
        access_token: 'shared-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      provider1.saveTokens(tokens);

      // Second provider should see the cached tokens
      expect(await provider2.tokens()).toEqual(tokens);
    });

    it('should fetch fresh tokens when cache is empty', async () => {
      const { getOAuthToken } = await import('../../../src/providers/mcp/util');
      vi.mocked(getOAuthToken).mockResolvedValueOnce('fresh-token');

      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        tokenUrl: 'https://auth.example.com/token',
      });

      const tokens = await provider.tokens();

      expect(tokens).toBeDefined();
      expect(tokens?.access_token).toBe('fresh-token');
      expect(getOAuthToken).toHaveBeenCalled();
    });

    it('should invalidate tokens when requested', async () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      provider.saveTokens({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

      expect(await provider.tokens()).toBeDefined();

      provider.invalidateCredentials('tokens');

      // After invalidation, it will try to fetch fresh tokens
      const { getOAuthToken } = await import('../../../src/providers/mcp/util');
      vi.mocked(getOAuthToken).mockResolvedValueOnce('new-token-after-invalidation');

      const newTokens = await provider.tokens();
      expect(newTokens?.access_token).toBe('new-token-after-invalidation');
    });

    it('should invalidate all credentials when scope is "all"', async () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      provider.saveTokens({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

      provider.invalidateCredentials('all');

      // After invalidation, it will try to fetch fresh tokens
      const { getOAuthToken } = await import('../../../src/providers/mcp/util');
      vi.mocked(getOAuthToken).mockResolvedValueOnce('new-token-after-all-invalidation');

      const newTokens = await provider.tokens();
      expect(newTokens?.access_token).toBe('new-token-after-all-invalidation');
    });
  });

  describe('client information', () => {
    it('should save and retrieve client information', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'original-client',
        clientSecret: 'original-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      const newClientInfo = {
        client_id: 'new-client',
        client_secret: 'new-secret',
      };

      provider.saveClientInformation(newClientInfo);

      expect(provider.clientInformation()).toEqual(newClientInfo);
    });
  });

  describe('non-interactive flow methods', () => {
    it('should throw on redirectToAuthorization', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      expect(() => provider.redirectToAuthorization(new URL('https://example.com'))).toThrow(
        'not supported',
      );
    });

    it('should throw on codeVerifier', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      expect(() => provider.codeVerifier()).toThrow('not supported');
    });

    it('should not throw on saveCodeVerifier (no-op)', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      // Should not throw
      expect(() => provider.saveCodeVerifier('some-verifier')).not.toThrow();
    });
  });

  describe('client metadata', () => {
    it('should have correct token_endpoint_auth_method when client secret is present', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      expect(provider.clientMetadata.token_endpoint_auth_method).toBe('client_secret_basic');
    });

    it('should have token_endpoint_auth_method as "none" when no client secret', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'password',
        tokenUrl: 'https://auth.example.com/token',
        username: 'user',
        password: 'pass',
      });

      expect(provider.clientMetadata.token_endpoint_auth_method).toBe('none');
    });

    it('should have empty redirect_uris for non-interactive flows', () => {
      const provider = new PromptfooOAuthClientProvider({
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      });

      expect(provider.clientMetadata.redirect_uris).toEqual([]);
    });
  });
});

describe('clearOAuthTokenCache', () => {
  beforeEach(() => {
    clearOAuthTokenCache();
  });

  it('should clear all cached tokens', async () => {
    const provider = new PromptfooOAuthClientProvider({
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tokenUrl: 'https://auth.example.com/token',
    });

    provider.saveTokens({
      access_token: 'test-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    expect(await provider.tokens()).toBeDefined();

    clearOAuthTokenCache();

    // Create a new provider with same config - should fetch fresh tokens
    const { getOAuthToken } = await import('../../../src/providers/mcp/util');
    vi.mocked(getOAuthToken).mockResolvedValueOnce('fresh-token-after-clear');

    const newProvider = new PromptfooOAuthClientProvider({
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tokenUrl: 'https://auth.example.com/token',
    });

    const tokens = await newProvider.tokens();
    expect(tokens?.access_token).toBe('fresh-token-after-clear');
  });
});
