import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchWithProxy = vi.hoisted(() => vi.fn());
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

import { fetchOAuthToken, TOKEN_REFRESH_BUFFER_MS } from '../../src/util/oauth';

describe('oauth utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TOKEN_REFRESH_BUFFER_MS', () => {
    it('should be 60 seconds', () => {
      expect(TOKEN_REFRESH_BUFFER_MS).toBe(60000);
    });
  });

  describe('fetchOAuthToken', () => {
    it('should fetch token with client_credentials grant', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
        clientId: 'test-client',
        clientSecret: 'test-secret',
      });

      expect(result.accessToken).toBe('test-token');
      expect(result.expiresAt).toBeGreaterThan(Date.now());

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://auth.example.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: expect.stringContaining('grant_type=client_credentials'),
      });

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).toContain('client_id=test-client');
      expect(callBody).toContain('client_secret=test-secret');
    });

    it('should fetch token with password grant', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'password-token',
          expires_in: 7200,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'password',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        username: 'testuser',
        password: 'testpass',
      });

      expect(result.accessToken).toBe('password-token');

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).toContain('grant_type=password');
      expect(callBody).toContain('username=testuser');
      expect(callBody).toContain('password=testpass');
    });

    it('should include scopes when provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'scoped-token',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
        clientId: 'test-client',
        scopes: ['read', 'write', 'admin'],
      });

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).toContain('scope=read+write+admin');
    });

    it('should work without optional clientId and clientSecret', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'minimal-token',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
      });

      expect(result.accessToken).toBe('minimal-token');

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).not.toContain('client_id');
      expect(callBody).not.toContain('client_secret');
    });

    it('should default expires_in to 3600 seconds when not provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'no-expiry-token',
          // No expires_in field
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const beforeFetch = Date.now();
      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
      });

      // Should default to 3600 seconds (1 hour)
      const expectedMinExpiry = beforeFetch + 3600 * 1000;
      const expectedMaxExpiry = Date.now() + 3600 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it('should use provided expires_in value', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'custom-expiry-token',
          expires_in: 1800, // 30 minutes
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const beforeFetch = Date.now();
      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
      });

      // Should use 1800 seconds (30 minutes)
      const expectedMinExpiry = beforeFetch + 1800 * 1000;
      const expectedMaxExpiry = Date.now() + 1800 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(result.expiresAt).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue('{"error":"invalid_client"}'),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await expect(
        fetchOAuthToken({
          tokenUrl: 'https://auth.example.com/token',
          grantType: 'client_credentials',
          clientId: 'bad-client',
        }),
      ).rejects.toThrow('OAuth token request failed with status 401 Unauthorized');
    });

    it('should throw error when access_token is missing in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          // No access_token field
          token_type: 'Bearer',
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await expect(
        fetchOAuthToken({
          tokenUrl: 'https://auth.example.com/token',
          grantType: 'client_credentials',
        }),
      ).rejects.toThrow('OAuth token response missing access_token');
    });

    it('should handle password grant without username/password gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'token-without-creds',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      // Password grant without username/password - the function should still make the request
      // (server will likely reject it, but that's not our concern here)
      const result = await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'password',
      });

      expect(result.accessToken).toBe('token-without-creds');

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).toContain('grant_type=password');
      // Should not have username= or password= fields (distinct from grant_type=password)
      expect(callBody).not.toContain('username=');
      expect(callBody).not.toContain('&password=');
    });

    it('should not include empty scopes array', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'no-scope-token',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'client_credentials',
        scopes: [],
      });

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      expect(callBody).not.toContain('scope');
    });

    it('should URL-encode special characters in credentials', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'encoded-token',
          expires_in: 3600,
        }),
      };
      mockFetchWithProxy.mockResolvedValue(mockResponse);

      await fetchOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        grantType: 'password',
        clientId: 'client+id',
        clientSecret: 'secret&value',
        username: 'user@example.com',
        password: 'pass=word!',
      });

      const callBody = mockFetchWithProxy.mock.calls[0][1].body;
      // URLSearchParams should encode special characters
      expect(callBody).toContain('client_id=client%2Bid');
      expect(callBody).toContain('client_secret=secret%26value');
      expect(callBody).toContain('username=user%40example.com');
      expect(callBody).toContain('password=pass%3Dword%21');
    });
  });
});
