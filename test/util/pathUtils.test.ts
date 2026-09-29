import { pathToFileURL } from 'node:url';
import path from 'path';

import { describe, expect, it } from 'vitest';
import { fileReferenceToPath, safeJoin, safeResolve } from '../../src/util/pathUtils';

/**
 * Helper to create file:// URLs in a cross-platform way
 */
function getFileUrl(path: string): string {
  return process.platform === 'win32'
    ? `file:///C:/${path.replace(/\\/g, '/')}`
    : `file:///${path}`;
}

describe('pathUtils', () => {
  describe('fileReferenceToPath', () => {
    it.each(['file://vars/*.yaml', 'vars/*.yaml', 'file://vars%20name.yaml'])(
      'preserves relative shorthand and globs: %s',
      (reference) => {
        expect(fileReferenceToPath(reference)).toBe(reference.replace(/^file:\/\//, ''));
      },
    );

    it.each(['vars with spaces.yaml', 'vars%20name.yaml', 'vars?.yaml', 'vars#1.yaml'])(
      'decodes canonical file URLs once: %s',
      (filename) => {
        const absolutePath = path.resolve('/base', filename);
        expect(fileReferenceToPath(pathToFileURL(absolutePath).href)).toBe(absolutePath);
      },
    );

    it('accepts localhost file URLs and preserves literal glob syntax', () => {
      const absolutePath = path.resolve('/base', 'vars?.yaml');
      const reference = pathToFileURL(absolutePath)
        .href.replace('file:///', 'file://localhost/')
        .replace('%3F', '?');
      expect(fileReferenceToPath(reference)).toBe(absolutePath);
    });
  });

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
});
