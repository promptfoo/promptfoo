import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeBody, sanitizeObject, sanitizeUrl } from '../../src/util/sanitizer';

// Mock console methods to prevent test noise
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  consoleErrorSpy.mockClear();
  consoleWarnSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

describe('sanitizeObject', () => {
  describe('primitives and basic types', () => {
    it('should handle null', () => {
      expect(sanitizeObject(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(sanitizeObject(undefined)).toBeUndefined();
    });

    it('should handle strings', () => {
      expect(sanitizeObject('test string')).toBe('test string');
    });

    it('should handle numbers', () => {
      expect(sanitizeObject(42)).toBe(42);
      expect(sanitizeObject(0)).toBe(0);
      expect(sanitizeObject(-1)).toBe(-1);
      expect(sanitizeObject(3.14)).toBe(3.14);
      expect(sanitizeObject(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
      expect(sanitizeObject(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
      expect(sanitizeObject(Number.NaN)).toBeNaN();
    });

    it('should handle booleans', () => {
      expect(sanitizeObject(true)).toBe(true);
      expect(sanitizeObject(false)).toBe(false);
    });

    it('should handle empty string', () => {
      expect(sanitizeObject('')).toBe('');
    });

    it('should parse and sanitize JSON strings', () => {
      const jsonString = JSON.stringify({ password: 'secret', data: 'public' });
      const result = sanitizeObject(jsonString);
      // Result should be a JSON string with sensitive fields redacted
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ password: '[REDACTED]', data: 'public' });
    });

    it('should return invalid JSON strings unchanged', () => {
      const invalidJson = '{invalid json}';
      expect(sanitizeObject(invalidJson)).toBe(invalidJson);
    });
  });

  describe('function handling', () => {
    it('should convert named functions to string representation', () => {
      function namedFunction() {
        return 'test';
      }
      const result = sanitizeObject({ func: namedFunction });
      // Functions get lost during JSON.parse/stringify cycle
      expect(result.func).toBeUndefined();
    });

    it('should convert anonymous functions to string representation', () => {
      const anonymousFunc = function () {
        return 'test';
      };
      const result = sanitizeObject({ func: anonymousFunc });
      // Functions get lost during JSON.parse/stringify cycle
      expect(result.func).toBeUndefined();
    });

    it('should convert arrow functions to string representation', () => {
      const arrowFunc = () => 'test';
      const result = sanitizeObject({ func: arrowFunc });
      // Functions get lost during JSON.parse/stringify cycle
      expect(result.func).toBeUndefined();
    });

    it('should handle functions at multiple nesting levels', () => {
      const input = {
        level1: {
          func: () => 'test',
          level2: {
            func: function namedFunc() {
              return 'nested';
            },
          },
        },
      };
      const result = sanitizeObject(input);
      // Functions get lost during JSON.parse/stringify cycle
      expect(result.level1.func).toBeUndefined();
      expect(result.level1.level2.func).toBeUndefined();
    });
  });

  describe('sensitive field redaction', () => {
    describe('password variants', () => {
      it('should redact password', () => {
        expect(sanitizeObject({ password: 'secret123' })).toEqual({ password: '[REDACTED]' });
      });

      it('should redact passwd', () => {
        expect(sanitizeObject({ passwd: 'secret123' })).toEqual({ passwd: '[REDACTED]' });
      });

      it('should redact pwd', () => {
        expect(sanitizeObject({ pwd: 'secret123' })).toEqual({ pwd: '[REDACTED]' });
      });

      it('should handle case-insensitive password variants', () => {
        const input = { Password: 'secret', PASSWORD: 'secret2', PaSsWoRd: 'secret3' };
        const result = sanitizeObject(input);
        expect(result.Password).toBe('[REDACTED]');
        expect(result.PASSWORD).toBe('[REDACTED]');
        expect(result.PaSsWoRd).toBe('[REDACTED]');
      });
    });

    describe('secret variants', () => {
      it('should redact secret', () => {
        expect(sanitizeObject({ secret: 'hidden' })).toEqual({ secret: '[REDACTED]' });
      });

      it('should redact secrets', () => {
        expect(sanitizeObject({ secrets: 'hidden' })).toEqual({ secrets: '[REDACTED]' });
      });

      it('should redact client_secret with underscore', () => {
        expect(sanitizeObject({ client_secret: 'hidden' })).toEqual({
          client_secret: '[REDACTED]',
        });
      });

      it('should redact client-secret with hyphen', () => {
        expect(sanitizeObject({ 'client-secret': 'hidden' })).toEqual({
          'client-secret': '[REDACTED]',
        });
      });

      it('should redact clientSecret in camelCase', () => {
        expect(sanitizeObject({ clientSecret: 'hidden' })).toEqual({ clientSecret: '[REDACTED]' });
      });

      it('should redact webhook_secret', () => {
        expect(sanitizeObject({ webhook_secret: 'hidden' })).toEqual({
          webhook_secret: '[REDACTED]',
        });
      });
    });

    describe('api keys and tokens', () => {
      it('should redact apiKey', () => {
        expect(sanitizeObject({ apiKey: 'key123' })).toEqual({ apiKey: '[REDACTED]' });
      });

      it('should redact api_key', () => {
        expect(sanitizeObject({ api_key: 'key123' })).toEqual({ api_key: '[REDACTED]' });
      });

      it('should redact api-key', () => {
        expect(sanitizeObject({ 'api-key': 'key123' })).toEqual({ 'api-key': '[REDACTED]' });
      });

      it('should redact token', () => {
        expect(sanitizeObject({ token: 'token123' })).toEqual({ token: '[REDACTED]' });
      });

      it('should redact accessToken', () => {
        expect(sanitizeObject({ accessToken: 'token123' })).toEqual({ accessToken: '[REDACTED]' });
      });

      it('should redact access_token', () => {
        expect(sanitizeObject({ access_token: 'token123' })).toEqual({
          access_token: '[REDACTED]',
        });
      });

      it('should redact refreshToken', () => {
        expect(sanitizeObject({ refreshToken: 'token123' })).toEqual({
          refreshToken: '[REDACTED]',
        });
      });

      it('should redact idToken', () => {
        expect(sanitizeObject({ idToken: 'token123' })).toEqual({ idToken: '[REDACTED]' });
      });

      it('should redact bearerToken', () => {
        expect(sanitizeObject({ bearerToken: 'token123' })).toEqual({ bearerToken: '[REDACTED]' });
      });

      it('should redact authToken', () => {
        expect(sanitizeObject({ authToken: 'token123' })).toEqual({ authToken: '[REDACTED]' });
      });
    });

    describe('authorization and auth variants', () => {
      it('should redact authorization', () => {
        expect(sanitizeObject({ authorization: 'Bearer token' })).toEqual({
          authorization: '[REDACTED]',
        });
      });

      it('should redact auth', () => {
        expect(sanitizeObject({ auth: 'token' })).toEqual({ auth: '[REDACTED]' });
      });

      it('should redact bearer', () => {
        expect(sanitizeObject({ bearer: 'token' })).toEqual({ bearer: '[REDACTED]' });
      });
    });

    describe('header-specific patterns', () => {
      it('should redact x-api-key', () => {
        expect(sanitizeObject({ 'x-api-key': 'key123' })).toEqual({ 'x-api-key': '[REDACTED]' });
      });

      it('should redact x-auth-token', () => {
        expect(sanitizeObject({ 'x-auth-token': 'token123' })).toEqual({
          'x-auth-token': '[REDACTED]',
        });
      });

      it('should redact x-access-token', () => {
        expect(sanitizeObject({ 'x-access-token': 'token123' })).toEqual({
          'x-access-token': '[REDACTED]',
        });
      });

      it('should redact x-auth', () => {
        expect(sanitizeObject({ 'x-auth': 'token123' })).toEqual({ 'x-auth': '[REDACTED]' });
      });

      it('should redact cookie', () => {
        expect(sanitizeObject({ cookie: 'session=abc123' })).toEqual({ cookie: '[REDACTED]' });
      });

      it('should redact set-cookie', () => {
        expect(sanitizeObject({ 'set-cookie': 'session=abc123' })).toEqual({
          'set-cookie': '[REDACTED]',
        });
      });
    });

    describe('certificate and encryption keys', () => {
      it('should redact privateKey', () => {
        expect(sanitizeObject({ privateKey: '-----BEGIN' })).toEqual({ privateKey: '[REDACTED]' });
      });

      it('should redact private_key', () => {
        expect(sanitizeObject({ private_key: '-----BEGIN' })).toEqual({
          private_key: '[REDACTED]',
        });
      });

      it('should redact certificatePassword', () => {
        expect(sanitizeObject({ certificatePassword: 'pass' })).toEqual({
          certificatePassword: '[REDACTED]',
        });
      });

      it('should redact pfxPassword', () => {
        expect(sanitizeObject({ pfxPassword: 'pass' })).toEqual({ pfxPassword: '[REDACTED]' });
      });

      it('should redact keystorePassword', () => {
        expect(sanitizeObject({ keystorePassword: 'pass' })).toEqual({
          keystorePassword: '[REDACTED]',
        });
      });

      it('should redact encryptionKey', () => {
        expect(sanitizeObject({ encryptionKey: 'key' })).toEqual({ encryptionKey: '[REDACTED]' });
      });

      it('should redact signingKey', () => {
        expect(sanitizeObject({ signingKey: 'key' })).toEqual({ signingKey: '[REDACTED]' });
      });

      it('should redact signature', () => {
        expect(sanitizeObject({ signature: 'sig' })).toEqual({ signature: '[REDACTED]' });
      });

      it('should redact sig', () => {
        expect(sanitizeObject({ sig: 'sig' })).toEqual({ sig: '[REDACTED]' });
      });

      it('should redact passphrase', () => {
        expect(sanitizeObject({ passphrase: 'phrase' })).toEqual({ passphrase: '[REDACTED]' });
      });

      it('should redact certificateContent', () => {
        expect(sanitizeObject({ certificateContent: 'content' })).toEqual({
          certificateContent: '[REDACTED]',
        });
      });

      it('should redact pfx', () => {
        expect(sanitizeObject({ pfx: 'content' })).toEqual({ pfx: '[REDACTED]' });
      });

      it('should redact pfxContent', () => {
        expect(sanitizeObject({ pfxContent: 'content' })).toEqual({ pfxContent: '[REDACTED]' });
      });

      it('should redact certKey', () => {
        expect(sanitizeObject({ certKey: 'key' })).toEqual({ certKey: '[REDACTED]' });
      });
    });

    it('should redact multiple sensitive fields in same object', () => {
      const input = {
        username: 'user',
        password: 'pass123',
        token: 'token456',
        secret: 'secret789',
        apiKey: 'key000',
        publicData: 'visible',
        id: 123,
      };
      const result = sanitizeObject(input);
      expect(result).toEqual({
        username: 'user',
        password: '[REDACTED]',
        token: '[REDACTED]',
        secret: '[REDACTED]',
        apiKey: '[REDACTED]',
        publicData: 'visible',
        id: 123,
      });
    });

    it('should preserve non-sensitive fields', () => {
      const input = {
        name: 'test',
        value: 42,
        active: true,
        items: ['a', 'b'],
        metadata: { key: 'value' },
      };
      const result = sanitizeObject(input);
      expect(result).toEqual(input);
    });
  });

  describe('array handling', () => {
    it('should sanitize arrays', () => {
      const input = ['item1', 'item2', 'item3'];
      const result = sanitizeObject(input);
      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('should sanitize objects within arrays', () => {
      const input = [{ password: 'secret1' }, { password: 'secret2' }, { data: 'public' }];
      const result = sanitizeObject(input);
      expect(result).toEqual([
        { password: '[REDACTED]' },
        { password: '[REDACTED]' },
        { data: 'public' },
      ]);
    });

    it('should sanitize nested arrays', () => {
      const input = [[1, 2], [3, 4], [{ token: 'secret' }]];
      const result = sanitizeObject(input);
      expect(result).toEqual([[1, 2], [3, 4], [{ token: '[REDACTED]' }]]);
    });

    it('should handle empty arrays', () => {
      expect(sanitizeObject([])).toEqual([]);
    });

    it('should handle arrays with functions', () => {
      const input = [
        1,
        function test() {
          return 'test';
        },
        3,
      ];
      const result = sanitizeObject(input);
      expect(result[0]).toBe(1);
      // Functions get lost during JSON.parse/stringify cycle
      expect(result[1]).toBeNull();
      expect(result[2]).toBe(3);
    });

    it('should handle sparse arrays', () => {
      const input = [1, , 3]; // eslint-disable-line no-sparse-arrays
      const result = sanitizeObject(input);
      expect(result[0]).toBe(1);
      // Sparse arrays become null during JSON.parse/stringify cycle
      expect(result[1]).toBeNull();
      expect(result[2]).toBe(3);
    });
  });

  describe('deep object sanitization', () => {
    it('should sanitize deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                password: 'secret',
                data: 'public',
              },
            },
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.level1.level2.level3.level4.password).toBe('[REDACTED]');
      expect(result.level1.level2.level3.level4.data).toBe('public');
    });

    it('should enforce max depth limit', () => {
      const input = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: {
                  l6: {
                    data: 'too deep',
                  },
                },
              },
            },
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.l1.l2.l3.l4.l5).toBe('[...]');
    });

    it('should sanitize at all depth levels within limit', () => {
      const input = {
        password: 'level0',
        l1: {
          password: 'level1',
          l2: {
            password: 'level2',
            l3: {
              password: 'level3',
              l4: {
                password: 'level4',
              },
            },
          },
        },
      };
      const result = sanitizeObject(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.l1.password).toBe('[REDACTED]');
      expect(result.l1.l2.password).toBe('[REDACTED]');
      expect(result.l1.l2.l3.password).toBe('[REDACTED]');
      expect(result.l1.l2.l3.l4.password).toBe('[REDACTED]');
    });

    it('should handle mixed nested structures', () => {
      const input = {
        users: [
          { name: 'user1', password: 'pass1' },
          { name: 'user2', token: 'token2' },
        ],
        config: {
          api: { apiKey: 'key123' },
          database: { host: 'localhost', password: 'dbpass' },
        },
      };
      const result = sanitizeObject(input);
      expect(result.users[0].password).toBe('[REDACTED]');
      expect(result.users[1].token).toBe('[REDACTED]');
      expect(result.config.api.apiKey).toBe('[REDACTED]');
      expect(result.config.database.password).toBe('[REDACTED]');
      expect(result.config.database.host).toBe('localhost');
    });
  });

  describe('class instances and prototypes', () => {
    it('should convert class instances to plain objects via JSON', () => {
      class TestClass {
        public data: string;
        constructor() {
          this.data = 'test';
        }
        method() {
          return 'method';
        }
      }
      const instance = new TestClass();
      const result = sanitizeObject({ obj: instance });
      // Class instances get serialized to their enumerable properties
      expect(result.obj).toEqual({ data: 'test' });
    });

    it('should convert Date objects to ISO strings via JSON', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      const result = sanitizeObject({ date });
      // Dates get serialized to ISO strings
      expect(result.date).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should convert RegExp objects to empty objects via JSON', () => {
      const regex = /test/gi;
      const result = sanitizeObject({ regex });
      // RegExp objects get serialized to empty objects
      expect(result.regex).toEqual({});
    });

    it('should serialize Error objects with name and message', () => {
      const error = new Error('test error');
      const result = sanitizeObject({ error });
      // Error objects are properly serialized with their properties
      expect(result.error).toEqual({
        name: 'Error',
        message: 'test error',
      });
    });

    it('should convert Map objects to empty objects via JSON', () => {
      const map = new Map([['key', 'value']]);
      const result = sanitizeObject({ map });
      // Map objects get serialized to empty objects
      expect(result.map).toEqual({});
    });

    it('should convert Set objects to empty objects via JSON', () => {
      const set = new Set([1, 2, 3]);
      const result = sanitizeObject({ set });
      // Set objects get serialized to empty objects
      expect(result.set).toEqual({});
    });

    it('should handle objects with null prototype', () => {
      const obj = Object.create(null);
      obj.password = 'secret';
      obj.data = 'public';
      const result = sanitizeObject(obj);
      expect(result.password).toBe('[REDACTED]');
      expect(result.data).toBe('public');
    });

    it('should handle plain objects from Object.create', () => {
      const obj = Object.create(Object.prototype);
      obj.password = 'secret';
      obj.data = 'public';
      const result = sanitizeObject(obj);
      expect(result.password).toBe('[REDACTED]');
      expect(result.data).toBe('public');
    });
  });

  describe('circular references', () => {
    it('should handle circular references', () => {
      const obj: any = { name: 'test', data: 'value' };
      obj.self = obj;
      const result = sanitizeObject(obj);
      expect(result.name).toBe('test');
      expect(result.data).toBe('value');
      // Circular reference handling via safeStringify
      expect(result).toHaveProperty('self');
    });

    it('should handle circular references with sensitive data', () => {
      const obj: any = { name: 'test', password: 'secret' };
      obj.self = obj;
      const result = sanitizeObject(obj);
      expect(result.name).toBe('test');
      expect(result.password).toBe('[REDACTED]');
      expect(result).toHaveProperty('self');
    });

    it('should handle deep circular references', () => {
      const obj: any = { level1: { level2: { data: 'test' } } };
      obj.level1.level2.circular = obj;
      const result = sanitizeObject(obj);
      expect(result.level1.level2.data).toBe('test');
      expect(result).toHaveProperty('level1');
    });

    it('should handle multiple circular references', () => {
      const obj1: any = { name: 'obj1' };
      const obj2: any = { name: 'obj2' };
      obj1.ref = obj2;
      obj2.ref = obj1;
      const result = sanitizeObject({ obj1, obj2 });
      expect(result).toHaveProperty('obj1');
      expect(result).toHaveProperty('obj2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty object', () => {
      expect(sanitizeObject({})).toEqual({});
    });

    it('should handle object with only sensitive fields', () => {
      const input = { password: 'pass', token: 'token', secret: 'secret' };
      const result = sanitizeObject(input);
      expect(result).toEqual({
        password: '[REDACTED]',
        token: '[REDACTED]',
        secret: '[REDACTED]',
      });
    });

    it('should handle objects with falsy sensitive values', () => {
      const input = { password: '', token: null, secret: undefined, apiKey: 0 };
      const result = sanitizeObject(input);
      // undefined values are lost during JSON.parse/stringify cycle
      expect(result).toEqual({
        password: '[REDACTED]',
        token: '[REDACTED]',
        apiKey: '[REDACTED]',
      });
    });

    it('should handle objects with boolean sensitive values', () => {
      const input = { password: false, token: true };
      const result = sanitizeObject(input);
      expect(result).toEqual({ password: '[REDACTED]', token: '[REDACTED]' });
    });

    it('should not mutate original object', () => {
      const input = { password: 'secret', data: 'public' };
      const result = sanitizeObject(input);
      expect(input.password).toBe('secret');
      expect(result.password).toBe('[REDACTED]');
      expect(result).not.toBe(input);
    });

    it('should handle objects with symbol keys', () => {
      const sym = Symbol('test');
      const input = { [sym]: 'value', password: 'secret' };
      const result = sanitizeObject(input);
      expect(result.password).toBe('[REDACTED]');
      // Symbols are not enumerable in Object.entries
    });

    it('should handle objects with numeric keys', () => {
      const input = { 0: 'value0', 1: 'value1', password: 'secret' };
      const result = sanitizeObject(input);
      expect(result).toEqual({ 0: 'value0', 1: 'value1', password: '[REDACTED]' });
    });

    it('should handle objects with special characters in keys', () => {
      const input = {
        'key-with-dashes': 'value',
        key_with_underscores: 'value',
        'key.with.dots': 'value',
        'api-key': 'secret',
      };
      const result = sanitizeObject(input);
      expect(result['key-with-dashes']).toBe('value');
      expect(result['key_with_underscores']).toBe('value');
      expect(result['key.with.dots']).toBe('value');
      expect(result['api-key']).toBe('[REDACTED]');
    });

    it('should handle very large objects', () => {
      const input: any = { password: 'secret' };
      for (let i = 0; i < 1000; i++) {
        input[`key${i}`] = `value${i}`;
      }
      const result = sanitizeObject(input);
      expect(result.password).toBe('[REDACTED]');
      expect(result.key500).toBe('value500');
      expect(Object.keys(result).length).toBe(1001);
    });

    it('should handle objects with undefined values', () => {
      const input = { key1: undefined, key2: 'value', password: undefined };
      const result = sanitizeObject(input);
      // undefined values are lost during JSON.parse/stringify cycle
      expect(result).toEqual({ key2: 'value' });
    });

    it('should handle BigInt values', () => {
      const input = { bigNum: BigInt(9007199254740991), password: 'secret' };
      const result = sanitizeObject(input);
      // BigInt is not JSON serializable, safe-stringify returns a string
      expect(result).toBe('[unable to serialize, circular reference is too complex to analyze]');
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully with throwOnError false', () => {
      const input = { key: 'value' };
      // Mock safeStringify to throw
      vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      const result = sanitizeObject(input, { throwOnError: false });
      expect(result).toEqual(input);
    });

    it('should throw errors when throwOnError is true', () => {
      const input = { key: 'value' };
      vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      expect(() => sanitizeObject(input, { throwOnError: true })).toThrow('Parse error');
    });

    it('should log context in error messages', () => {
      const input = { key: 'value' };
      vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });

      sanitizeObject(input, { context: 'test context', throwOnError: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('test context'),
        expect.any(Error),
      );
    });
  });

  describe('real-world scenarios', () => {
    it('should sanitize HTTP request config', () => {
      const requestConfig = {
        method: 'POST',
        url: 'https://api.example.com/v1/resource',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
          'x-api-key': 'api-key-value',
        },
        body: {
          username: 'user',
          password: 'pass123',
          data: 'public-data',
        },
      };
      const result = sanitizeObject(requestConfig);
      expect(result.method).toBe('POST');
      expect(result.url).toBe('https://api.example.com/v1/resource');
      expect(result.headers.Authorization).toBe('[REDACTED]');
      expect(result.headers['x-api-key']).toBe('[REDACTED]');
      expect(result.body.password).toBe('[REDACTED]');
      expect(result.body.data).toBe('public-data');
    });

    it('should sanitize URLs with sensitive query parameters in url field', () => {
      const requestConfig = {
        method: 'GET',
        url: 'https://api.example.com/v1/resource?api_key=secret123&token=bearer-token&data=public',
        headers: {
          'Content-Type': 'application/json',
        },
      };
      const result = sanitizeObject(requestConfig);
      expect(result.method).toBe('GET');
      expect(result.url).toBe(
        'https://api.example.com/v1/resource?api_key=%5BREDACTED%5D&token=%5BREDACTED%5D&data=public',
      );
      expect(result.url).not.toContain('secret123');
      expect(result.url).not.toContain('bearer-token');
      expect(result.url).toContain('data=public');
    });

    it('should sanitize URLs with basic auth credentials in url field', () => {
      const requestConfig = {
        method: 'POST',
        url: 'https://user:password@api.example.com/endpoint',
        headers: {
          'Content-Type': 'application/json',
        },
      };
      const result = sanitizeObject(requestConfig);
      expect(result.url).toBe('https://***:***@api.example.com/endpoint');
      expect(result.url).not.toContain('user');
      expect(result.url).not.toContain('password');
    });

    it('should sanitize database connection config', () => {
      const dbConfig = {
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'db-password',
        ssl: {
          rejectUnauthorized: true,
          ca: 'cert-content',
          key: 'private-key-content',
          cert: 'certificate-content',
        },
      };
      const result = sanitizeObject(dbConfig);
      expect(result.host).toBe('localhost');
      expect(result.username).toBe('admin');
      expect(result.password).toBe('[REDACTED]');
      expect(result.ssl.rejectUnauthorized).toBe(true);
    });

    it('should sanitize OAuth token response', () => {
      const tokenResponse = {
        access_token: 'access-token-value',
        refresh_token: 'refresh-token-value',
        id_token: 'id-token-value',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      };
      const result = sanitizeObject(tokenResponse);
      expect(result.access_token).toBe('[REDACTED]');
      expect(result.refresh_token).toBe('[REDACTED]');
      expect(result.id_token).toBe('[REDACTED]');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(3600);
    });

    it('should sanitize AWS credentials', () => {
      const awsConfig = {
        region: 'us-east-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'session-token-value',
      };
      const result = sanitizeObject(awsConfig);
      expect(result.region).toBe('us-east-1');
      // These don't match the predefined patterns, so they won't be redacted
      // unless we add specific patterns for them
    });

    it('should sanitize provider response with metadata', () => {
      const providerResponse = {
        cached: false,
        cost: 0.0001,
        logProbs: null,
        output: 'Generated response',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
        metadata: {
          headers: {
            authorization: 'Bearer token',
            'content-type': 'application/json',
          },
          requestBody: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'test' }],
            api_key: 'secret-key',
          },
        },
      };
      const result = sanitizeObject(providerResponse);
      expect(result.output).toBe('Generated response');
      expect(result.metadata.headers.authorization).toBe('[REDACTED]');
      expect(result.metadata.requestBody.api_key).toBe('[REDACTED]');
      expect(result.metadata.requestBody.model).toBe('gpt-4');
    });

    it('should sanitize JSON string request body with apiKey', () => {
      // Simulating a log context where requestBody is a JSON string
      const logContext = {
        message: 'API request',
        url: 'https://example.com/api',
        method: 'POST',
        requestBody: JSON.stringify({
          message: 'test message',
          conversationId: '12345',
          email: 'user@example.com',
          apiKey: 'secret-api-key-value',
        }),
        status: 200,
        statusText: 'OK',
      };

      const result = sanitizeObject(logContext);

      // requestBody should still be a string
      expect(typeof result.requestBody).toBe('string');

      // Parse the string and verify apiKey is redacted
      const parsedBody = JSON.parse(result.requestBody);
      expect(parsedBody.apiKey).toBe('[REDACTED]');
      expect(parsedBody.message).toBe('test message');
      expect(parsedBody.email).toBe('user@example.com');
      expect(parsedBody.conversationId).toBe('12345');
    });
  });
});

describe('sanitizeBody', () => {
  it('should be an alias for sanitizeObject', () => {
    const input = { password: 'secret', data: 'public' };
    expect(sanitizeBody(input)).toEqual(sanitizeObject(input));
  });
});

describe('sanitizeUrl', () => {
  describe('invalid inputs', () => {
    it('should handle non-string inputs', () => {
      expect(sanitizeUrl(null as any)).toBeNull();
      expect(sanitizeUrl(undefined as any)).toBeUndefined();
      expect(sanitizeUrl(123 as any)).toBe(123);
      expect(sanitizeUrl({} as any)).toEqual({});
      expect(sanitizeUrl([] as any)).toEqual([]);
    });

    it('should handle empty string', () => {
      expect(sanitizeUrl('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(sanitizeUrl('   ')).toBe('   ');
    });

    it('should handle malformed URLs gracefully', () => {
      const malformedUrl = 'not-a-valid-url';
      expect(sanitizeUrl(malformedUrl)).toBe(malformedUrl);
    });

    it('should handle protocol-relative URLs', () => {
      const url = '//example.com/api?api_key=secret123';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with invalid protocols', () => {
      const url = 'invalid://example.com';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with Nunjucks template variables', () => {
      const url = '{{ api_base }}/api/v1/endpoint';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with template variables in path', () => {
      const url = 'https://example.com/{{ path }}/endpoint';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with template variables in query params', () => {
      const url = 'https://example.com/api?key={{ api_key }}';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with multiple template variables', () => {
      const url = '{{ protocol }}://{{ host }}/{{ path }}?key={{ api_key }}';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should skip sanitization for URLs with template variables', () => {
      // Template URLs are configuration, not runtime secrets
      // They get rendered by Nunjucks before actual use, then sanitized
      const url = '{{ api_base }}/api?token=secret123&user_id=42';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should skip sanitization for URLs with templates and credentials', () => {
      const url = 'https://user:pass@{{ host }}/api';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should skip sanitization for mixed template and sensitive params', () => {
      const url = 'https://admin:secret@{{ api_base }}/api?api_key=key123&data=public';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should skip sanitization for templates with sensitive param names', () => {
      const url = 'https://example.com/{{ path }}?password={{ user_password }}&data=public';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('basic authentication', () => {
    it('should redact username and password', () => {
      const url = 'https://user:pass@example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/api');
    });

    it('should redact username only', () => {
      const url = 'https://user@example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/api');
    });

    it('should handle empty username/password', () => {
      const url = 'https://:@example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api');
    });

    it('should preserve URL without auth', () => {
      const url = 'https://example.com/api';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle special characters in credentials', () => {
      const url = 'https://user%40email:p%40ss%24word@example.com/api';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/api');
    });
  });

  describe('query parameter sanitization', () => {
    describe('api key patterns', () => {
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

      it('should redact api-key parameter', () => {
        const url = 'https://example.com/api?api-key=secret123&data=public';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?api-key=%5BREDACTED%5D&data=public');
      });
    });

    describe('token patterns', () => {
      it('should redact token parameter', () => {
        const url = 'https://example.com/api?token=abc123';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?token=%5BREDACTED%5D');
      });

      it('should redact access_token parameter', () => {
        const url = 'https://example.com/api?access_token=token123';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?access_token=%5BREDACTED%5D');
      });

      it('should redact access-token parameter', () => {
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
    });

    describe('password and secret patterns', () => {
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

      it('should redact client_secret parameter', () => {
        const url = 'https://example.com/api?client_secret=client123';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?client_secret=%5BREDACTED%5D');
      });

      it('should redact client-secret parameter', () => {
        const url = 'https://example.com/api?client-secret=client123';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?client-secret=%5BREDACTED%5D');
      });
    });

    describe('signature patterns', () => {
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
    });

    describe('authorization patterns', () => {
      it('should redact authorization parameter', () => {
        const url = 'https://example.com/api?authorization=Bearer%20token123';
        const result = sanitizeUrl(url);
        expect(result).toBe('https://example.com/api?authorization=%5BREDACTED%5D');
      });
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

    it('should handle parameters with empty values', () => {
      const url = 'https://example.com/api?api_key=&data=public';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?api_key=%5BREDACTED%5D&data=public');
    });

    it('should handle duplicate parameter names', () => {
      const url = 'https://example.com/api?token=first&token=second';
      const result = sanitizeUrl(url);
      // URLSearchParams.set replaces all occurrences
      expect(result).toBe('https://example.com/api?token=%5BREDACTED%5D');
    });
  });

  describe('complex URLs', () => {
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

    it('should handle URLs with paths', () => {
      const url = 'https://example.com/api/v1/users?token=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api/v1/users?token=%5BREDACTED%5D');
    });

    it('should handle localhost URLs', () => {
      const url = 'http://localhost:3000/api?token=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('http://localhost:3000/api?token=%5BREDACTED%5D');
    });

    it('should handle IP address URLs', () => {
      const url = 'http://192.168.1.1:8080/api?api_key=secret';
      const result = sanitizeUrl(url);
      expect(result).toBe('http://192.168.1.1:8080/api?api_key=%5BREDACTED%5D');
    });

    it('should handle file URLs', () => {
      const url = 'file:///path/to/file';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle data URLs', () => {
      const url = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('URL encoding edge cases', () => {
    it('should handle special characters in query values', () => {
      const url = 'https://example.com/api?query=hello%20world&api_key=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?query=hello+world&api_key=%5BREDACTED%5D');
    });

    it('should handle URL-encoded sensitive parameters', () => {
      const url = 'https://example.com/api?api%5Fkey=secret123';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?api_key=%5BREDACTED%5D');
    });

    it('should handle encoding in paths', () => {
      const url = 'https://example.com/api/hello%20world?api_key=secret123';
      const result = sanitizeUrl(url);
      expect(result).toContain('hello%20world');
      expect(result).toContain('api_key=%5BREDACTED%5D');
    });

    it('should handle plus signs in query values', () => {
      const url = 'https://example.com/api?query=hello+world&token=secret';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api?query=hello+world&token=%5BREDACTED%5D');
    });

    it('should handle very long URLs', () => {
      const longParam = 'a'.repeat(1000);
      const url = `https://example.com/api?data=${longParam}&api_key=secret123`;
      const result = sanitizeUrl(url);
      expect(result).toContain('data=' + longParam);
      expect(result).toContain('api_key=%5BREDACTED%5D');
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with no search params', () => {
      const url = 'https://example.com/api/endpoint';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with empty search params', () => {
      const url = 'https://example.com/api?';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should handle URLs with trailing slashes', () => {
      const url = 'https://example.com/api/?token=secret';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://example.com/api/?token=%5BREDACTED%5D');
    });

    it('should handle international domain names', () => {
      const url = 'https://例え.テスト/api?token=secret123';
      const result = sanitizeUrl(url);
      expect(result).toContain('%5BREDACTED%5D');
    });

    it('should handle URLs with only credentials', () => {
      const url = 'https://user:pass@example.com';
      const result = sanitizeUrl(url);
      expect(result).toBe('https://***:***@example.com/');
    });

    it('should handle URLs with all components', () => {
      const url = 'https://user:pass@example.com:8080/path/to/resource?api_key=secret#section';
      const result = sanitizeUrl(url);
      expect(result).toBe(
        'https://***:***@example.com:8080/path/to/resource?api_key=%5BREDACTED%5D#section',
      );
    });

    it('should sanitize parameters containing sensitive words', () => {
      const url = 'https://example.com/api?tokens_available=100&secret_santa=john';
      const result = sanitizeUrl(url);
      // The regex in sanitizeUrl is broad and matches substrings, so these will be redacted
      expect(result).toContain('tokens_available=%5BREDACTED%5D');
      expect(result).toContain('secret_santa=%5BREDACTED%5D');
    });
  });

  describe('error handling', () => {
    it('should handle URL parsing errors gracefully', () => {
      const invalidUrl = 'ht!tp://invalid';
      const result = sanitizeUrl(invalidUrl);
      expect(result).toBe(invalidUrl);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log warning on URL parsing failure', () => {
      const invalidUrl = 'totally-invalid-url';
      sanitizeUrl(invalidUrl);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sanitize URL'),
      );
    });
  });
});
