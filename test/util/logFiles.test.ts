import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogFiles } from '../../src/util/logFiles';

vi.mock('fs');

// Helper to create mock Dirent objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDirent(name: string, isFile: boolean = true): any {
  return {
    name,
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '/logs',
    path: '/logs',
  };
}

describe('logFiles utilities', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLogFiles', () => {
    it('should return empty array if directory does not exist', () => {
      const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw error;
      });

      const result = getLogFiles('/nonexistent/path');

      expect(result).toEqual([]);
    });

    it('should return empty array if directory has no log files', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        createDirent('readme.txt'),
        createDirent('config.json'),
      ]);

      const result = getLogFiles('/logs');

      expect(result).toEqual([]);
    });

    it('should return log files sorted by modification time (newest first)', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        createDirent('promptfoo-debug-2024-01-01.log'),
        createDirent('promptfoo-error-2024-01-02.log'),
        createDirent('promptfoo-debug-2024-01-03.log'),
      ]);

      const dates = {
        'promptfoo-debug-2024-01-01.log': new Date('2024-01-01'),
        'promptfoo-error-2024-01-02.log': new Date('2024-01-02'),
        'promptfoo-debug-2024-01-03.log': new Date('2024-01-03'),
      };

      vi.mocked(fs.statSync).mockImplementation((filePath: unknown) => {
        const fileName = path.basename(filePath as string);
        return { mtime: dates[fileName as keyof typeof dates] } as fs.Stats;
      });

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('promptfoo-debug-2024-01-03.log');
      expect(result[1].name).toBe('promptfoo-error-2024-01-02.log');
      expect(result[2].name).toBe('promptfoo-debug-2024-01-01.log');
    });

    it('should filter files by promptfoo prefix and .log suffix', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        createDirent('promptfoo-debug.log'),
        createDirent('other-debug.log'),
        createDirent('promptfoo-error.txt'),
        createDirent('promptfoo.log'),
        createDirent('readme.md'),
      ]);

      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('promptfoo-debug.log');
    });

    it('should filter out directories', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        createDirent('promptfoo-debug.log', true),
        createDirent('promptfoo-subdir.log', false), // This is a directory
      ]);

      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('promptfoo-debug.log');
    });

    it('should include correct path in returned objects', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([createDirent('promptfoo-test.log')]);
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);

      const result = getLogFiles('/my/log/dir');

      expect(result[0].path).toBe(path.join('/my/log/dir', 'promptfoo-test.log'));
    });

    it('should throw error if directory cannot be read (non-ENOENT)', () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw error;
      });

      expect(() => getLogFiles('/protected/logs')).toThrow('Permission denied');
    });

    it('should skip files that are deleted between readdir and stat (race condition)', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        createDirent('promptfoo-exists.log'),
        createDirent('promptfoo-deleted.log'),
        createDirent('promptfoo-also-exists.log'),
      ]);

      vi.mocked(fs.statSync).mockImplementation((filePath: unknown) => {
        if ((filePath as string).includes('deleted')) {
          const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        }
        return { mtime: new Date() } as fs.Stats;
      });

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toContain('promptfoo-exists.log');
      expect(result.map((f) => f.name)).toContain('promptfoo-also-exists.log');
      expect(result.map((f) => f.name)).not.toContain('promptfoo-deleted.log');
    });

    it('should rethrow non-ENOENT errors from statSync', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([createDirent('promptfoo-test.log')]);

      vi.mocked(fs.statSync).mockImplementation(() => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      });

      expect(() => getLogFiles('/logs')).toThrow('Permission denied');
    });

    it('should return files with correct mtime', () => {
      const testDate = new Date('2024-06-15T10:30:00Z');
      vi.mocked(fs.readdirSync).mockReturnValue([createDirent('promptfoo-test.log')]);
      vi.mocked(fs.statSync).mockReturnValue({ mtime: testDate } as fs.Stats);

      const result = getLogFiles('/logs');

      expect(result[0].mtime).toEqual(testDate);
    });
  });
});
