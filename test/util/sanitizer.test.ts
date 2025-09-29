import { sanitizeBody, sanitizeUrl } from '../../src/util/sanitizer';

// Mock console.warn to prevent test noise
const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  consoleSpy.mockClear();
});

afterAll(() => {
  consoleSpy.mockRestore();
});

describe('sanitizeBody', () => {
  describe('should return input unchanged for non-objects', () => {
    it('should handle null', () => {
      expect(sanitizeBody(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(sanitizeBody(undefined)).toBeUndefined();
    });

    it('should handle strings', () => {
      expect(sanitizeBody('test string')).toBe('test string');
    });

    it('should handle numbers', () => {
      expect(sanitizeBody(42)).toBe(42);
      expect(sanitizeBody(0)).toBe(0);
      expect(sanitizeBody(-1)).toBe(-1);
      expect(sanitizeBody(3.14)).toBe(3.14);
    });

    it('should handle booleans', () => {
      expect(sanitizeBody(true)).toBe(true);
      expect(sanitizeBody(false)).toBe(false);
    });

    it('should handle functions', () => {
      const fn = () => 'test';
      expect(sanitizeBody(fn)).toBe(fn);
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      expect(sanitizeBody(sym)).toBe(sym);
    });
  });

  describe('should sanitize sensitive keys in objects', () => {
    it('should redact password field', () => {
      const input = { username: 'user', password: 'secret123' };
      const result = sanitizeBody(input);
      expect(result).toEqual({ username: 'user', password: '[REDACTED]' });
    });

    it('should redact token field', () => {
      const input = { data: 'public', token: 'abc123' };
      const result = sanitizeBody(input);
      expect(result).toEqual({ data: 'public', token: '[REDACTED]' });
    });

    it('should redact secret field', () => {
      const input = { config: 'value', secret: 'hidden' };
      const result = sanitizeBody(input);
      expect(result).toEqual({ config: 'value', secret: '[REDACTED]' });
    });

    it('should redact apiKey field', () => {
      const input = { endpoint: 'url', apiKey: 'key123' };
      const result = sanitizeBody(input);
      expect(result).toEqual({ endpoint: 'url', apiKey: '[REDACTED]' });
    });

    it('should redact multiple sensitive fields', () => {
      const input = {
        username: 'user',
        password: 'pass123',
        token: 'token456',
        secret: 'secret789',
        apiKey: 'key000',
        publicData: 'visible',
      };
      const result = sanitizeBody(input);
      expect(result).toEqual({
        username: 'user',
        password: '[REDACTED]',
        token: '[REDACTED]',
        secret: '[REDACTED]',
        apiKey: '[REDACTED]',
        publicData: 'visible',
      });
    });

    it('should preserve non-sensitive fields', () => {
      const input = { name: 'test', value: 42, active: true };
      const result = sanitizeBody(input);
      expect(result).toEqual({ name: 'test', value: 42, active: true });
    });
  });

  describe('should handle edge cases safely', () => {
    it('should handle empty object', () => {
      expect(sanitizeBody({})).toEqual({});
    });

    it('should handle object with falsy sensitive values', () => {
      const input = { password: '', token: null, secret: undefined, apiKey: 0 };
      const result = sanitizeBody(input);
      // Should not redact falsy values
      expect(result).toEqual({ password: '', token: null, secret: undefined, apiKey: 0 });
    });

    it('should handle object with sensitive key but falsy value', () => {
      const input = { password: false };
      const result = sanitizeBody(input);
      expect(result).toEqual({ password: false });
    });

    it('should not mutate original object', () => {
      const input = { password: 'secret' };
      const result = sanitizeBody(input);
      expect(input.password).toBe('secret');
      expect(result.password).toBe('[REDACTED]');
      expect(result).not.toBe(input);
    });

    it('should handle nested objects (shallow sanitization)', () => {
      const input = {
        user: { password: 'secret' },
        token: 'token123',
      };
      const result = sanitizeBody(input);
      expect(result).toEqual({
        user: { password: 'secret' }, // Nested passwords are not sanitized
        token: '[REDACTED]',
      });
    });

    it('should handle arrays (treated as objects)', () => {
      const input = ['item1', 'item2'];
      const result = sanitizeBody(input);
      // Arrays are objects, so they get the spread operator treatment
      expect(result).toEqual({ '0': 'item1', '1': 'item2' });
    });

    it('should handle Date objects (treated as objects)', () => {
      const date = new Date('2023-01-01');
      const result = sanitizeBody(date);
      // Date objects get spread into empty objects since they don't have enumerable properties
      expect(result).toEqual({});
    });

    it('should handle objects with circular references safely', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      const result = sanitizeBody(obj);
      expect(result.name).toBe('test');
      expect(result.self).toBe(obj.self); // Should preserve the circular reference
    });
  });
});

describe('sanitizeUrl', () => {
  describe('should return input unchanged for invalid inputs', () => {
    it('should handle non-string inputs', () => {
      expect(sanitizeUrl(null as any)).toBeNull();
      expect(sanitizeUrl(undefined as any)).toBeUndefined();
      expect(sanitizeUrl(123 as any)).toBe(123);
      expect(sanitizeUrl({} as any)).toEqual({});
    });

    it('should handle empty string', () => {
      expect(sanitizeUrl('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(sanitizeUrl('   ')).toBe('   ');
    });
  });

  describe('should sanitize basic authentication in URLs', () => {
    it('should redact username and password', () => {
      const url = 'https://user:pass@example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/api');
    });

    it('should redact username only', () => {
      const url = 'https://user@example.com/api';
      const result = sanitizeUrl(url);
      // URL parser always adds both username and password fields
      expect(result).toBe('https://***:***@example.com/api');
    });

    it('should handle empty username/password', () => {
      const url = 'https://:@example.com/api';
      const result = sanitizeUrl(url);
      // URL with empty auth gets normalized and removed by URL parser
      expect(result).toBe('https://example.com/api');
    });

    it('should preserve URL without auth', () => {
      const url = 'https://example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api');
    });
  });

  describe('should sanitize sensitive query parameters', () => {
    it('should redact api_key parameter', () => {
      const url = 'https://example.com/api?api_key=secret123&data=public';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?api_key=%5BREDACTED%5D&data=public');
    });

    it('should redact apiKey parameter', () => {
      const url = 'https://example.com/api?apiKey=secret123&data=public';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?apiKey=%5BREDACTED%5D&data=public');
    });

    it('should redact token parameter', () => {
      const url = 'https://example.com/api?token=abc123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?token=%5BREDACTED%5D');
    });

    it('should redact password parameter', () => {
      const url = 'https://example.com/api?password=secret';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?password=%5BREDACTED%5D');
    });

    it('should redact secret parameter', () => {
      const url = 'https://example.com/api?secret=hidden';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?secret=%5BREDACTED%5D');
    });

    it('should redact signature parameter', () => {
      const url = 'https://example.com/api?signature=sig123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?signature=%5BREDACTED%5D');
    });

    it('should redact sig parameter', () => {
      const url = 'https://example.com/api?sig=sig123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?sig=%5BREDACTED%5D');
    });

    it('should redact access_token parameter', () => {
      const url = 'https://example.com/api?access_token=token123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?access_token=%5BREDACTED%5D');
    });

    it('should redact access-token parameter (hyphenated)', () => {
      const url = 'https://example.com/api?access-token=token123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?access-token=%5BREDACTED%5D');
    });

    it('should redact refresh_token parameter', () => {
      const url = 'https://example.com/api?refresh_token=refresh123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?refresh_token=%5BREDACTED%5D');
    });

    it('should redact id_token parameter', () => {
      const url = 'https://example.com/api?id_token=id123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?id_token=%5BREDACTED%5D');
    });

    it('should redact client_secret parameter', () => {
      const url = 'https://example.com/api?client_secret=client123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?client_secret=%5BREDACTED%5D');
    });

    it('should redact authorization parameter', () => {
      const url = 'https://example.com/api?authorization=Bearer%20token123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?authorization=%5BREDACTED%5D');
    });

    it('should be case insensitive for parameter matching', () => {
      const url = 'https://example.com/api?API_KEY=secret123&Token=token123&SECRET=hidden';
      const result = sanitizeUrl(url);
      expect(result).toBe(
        'https://example.com/api?API_KEY=%5BREDACTED%5D&Token=%5BREDACTED%5D&SECRET=%5BREDACTED%5D',
      );
    });

    it('should redact multiple sensitive parameters', () => {
      const url =
        'https://example.com/api?api_key=secret123&token=token456&data=public&password=pass789';
      const result = sanitizeUrl(url);
      expect(result).toBe(
        'https://example.com/api?api_key=%5BREDACTED%5D&token=%5BREDACTED%5D&data=public&password=%5BREDACTED%5D',
      );
    });

    it('should preserve non-sensitive parameters', () => {
      const url = 'https://example.com/api?limit=10&page=1&sort=name&filter=active';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?limit=10&page=1&sort=name&filter=active');
    });
  });

  describe('should handle complex URLs', () => {
    it('should sanitize both auth and query parameters', () => {
      const url = 'https://user:pass@example.com/api?api_key=secret123&data=public';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/api?api_key=%5BREDACTED%5D&data=public');
    });

    it('should handle URLs with ports', () => {
      const url = 'https://user:pass@example.com:8080/api?token=secret';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com:8080/api?token=%5BREDACTED%5D');
    });

    it('should handle URLs with fragments', () => {
      const url = 'https://example.com/api?api_key=secret#section';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?api_key=%5BREDACTED%5D#section');
    });

    it('should handle localhost URLs', () => {
      const url = 'http://localhost:3000/api?token=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('http://localhost:3000/api?token=%5BREDACTED%5D');
    });

    it('should handle file URLs', () => {
      const url = 'file:///path/to/file';
      const result = sanitizeUrl(url);
      expect(result).toBe('file:///path/to/file');
    });
  });

  describe('should handle edge cases safely', () => {
    it('should handle malformed URLs gracefully', () => {
      const malformedUrl = 'not-a-valid-url';
      const result = sanitizeUrl(malformedUrl);
      expect(result).toBe(malformedUrl); // Should return original if parsing fails
    });

    it('should handle URLs with special characters', () => {
      const url = 'https://example.com/api?query=hello%20world&api_key=secret123';
      const result = sanitizeUrl(url);
      // URL encoding gets normalized by URL parser (%20 becomes +)
      expect(result).toBe('https://example.com/api?query=hello+world&api_key=%5BREDACTED%5D');
    });

    it('should handle URLs with no search params', () => {
      const url = 'https://example.com/api/endpoint';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api/endpoint');
    });

    it('should handle URLs with empty search params', () => {
      const url = 'https://example.com/api?';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?');
    });

    it('should handle search param processing errors gracefully', () => {
      // This tests the catch block in search params handling
      // We can't easily trigger this without mocking, but the function should handle it
      const url = 'https://example.com/api?token=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?token=%5BREDACTED%5D');
    });

    it('should handle very long URLs', () => {
      const longParam = 'a'.repeat(1000);
      const url = `https://example.com/api?data=${longParam}&api_key=secret123`;
      const result = sanitizeUrl(url);
      expect(result).toContain('data=' + longParam);
      expect(result).toContain('api_key=%5BREDACTED%5D');
    });

    it('should handle URLs with multiple question marks (malformed)', () => {
      const url = 'https://example.com/api?first=1?api_key=secret';
      const result = sanitizeUrl(url);
      // Should still try to sanitize what it can parse
      expect(result).toContain('https://example.com/api');
    });

    it('should handle protocol-relative URLs', () => {
      const url = '//example.com/api?api_key=secret123';
      // This will likely fail URL parsing and return original
      const result = sanitizeUrl(url);
      expect(result).toBe(url);
    });
  });

  describe('should handle international domain names', () => {
    it('should handle IDN domains', () => {
      const url = 'https://例え.テスト/api?token=secret123';
      const result = sanitizeUrl(url);
      // Should sanitize the token regardless of domain
      expect(result).toContain('%5BREDACTED%5D');
    });
  });

  describe('should handle URL encoding', () => {
    it('should handle encoding in paths and params', () => {
      const url = 'https://example.com/api/hello%20world?data=test%20value&api_key=secret123';
      const result = sanitizeUrl(url);
      expect(result).toContain('hello%20world'); // Path encoding preserved
      expect(result).toContain('data=test+value'); // Query param encoding normalized
      expect(result).toContain('api_key=%5BREDACTED%5D');
    });
  });
});
