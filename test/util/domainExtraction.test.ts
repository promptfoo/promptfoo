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
  });
});
