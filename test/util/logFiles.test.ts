import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogFiles } from '../../src/util/logFiles';

vi.mock('fs');

describe('logFiles utilities', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLogFiles', () => {
    it('should return empty array if directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getLogFiles('/nonexistent/path');

      expect(result).toEqual([]);
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('should return empty array if directory has no log files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.txt', 'config.json'] as any);

      const result = getLogFiles('/logs');

      expect(result).toEqual([]);
    });

    it('should return log files sorted by modification time (newest first)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'promptfoo-debug-2024-01-01.log',
        'promptfoo-error-2024-01-02.log',
        'promptfoo-debug-2024-01-03.log',
      ] as any);

      const dates = {
        'promptfoo-debug-2024-01-01.log': new Date('2024-01-01'),
        'promptfoo-error-2024-01-02.log': new Date('2024-01-02'),
        'promptfoo-debug-2024-01-03.log': new Date('2024-01-03'),
      };

      vi.mocked(fs.statSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(filePath);
        return { mtime: dates[fileName as keyof typeof dates] } as fs.Stats;
      });

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('promptfoo-debug-2024-01-03.log');
      expect(result[1].name).toBe('promptfoo-error-2024-01-02.log');
      expect(result[2].name).toBe('promptfoo-debug-2024-01-01.log');
    });

    it('should filter files by promptfoo prefix and .log suffix', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'promptfoo-debug.log',
        'other-debug.log',
        'promptfoo-error.txt',
        'promptfoo.log',
        'readme.md',
      ] as any);

      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('promptfoo-debug.log');
    });

    it('should include correct path in returned objects', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['promptfoo-test.log'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);

      const result = getLogFiles('/my/log/dir');

      expect(result[0].path).toBe(path.join('/my/log/dir', 'promptfoo-test.log'));
    });

    it('should throw error if directory cannot be read', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => getLogFiles('/protected/logs')).toThrow('Permission denied');
    });

    it('should skip files that are deleted between readdir and stat (race condition)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'promptfoo-exists.log',
        'promptfoo-deleted.log',
        'promptfoo-also-exists.log',
      ] as any);

      vi.mocked(fs.statSync).mockImplementation((filePath: any) => {
        if (filePath.includes('deleted')) {
          throw new Error('ENOENT: no such file or directory');
        }
        return { mtime: new Date() } as fs.Stats;
      });

      const result = getLogFiles('/logs');

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toContain('promptfoo-exists.log');
      expect(result.map((f) => f.name)).toContain('promptfoo-also-exists.log');
      expect(result.map((f) => f.name)).not.toContain('promptfoo-deleted.log');
    });

    it('should return files with correct mtime', () => {
      const testDate = new Date('2024-06-15T10:30:00Z');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['promptfoo-test.log'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtime: testDate } as fs.Stats);

      const result = getLogFiles('/logs');

      expect(result[0].mtime).toEqual(testDate);
    });
  });
});
