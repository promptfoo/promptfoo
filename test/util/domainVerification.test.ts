import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

import { verifyGithubRepo, verifyHttpUrl } from '../../src/util/domainVerification';
import { fetchWithProxy } from '../../src/util/fetch/index';

const mockedFetch = vi.mocked(fetchWithProxy);

describe('domainVerification', () => {
  afterEach(() => {
    mockedFetch.mockReset();
  });

  describe('verifyGithubRepo', () => {
    it('returns exists=true for 200 response', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 200 }));

      const result = await verifyGithubRepo('pytorch', 'pytorch');
      expect(result.status).toBe(200);
      expect(result.exists).toBe(true);
      expect(result.url).toContain('github.com');
    });

    it('returns exists=false for 404 response', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 404 }));

      const result = await verifyGithubRepo('fake-org', 'fake-repo');
      expect(result.status).toBe(404);
      expect(result.exists).toBe(false);
    });

    it('times out after specified milliseconds', async () => {
      mockedFetch.mockImplementation(
        (_url, _init, signal) =>
          new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
            setTimeout(() => resolve(new Response(null, { status: 200 })), 10000);
          }),
      );

      const result = await verifyGithubRepo('owner', 'repo', 50);
      expect(result.exists).toBeNull();
      expect(result.error).toBe('timeout');
    });

    it('handles network errors gracefully', async () => {
      mockedFetch.mockRejectedValue(new Error('Network error'));

      const result = await verifyGithubRepo('owner', 'repo');
      expect(result.exists).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('treats 403 (rate-limited) as inconclusive, not as existing', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 403 }));

      const result = await verifyGithubRepo('owner', 'repo');
      expect(result.status).toBe(403);
      expect(result.exists).toBeNull();
    });
  });

  describe('verifyHttpUrl', () => {
    it('returns exists=true for 200 response', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 200 }));

      const result = await verifyHttpUrl('https://example.com');
      expect(result.status).toBe(200);
      expect(result.exists).toBe(true);
    });

    it('returns exists=false for 404 response', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 404 }));

      const result = await verifyHttpUrl('https://fake-domain-12345.io');
      expect(result.status).toBe(404);
      expect(result.exists).toBe(false);
    });

    it('treats 3xx as exists=true (redirect)', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 301 }));

      const result = await verifyHttpUrl('https://example.com');
      expect(result.exists).toBe(true);
    });

    it('treats 410 Gone as exists=false', async () => {
      mockedFetch.mockResolvedValue(new Response(null, { status: 410 }));

      const result = await verifyHttpUrl('https://example.com/removed');
      expect(result.status).toBe(410);
      expect(result.exists).toBe(false);
    });

    it.each([
      401, 403, 405, 429, 500, 502, 503,
    ])('treats %i as inconclusive (exists=null)', async (status) => {
      mockedFetch.mockResolvedValue(new Response(null, { status }));

      const result = await verifyHttpUrl('https://example.com');
      expect(result.status).toBe(status);
      expect(result.exists).toBeNull();
    });

    it('times out after specified milliseconds', async () => {
      mockedFetch.mockImplementation(
        (_url, _init, signal) =>
          new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
            setTimeout(() => resolve(new Response(null, { status: 200 })), 10000);
          }),
      );

      const result = await verifyHttpUrl('https://slow-example.com', 50);
      expect(result.exists).toBeNull();
      expect(result.error).toBe('timeout');
    });

    it('handles invalid URLs', async () => {
      const result = await verifyHttpUrl('not a url');
      expect(result.exists).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});
