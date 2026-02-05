import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../../../src/commands/mcp/lib/errors';
import { validateFilePath, validateProviderId } from '../../../../src/commands/mcp/lib/security';
import { escapeRegExp } from '../../../../src/util/text';

describe('MCP Security', () => {
  describe('validateFilePath', () => {
    it('should allow simple relative paths', () => {
      expect(() => validateFilePath('output.yaml')).not.toThrow();
      expect(() => validateFilePath('data/results.json')).not.toThrow();
      expect(() => validateFilePath('my-file.txt')).not.toThrow();
    });

    it('should reject paths containing ".."', () => {
      expect(() => validateFilePath('../etc/passwd')).toThrow(ConfigurationError);
      expect(() => validateFilePath('foo/../bar')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/tmp/../etc/passwd')).toThrow(ConfigurationError);
    });

    it('should reject paths containing "~"', () => {
      expect(() => validateFilePath('~/.ssh/id_rsa')).toThrow(ConfigurationError);
      expect(() => validateFilePath('~/Documents/file.txt')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform === 'win32')('should reject paths to system directories', () => {
      // Unix paths are only recognized as absolute on Unix systems
      expect(() => validateFilePath('/etc/passwd')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/sys/kernel')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/proc/self/environ')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/dev/null')).toThrow(ConfigurationError);
      expect(() => validateFilePath('/var/run/docker.sock')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform !== 'win32')('should reject Windows system directories', () => {
      // Windows paths are only recognized as absolute on Windows
      expect(() => validateFilePath('C:\\Windows\\System32\\config')).toThrow(ConfigurationError);
      expect(() => validateFilePath('C:\\Program Files\\app')).toThrow(ConfigurationError);
      expect(() => validateFilePath('C:\\ProgramData\\secret')).toThrow(ConfigurationError);
    });

    it.skipIf(process.platform === 'win32')(
      'should allow absolute paths to non-system directories',
      () => {
        // Unix paths are only recognized as absolute on Unix systems
        expect(() => validateFilePath('/tmp/output.yaml')).not.toThrow();
        expect(() => validateFilePath('/home/user/data.json')).not.toThrow();
        expect(() => validateFilePath('/Users/test/file.txt')).not.toThrow();
      },
    );

    describe('with basePath', () => {
      it('should allow paths within the base directory', () => {
        expect(() => validateFilePath('output.yaml', '/tmp/workdir')).not.toThrow();
        expect(() => validateFilePath('subdir/file.txt', '/tmp/workdir')).not.toThrow();
      });

      it('should reject paths that escape the base directory', () => {
        // Note: ".." is caught by the pre-normalization check
        expect(() => validateFilePath('../escape.txt', '/tmp/workdir')).toThrow(ConfigurationError);
      });
    });

    it('should include the original path in the error details', () => {
      try {
        validateFilePath('../etc/passwd');
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).details).toEqual({ configPath: '../etc/passwd' });
      }
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegExp('hello.world')).toBe('hello\\.world');
      expect(escapeRegExp('foo*bar')).toBe('foo\\*bar');
      expect(escapeRegExp('a+b')).toBe('a\\+b');
      expect(escapeRegExp('test?')).toBe('test\\?');
      expect(escapeRegExp('^start')).toBe('\\^start');
      expect(escapeRegExp('end$')).toBe('end\\$');
    });

    it('should escape brackets and braces', () => {
      expect(escapeRegExp('[abc]')).toBe('\\[abc\\]');
      expect(escapeRegExp('{1,3}')).toBe('\\{1,3\\}');
      expect(escapeRegExp('(group)')).toBe('\\(group\\)');
    });

    it('should escape pipe and backslash', () => {
      expect(escapeRegExp('a|b')).toBe('a\\|b');
      expect(escapeRegExp('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should return strings without special chars unchanged', () => {
      expect(escapeRegExp('hello')).toBe('hello');
      expect(escapeRegExp('openai:gpt-4')).toBe('openai:gpt-4');
      expect(escapeRegExp('simple_test')).toBe('simple_test');
    });

    it('should handle empty strings', () => {
      expect(escapeRegExp('')).toBe('');
    });

    it('should produce strings safe for regex construction', () => {
      const userInput = 'openai:gpt-4.0';
      const escaped = escapeRegExp(userInput);
      const regex = new RegExp(escaped);
      expect(regex.test('openai:gpt-4.0')).toBe(true);
      expect(regex.test('openai:gpt-4X0')).toBe(false); // "." should not match any char
    });
  });

  describe('validateProviderId', () => {
    it('should accept valid provider:model format', () => {
      expect(() => validateProviderId('openai:gpt-4')).not.toThrow();
      expect(() => validateProviderId('anthropic:claude-3')).not.toThrow();
      expect(() => validateProviderId('azure:gpt-4o')).not.toThrow();
    });

    it('should accept file path providers', () => {
      expect(() => validateProviderId('providers/custom.js')).not.toThrow();
      expect(() => validateProviderId('my-provider.ts')).not.toThrow();
      expect(() => validateProviderId('script.py')).not.toThrow();
      expect(() => validateProviderId('module.mjs')).not.toThrow();
    });

    it('should accept HTTP providers', () => {
      expect(() => validateProviderId('http://localhost:8080/api')).not.toThrow();
      expect(() => validateProviderId('https://api.example.com/v1')).not.toThrow();
    });

    it('should reject invalid formats', () => {
      expect(() => validateProviderId('invalid')).toThrow(ConfigurationError);
      expect(() => validateProviderId('')).toThrow(ConfigurationError);
    });
  });
});
