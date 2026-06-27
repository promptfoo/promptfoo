import path from 'path';
import { pathToFileURL } from 'url';

import { describe, expect, it } from 'vitest';
import {
  redactPathFromText,
  redactPathsAndIdentifierFromText,
  safeJoin,
  safeResolve,
} from '../../src/util/pathUtils';

/**
 * Helper to create file:// URLs in a cross-platform way
 */
function getFileUrl(path: string): string {
  return process.platform === 'win32'
    ? `file:///C:/${path.replace(/\\/g, '/')}`
    : `file:///${path}`;
}

describe('pathUtils', () => {
  describe('safeResolve', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeResolve('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('returns Windows file URL unchanged', () => {
      const windowsFileUrl = 'file://C:/path/file.txt';
      expect(safeResolve('some/base/path', windowsFileUrl)).toBe(windowsFileUrl);
    });

    it('returns HTTP URLs unchanged', () => {
      const httpUrl = 'https://example.com/file.txt';
      expect(safeResolve('some/base/path', httpUrl)).toBe(httpUrl);
    });

    it('resolves relative paths', () => {
      const expected = path.resolve('base/path', 'relative/file.txt');
      expect(safeResolve('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeResolve('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.resolve('base', 'path', 'relative/file.txt');
      expect(safeResolve('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeResolve()).toBe(path.resolve());
      expect(safeResolve('')).toBe(path.resolve(''));
    });
  });

  describe('safeJoin', () => {
    it('returns absolute path unchanged', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('some/base/path', absolutePath)).toBe(absolutePath);
    });

    it('returns file URL unchanged', () => {
      const fileUrl = getFileUrl('absolute/path/file.txt');
      expect(safeJoin('some/base/path', fileUrl)).toBe(fileUrl);
    });

    it('returns Windows file URL unchanged', () => {
      const windowsFileUrl = 'file://C:/path/file.txt';
      expect(safeJoin('some/base/path', windowsFileUrl)).toBe(windowsFileUrl);
    });

    it('returns HTTP URLs unchanged', () => {
      const httpUrl = 'https://example.com/file.txt';
      expect(safeJoin('some/base/path', httpUrl)).toBe(httpUrl);
    });

    it('joins relative paths', () => {
      const expected = path.join('base/path', 'relative/file.txt');
      expect(safeJoin('base/path', 'relative/file.txt')).toBe(expected);
    });

    it('handles multiple path segments', () => {
      const absolutePath = path.resolve('/absolute/path/file.txt');
      expect(safeJoin('base', 'path', absolutePath)).toBe(absolutePath);

      const expected = path.join('base', 'path', 'relative/file.txt');
      expect(safeJoin('base', 'path', 'relative/file.txt')).toBe(expected);
    });

    it('handles empty input', () => {
      expect(safeJoin()).toBe(path.join());
      expect(safeJoin('')).toBe(path.join(''));
    });
  });

  describe('redactPathFromText', () => {
    it('redacts exact absolute, directory, basename, and file URL path forms', () => {
      const filePath = path.resolve('/private/PR8237_SECRET/schema.py');
      const directory = path.dirname(filePath);
      const basename = path.basename(filePath);
      const fileUrl = pathToFileURL(filePath).toString();
      const text = [
        `absolute=${filePath}`,
        `directory=${directory}`,
        `basename=${basename}`,
        `url=${fileUrl}:12`,
        'neighbor=/public/other.py',
      ].join('\n');

      const redacted = redactPathFromText(text, filePath, '[private path]');

      expect(redacted).not.toContain('PR8237_SECRET');
      expect(redacted).not.toContain(basename);
      expect(redacted).toContain('[private path]');
      expect(redacted).toContain('neighbor=/public/other.py');
    });

    it('redacts atomically without corrupting diagnostics or expanding replacement text', () => {
      const filePath = '/r/e/d/a/c/t/p/h/schema.py';
      const text = `Cannot parse schema at ${filePath}; ${filePath} is invalid`;

      const redacted = redactPathFromText(text, filePath, '[redacted schema path]');

      expect(redacted).toBe(
        'Cannot parse schema at [redacted schema path]; [redacted schema path] is invalid',
      );
      expect(redacted.length).toBeLessThan(text.length + 40);
    });

    it('escapes regular-expression characters in path forms', () => {
      const filePath = '/private/a+b/schema[1].json';

      expect(redactPathFromText(`Failed at ${filePath}`, filePath)).toBe(
        'Failed at [redacted path]',
      );
    });

    it('redacts paths and short identifiers atomically', () => {
      const filePath = '/private/a/schema.py';

      expect(
        redactPathsAndIdentifierFromText(
          `Cannot call a at ${filePath}`,
          [filePath],
          'a',
          '[private path]',
          '[private method]',
        ),
      ).toBe('Cannot call [private method] at [private path]');
    });

    it('does not replace a short basename inside unrelated words', () => {
      expect(redactPathFromText('Cannot parse a at /private/a', '/private/a')).toBe(
        'Cannot parse a at [redacted path]',
      );
    });

    it('does not replace root separators or unrelated text', () => {
      expect(redactPathFromText('safe / neighboring text', '/schema.py')).toBe(
        'safe / neighboring text',
      );
    });
  });
});
