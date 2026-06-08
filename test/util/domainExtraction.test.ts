import { describe, expect, it } from 'vitest';
import {
  extractAllDomains,
  extractDomains,
  extractGithubRepos,
  extractUrls,
} from '../../src/util/domainExtraction';

describe('domainExtraction', () => {
  describe('extractUrls', () => {
    it('extracts http and https URLs', () => {
      const text = 'Visit https://example.com and http://test.org';
      const urls = extractUrls(text);
      expect(urls).toHaveLength(2);
      expect(urls[0].normalized).toBe('https://example.com');
      expect(urls[1].normalized).toBe('http://test.org');
    });

    it('extracts URLs with paths and query params', () => {
      const text = 'See https://github.com/owner/repo/tree/main';
      const urls = extractUrls(text);
      expect(urls[0].host).toBe('github.com');
      expect(urls[0].path).toContain('/owner/repo');
    });

    it('handles markdown links', () => {
      const text = '[link](https://example.com)';
      const urls = extractUrls(text);
      expect(urls).toHaveLength(1);
      expect(urls[0].normalized).toBe('https://example.com');
    });

    it('deduplicates URLs', () => {
      const text = 'https://example.com and https://example.com again';
      const urls = extractUrls(text);
      expect(urls).toHaveLength(1);
    });

    it('removes trailing punctuation', () => {
      const text = 'Check https://example.com.';
      const urls = extractUrls(text);
      expect(urls[0].normalized).toBe('https://example.com');
    });
  });

  describe('extractDomains', () => {
    it('extracts bare domains', () => {
      const text = 'example.com is a domain';
      const domains = extractDomains(text);
      expect(domains).toHaveLength(1);
      expect(domains[0].host).toBe('example.com');
    });

    it('extracts domains from URLs', () => {
      const urls = extractUrls('Visit https://example.com/path');
      const domains = extractDomains('Visit https://example.com/path', urls);
      expect(domains.some((d) => d.host === 'example.com')).toBe(true);
    });

    it('handles subdomains', () => {
      const text = 'api.example.com is here';
      const domains = extractDomains(text);
      expect(domains[0].host).toBe('api.example.com');
    });

    it('deduplicates domains', () => {
      const text = 'example.com and example.com';
      const domains = extractDomains(text);
      expect(domains).toHaveLength(1);
    });
  });

  describe('extractGithubRepos', () => {
    it('extracts github.com/owner/repo format', () => {
      const text = 'Check github.com/pytorch/pytorch';
      const repos = extractGithubRepos(text);
      expect(repos).toHaveLength(1);
      expect(repos[0].owner).toBe('pytorch');
      expect(repos[0].repo).toBe('pytorch');
      expect(repos[0].url).toContain('github.com');
    });

    it('extracts from full GitHub URLs', () => {
      const text = 'https://github.com/tensorflow/tensorflow';
      const repos = extractGithubRepos(text);
      expect(repos).toHaveLength(1);
      expect(repos[0].owner).toBe('tensorflow');
      expect(repos[0].repo).toBe('tensorflow');
    });

    it('handles .git suffix', () => {
      const text = 'github.com/owner/repo.git';
      const repos = extractGithubRepos(text);
      expect(repos[0].repo).toBe('repo');
    });

    it('ignores GitHub reserved paths', () => {
      const text = 'github.com/features/security';
      const repos = extractGithubRepos(text);
      expect(repos).toHaveLength(0);
    });

    it('does not match docs.github.com paths as repos', () => {
      const repos = extractGithubRepos('See https://docs.github.com/en/rest for the API');
      expect(repos.find((r) => r.full_name === 'en/rest')).toBeUndefined();
    });

    it('does not match gist.github.com paths as repos', () => {
      const repos = extractGithubRepos('Gist: https://gist.github.com/octocat/abc123def');
      expect(repos.find((r) => r.owner === 'octocat')).toBeUndefined();
    });

    it('does not match arbitrary subdomain.github.com hosts', () => {
      const repos = extractGithubRepos('See https://api.github.com/repos/foo/bar');
      // api.github.com is an API host, not a user-facing repo page.
      expect(repos.find((r) => r.full_name === 'foo/bar')).toBeUndefined();
    });

    it('deduplicates repos', () => {
      const text = 'github.com/owner/repo mentioned twice github.com/owner/repo';
      const repos = extractGithubRepos(text);
      expect(repos).toHaveLength(1);
    });
  });

  describe('extractAllDomains', () => {
    it('combines URLs, domains, and repos', () => {
      const text = `
        Visit https://example.com and test.org.
        Also see github.com/owner/repo.
      `;
      const result = extractAllDomains(text);
      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.domains.length).toBeGreaterThan(0);
      expect(result.github_repos.length).toBe(1);
      expect(result.no_links).toBe(false);
    });

    it('returns no_links=true when no entities found', () => {
      const text = 'Just some plain text';
      const result = extractAllDomains(text);
      expect(result.no_links).toBe(true);
      expect(result.urls).toHaveLength(0);
    });

    it('handles empty text gracefully', () => {
      const result = extractAllDomains('');
      expect(result.no_links).toBe(true);
      expect(result.urls).toHaveLength(0);
      expect(result.domains).toHaveLength(0);
      expect(result.github_repos).toHaveLength(0);
    });

    it('respects custom source parameter', () => {
      const result = extractAllDomains('Visit https://example.com', 'custom-source');
      expect(result.urls[0].source).toBe('custom-source');
    });
  });

  describe('extractUrls edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(extractUrls('')).toEqual([]);
    });

    it('strips backticks from urls', () => {
      const urls = extractUrls('Try `https://example.com`');
      expect(urls).toHaveLength(1);
      expect(urls[0].normalized).toBe('https://example.com');
    });

    it('extracts www. urls and normalizes to https', () => {
      const urls = extractUrls('Visit www.example.com today');
      expect(urls).toHaveLength(1);
      expect(urls[0].scheme).toBe('https');
      expect(urls[0].host).toBe('example.com');
    });

    it('does not extract www. preceded by @ (avoid emails)', () => {
      const urls = extractUrls('Contact user@www.example.com');
      // The @ guard prevents www.example.com from being matched
      expect(urls.find((u) => u.host === 'example.com' && u.scheme === 'https')).toBeUndefined();
    });

    it('strips www. from host', () => {
      const urls = extractUrls('Visit https://www.example.com');
      expect(urls[0].host).toBe('example.com');
    });

    it('preserves uppercase scheme by lowercasing it', () => {
      const urls = extractUrls('See https://example.com/path?q=1#frag');
      expect(urls[0].scheme).toBe('https');
      expect(urls[0].path).toBe('/path');
      expect(urls[0].query).toBe('?q=1');
      expect(urls[0].fragment).toBe('#frag');
    });

    it('strips www. from host in both http and www variants', () => {
      const urls = extractUrls('https://example.com and www.example.com');
      // Both entries retain their distinct normalized form but host is www-stripped.
      const hosts = urls.map((u) => u.host);
      expect(hosts.every((h) => h === 'example.com')).toBe(true);
    });
  });

  describe('extractDomains edge cases', () => {
    it('skips bare-domain matches that fail normalization (e.g. IPv4)', () => {
      // IPv4 looks like multiple labels but normalizeDomain rejects it
      const domains = extractDomains('Server 192.168.1.1 is local');
      expect(domains.find((d) => d.host === '192.168.1.1')).toBeUndefined();
    });

    it('skips labels that start or end with hyphen', () => {
      const domains = extractDomains('Visit -bad.example.com');
      expect(domains.find((d) => d.host === '-bad.example.com')).toBeUndefined();
    });

    it('falls back when splitDomain receives single-label input via URL host', () => {
      // Single-label hosts are rejected by normalizeDomain; the loop must just skip
      const urls = [
        {
          raw: 'localhost',
          normalized: 'http://localhost',
          scheme: 'http',
          host: 'localhost',
          path: '/',
          query: '',
          fragment: '',
          source: 'test',
        },
      ];
      const domains = extractDomains('', urls);
      expect(domains).toHaveLength(0);
    });

    it('skips URL hosts that normalize to null', () => {
      const urls = [
        {
          raw: '',
          normalized: '',
          scheme: '',
          host: '',
          path: '',
          query: '',
          fragment: '',
          source: 'test',
        },
      ];
      const domains = extractDomains('', urls);
      expect(domains).toHaveLength(0);
    });

    it('deduplicates host appearing in URL and bare text', () => {
      const urls = extractUrls('https://example.com');
      const domains = extractDomains('https://example.com and bare example.com', urls);
      expect(domains.filter((d) => d.host === 'example.com')).toHaveLength(1);
    });

    it('splits multi-level subdomains correctly', () => {
      const domains = extractDomains('api.staging.example.com is up');
      const d = domains.find((x) => x.host === 'api.staging.example.com');
      expect(d).toBeDefined();
      expect(d?.registered_domain).toBe('example.com');
      expect(d?.subdomain).toBe('api.staging');
      expect(d?.domain).toBe('example');
      expect(d?.suffix).toBe('com');
    });
  });

  describe('extractGithubRepos edge cases', () => {
    it('extracts from www.github.com prefix', () => {
      const repos = extractGithubRepos('See www.github.com/owner/repo for code');
      expect(repos).toHaveLength(1);
      expect(repos[0].full_name).toBe('owner/repo');
    });

    it('ignores all reserved owner paths', () => {
      const text = `
        github.com/features/security
        github.com/marketplace/something
        github.com/pricing/x
        github.com/login/y
        github.com/explore/z
      `;
      expect(extractGithubRepos(text)).toHaveLength(0);
    });

    it('preserves owner/repo casing in output but dedupes case-insensitively', () => {
      const repos = extractGithubRepos('github.com/PyTorch/PyTorch and github.com/pytorch/pytorch');
      expect(repos).toHaveLength(1);
      // The first occurrence wins
      expect(repos[0].owner).toBe('PyTorch');
    });

    it('builds full url and full_name correctly', () => {
      const repos = extractGithubRepos('github.com/openai/whisper');
      expect(repos[0].url).toBe('https://github.com/openai/whisper');
      expect(repos[0].full_name).toBe('openai/whisper');
      expect(repos[0].link_type).toBe('repo');
      expect(repos[0].platform).toBe('github');
    });

    it('strips .git only from the end', () => {
      const repos = extractGithubRepos('github.com/owner/my.git.project.git');
      // Only trailing .git stripped
      expect(repos[0].repo).toBe('my.git.project');
    });
  });
});
