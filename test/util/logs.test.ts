import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock dependencies before importing the module under test
vi.mock('fs');
vi.mock('../../src/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockGetConfigDirectoryPath = vi.fn().mockReturnValue('/home/user/.promptfoo');
vi.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: () => mockGetConfigDirectoryPath(),
}));

const mockGetEnvString = vi.fn().mockReturnValue('');
vi.mock('../../src/envars', () => ({
  getEnvString: (key: string) => mockGetEnvString(key),
  getEnvBool: vi.fn().mockReturnValue(false),
}));

// Import after mocks are set up
import { findLogFile, formatFileSize, getLogDirectory, getLogFiles } from '../../src/util/logs';

describe('util/logs', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigDirectoryPath.mockReturnValue('/home/user/.promptfoo');
    mockGetEnvString.mockReturnValue('');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getLogDirectory', () => {
    it('returns default directory when PROMPTFOO_LOG_DIR not set', () => {
      mockGetEnvString.mockReturnValue('');

      const result = getLogDirectory();
      expect(result).toBe(path.join('/home/user/.promptfoo', 'logs'));
    });

    it('respects PROMPTFOO_LOG_DIR environment variable', () => {
      mockGetEnvString.mockReturnValue('/custom/log/dir');

      const result = getLogDirectory();
      expect(result).toBe(path.resolve('/custom/log/dir'));
    });
  });

  describe('getLogFiles', () => {
    beforeEach(() => {
      mockGetEnvString.mockReturnValue('');
    });

    it('returns empty array when directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = getLogFiles();
      expect(result).toEqual([]);
    });

    it('returns empty array when no log files found', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);

      const result = getLogFiles();
      expect(result).toEqual([]);
    });

    it('filters non-promptfoo files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'other-file.log',
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'readme.txt',
      ] as any);
      mockFs.statSync.mockReturnValue({
        mtime: new Date('2024-01-01T10:00:00Z'),
        size: 1024,
      } as fs.Stats);

      const result = getLogFiles();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('promptfoo-debug-2024-01-01_10-00-00.log');
    });

    it('filters by type when specified', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'promptfoo-error-2024-01-01_10-00-00.log',
      ] as any);
      mockFs.statSync.mockReturnValue({
        mtime: new Date('2024-01-01T10:00:00Z'),
        size: 1024,
      } as fs.Stats);

      const debugFiles = getLogFiles('debug');
      expect(debugFiles).toHaveLength(1);
      expect(debugFiles[0].type).toBe('debug');

      const errorFiles = getLogFiles('error');
      expect(errorFiles).toHaveLength(1);
      expect(errorFiles[0].type).toBe('error');

      const allFiles = getLogFiles('all');
      expect(allFiles).toHaveLength(2);
    });

    it('sorts by modification time (newest first)', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'promptfoo-debug-2024-01-02_10-00-00.log',
      ] as any);

      const dates = [new Date('2024-01-01T10:00:00Z'), new Date('2024-01-02T10:00:00Z')];
      let callIndex = 0;
      mockFs.statSync.mockImplementation(
        () =>
          ({
            mtime: dates[callIndex++ % 2],
            size: 1024,
          }) as fs.Stats,
      );

      const result = getLogFiles();

      expect(result).toHaveLength(2);
      // Newest should be first
      expect(result[0].mtime.getTime()).toBeGreaterThanOrEqual(result[1].mtime.getTime());
    });

    it('correctly identifies log types', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'promptfoo-error-2024-01-01_10-00-00.log',
      ] as any);
      mockFs.statSync.mockReturnValue({
        mtime: new Date('2024-01-01T10:00:00Z'),
        size: 1024,
      } as fs.Stats);

      const result = getLogFiles('all');

      const debugFile = result.find((f) => f.name.includes('-debug-'));
      const errorFile = result.find((f) => f.name.includes('-error-'));

      expect(debugFile?.type).toBe('debug');
      expect(errorFile?.type).toBe('error');
    });
  });

  describe('findLogFile', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockGetEnvString.mockReturnValue('');
    });

    it('resolves absolute paths directly', () => {
      const absolutePath = '/absolute/path/to/logfile.log';
      mockFs.existsSync.mockImplementation((p) => p === absolutePath);

      const result = findLogFile(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it('resolves filenames in log directory', () => {
      const filename = 'promptfoo-debug-2024-01-01_10-00-00.log';
      const expectedPath = path.join('/home/user/.promptfoo/logs', filename);

      mockFs.existsSync.mockImplementation((p) => {
        // Return false for absolute path check, true for log directory path
        if (p === filename) {
          return false;
        }
        return p === expectedPath;
      });

      const result = findLogFile(filename);
      expect(result).toBe(expectedPath);
    });

    it('performs fuzzy matching on partial names', () => {
      const logDir = path.join('/home/user/.promptfoo', 'logs');
      mockFs.readdirSync.mockReturnValue([
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'promptfoo-debug-2024-01-02_10-00-00.log',
      ] as any);
      mockFs.statSync.mockReturnValue({
        mtime: new Date('2024-01-01T10:00:00Z'),
        size: 1024,
      } as fs.Stats);

      // Make existsSync return false for direct paths to trigger fuzzy matching
      mockFs.existsSync.mockImplementation((p) => {
        const pStr = String(p);
        return pStr === logDir;
      });

      const result = findLogFile('2024-01-01');
      expect(result).toContain('2024-01-01');
    });

    it('returns null when file not found', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      const result = findLogFile('nonexistent.log');
      expect(result).toBeNull();
    });
  });

  describe('formatFileSize', () => {
    it('formats zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('formats gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });

    it('formats terabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB');
    });

    it('handles very large files without overflow', () => {
      // 10 PB - should cap at TB
      expect(formatFileSize(10 * 1024 * 1024 * 1024 * 1024 * 1024)).toBe('10240.0 TB');
    });
  });
});
