/**
 * Tests for git diff --raw -z parser
 *
 * These tests verify correct handling of renamed and copied files
 */

import { describe, expect, it } from 'vitest';
import { parseRawDiff } from '../../../src/codeScan/git/rawDiffParser';

describe('parseRawDiff', () => {
  describe('basic file operations', () => {
    it('should parse modified files correctly', () => {
      const rawOutput = ':100644 100644 abc123 def456 M\0src/file.ts\0';

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/file.ts',
        status: 'M',
        shaA: 'abc123',
        shaB: 'def456',
      });
    });

    it('should parse added files correctly', () => {
      const rawOutput =
        ':000000 100644 0000000000000000000000000000000000000000 abc123 A\0src/new.ts\0';

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/new.ts',
        status: 'A',
        shaA: null,
        shaB: 'abc123',
      });
    });

    it('should parse deleted files correctly', () => {
      const rawOutput =
        ':100644 000000 abc123 0000000000000000000000000000000000000000 D\0src/old.ts\0';

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'src/old.ts',
        status: 'D',
        shaA: 'abc123',
        shaB: null,
      });
    });

    it('should parse multiple regular files correctly', () => {
      const rawOutput = [
        ':100644 100644 abc123 def456 M',
        'file1.ts',
        ':100644 100644 111111 222222 M',
        'file2.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('file1.ts');
      expect(result[0].status).toBe('M');
      expect(result[1].path).toBe('file2.ts');
      expect(result[1].status).toBe('M');
    });
  });

  describe('renamed files', () => {
    it('should parse renamed file and use NEW path', () => {
      // Git diff --raw -z output for a renamed file has TWO paths
      // Format: :oldmode newmode oldsha newsha status\0oldpath\0newpath\0
      const rawOutput = [
        ':100644 100644 abc123 def456 R100',
        'old/path/file.ts',
        'new/path/file.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('new/path/file.ts'); // Should use NEW path
      expect(result[0].oldPath).toBe('old/path/file.ts'); // Should preserve old path
      expect(result[0].status).toBe('R100');
      expect(result[0].shaA).toBe('abc123');
      expect(result[0].shaB).toBe('def456');
    });

    it('should parse renamed file with similarity score', () => {
      const rawOutput = [':100644 100644 aaa111 aaa222 R90', 'old.ts', 'new.ts', ''].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('new.ts'); // NEW path
      expect(result[0].oldPath).toBe('old.ts'); // OLD path preserved
      expect(result[0].status).toBe('R90');
    });

    it('should handle rename followed by other files', () => {
      // Multiple files: rename followed by a modify
      const rawOutput = [
        ':100644 100644 aaa111 aaa222 R90',
        'old.ts',
        'new.ts',
        ':100644 100644 bbb111 bbb222 M',
        'modified.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      // Should get both files correctly
      expect(result).toHaveLength(2);

      // First file: renamed
      expect(result[0].path).toBe('new.ts'); // NEW path
      expect(result[0].oldPath).toBe('old.ts'); // OLD path preserved
      expect(result[0].status).toBe('R90');

      // Second file: modified (parser should not be misaligned)
      expect(result[1].path).toBe('modified.ts');
      expect(result[1].status).toBe('M');
    });
  });

  describe('copied files', () => {
    it('should parse copied file and use destination path', () => {
      // Git diff --raw -z output for a copied file also has TWO paths
      // Format: :oldmode newmode oldsha newsha status\0sourcepath\0destpath\0
      const rawOutput = [
        ':100644 100644 abc123 abc123 C100',
        'src/original.ts',
        'src/copy.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/copy.ts'); // Should use DESTINATION path
      expect(result[0].oldPath).toBe('src/original.ts'); // Should preserve source path
      expect(result[0].status).toBe('C100');
      expect(result[0].shaA).toBe('abc123');
      expect(result[0].shaB).toBe('abc123');
    });

    it('should handle copy followed by other files', () => {
      const rawOutput = [
        ':100644 100644 abc123 abc123 C100',
        'original.ts',
        'copy.ts',
        ':100644 100644 def456 ghi789 M',
        'other.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(2);

      // First file: copied
      expect(result[0].path).toBe('copy.ts'); // DESTINATION
      expect(result[0].oldPath).toBe('original.ts'); // SOURCE
      expect(result[0].status).toBe('C100');

      // Second file: modified
      expect(result[1].path).toBe('other.ts');
      expect(result[1].status).toBe('M');
    });
  });

  describe('mixed operations', () => {
    it('should handle mix of rename, add, modify, delete', () => {
      const rawOutput = [
        ':100644 100644 aaa111 aaa222 R90',
        'old.ts',
        'new.ts',
        ':000000 100644 000000 bbb111 A',
        'added.ts',
        ':100644 100644 ccc111 ccc222 M',
        'modified.ts',
        ':100644 000000 ddd111 000000 D',
        'deleted.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      expect(result).toHaveLength(4);

      // Renamed file
      expect(result[0].path).toBe('new.ts');
      expect(result[0].oldPath).toBe('old.ts');
      expect(result[0].status).toBe('R90');

      // Added file
      expect(result[1].path).toBe('added.ts');
      expect(result[1].status).toBe('A');

      // Modified file
      expect(result[2].path).toBe('modified.ts');
      expect(result[2].status).toBe('M');

      // Deleted file
      expect(result[3].path).toBe('deleted.ts');
      expect(result[3].status).toBe('D');
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parseRawDiff('');
      expect(result).toHaveLength(0);
    });

    it('should skip malformed entries', () => {
      const rawOutput = [
        ':100644 100644 abc123 def456 M',
        'valid.ts',
        ':invalid',
        'missing-metadata.ts',
        '',
      ].join('\0');

      const result = parseRawDiff(rawOutput);

      // Should only get the valid entry
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('valid.ts');
    });
  });
});
