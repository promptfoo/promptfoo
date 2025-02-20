import { normalizeApiUrl } from '../../src/util/url';

describe('url utilities', () => {
  describe('normalizeApiUrl', () => {
    it('throws error for empty URL string', () => {
      expect(() => normalizeApiUrl('', 'v1')).toThrow('URL string cannot be empty');
    });

    it('throws error for empty suffix', () => {
      expect(() => normalizeApiUrl('http://example.com', '')).toThrow('Suffix cannot be empty');
    });

    it('handles full URLs correctly', () => {
      expect(normalizeApiUrl('http://example.com', 'v1')).toBe('http://example.com/v1');
      expect(normalizeApiUrl('https://api.example.com', 'v1')).toBe('https://api.example.com/v1');
      expect(normalizeApiUrl('http://localhost:4000', 'v1')).toBe('http://localhost:4000/v1');
    });

    it('handles URLs with trailing slashes', () => {
      expect(normalizeApiUrl('http://example.com/', 'v1')).toBe('http://example.com/v1');
      expect(normalizeApiUrl('http://example.com//', 'v1')).toBe('http://example.com/v1');
    });

    it('handles URLs that already contain the suffix', () => {
      expect(normalizeApiUrl('http://example.com/v1', 'v1')).toBe('http://example.com/v1');
      expect(normalizeApiUrl('http://example.com/api/v1', 'v1')).toBe('http://example.com/api/v1');
    });

    it('handles URLs with existing paths', () => {
      expect(normalizeApiUrl('http://example.com/api', 'v1')).toBe('http://example.com/api/v1');
      expect(normalizeApiUrl('http://example.com/api/test', 'v1')).toBe(
        'http://example.com/api/test/v1',
      );
    });

    it('handles multi-part suffixes', () => {
      expect(normalizeApiUrl('http://example.com', 'api/v1')).toBe('http://example.com/api/v1');
      expect(normalizeApiUrl('http://example.com/test', 'api/v1')).toBe(
        'http://example.com/test/api/v1',
      );
    });

    it('handles suffixes with leading/trailing slashes', () => {
      expect(normalizeApiUrl('http://example.com', '/v1/')).toBe('http://example.com/v1');
      expect(normalizeApiUrl('http://example.com', '/api/v1/')).toBe('http://example.com/api/v1');
    });

    it('handles partial URLs (hostname only)', () => {
      expect(normalizeApiUrl('example.com', 'v1')).toBe('https://example.com/v1');
      expect(normalizeApiUrl('api.example.com', 'v1')).toBe('https://api.example.com/v1');
      expect(normalizeApiUrl('localhost:4000', 'v1')).toBe('https://localhost:4000/v1');
    });

    it('handles invalid URLs gracefully', () => {
      expect(normalizeApiUrl('not-a-url', 'v1')).toBe('not-a-url/v1');
      expect(normalizeApiUrl('invalid://test', 'v1')).toBe('invalid://test/v1');
    });

    it('handles domain-like strings that fail HTTPS parsing', () => {
      // This looks like a domain but will fail URL parsing even with https://
      expect(normalizeApiUrl('something.that.looks.like.a.domain...', 'v1'))
        .toBe('something.that.looks.like.a.domain.../v1');
      expect(normalizeApiUrl('bad.domain.', 'v1'))
        .toBe('bad.domain./v1');
    });

    it('handles domain-like strings that fail URL parsing', () => {
      // This matches the domain regex but will fail URL parsing
      expect(normalizeApiUrl('valid-domain.com:', 'v1'))
        .toBe('valid-domain.com:/v1');
    });

    it('preserves query parameters and hashes', () => {
      expect(normalizeApiUrl('http://example.com?key=value', 'v1')).toBe(
        'http://example.com/v1?key=value',
      );
      expect(normalizeApiUrl('http://example.com#section', 'v1')).toBe(
        'http://example.com/v1#section',
      );
      expect(normalizeApiUrl('http://example.com?key=value#section', 'v1')).toBe(
        'http://example.com/v1?key=value#section',
      );
    });

    it('handles complex paths with the suffix in the middle', () => {
      expect(normalizeApiUrl('http://example.com/v1/additional', 'v1')).toBe(
        'http://example.com/v1/additional/v1',
      );
      expect(normalizeApiUrl('http://example.com/api/v1/test', 'api/v1')).toBe(
        'http://example.com/api/v1/test/api/v1',
      );
    });
  });
});
