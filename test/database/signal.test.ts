import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWriteFileSync, mockReadFileSync, mockGetDbSignalPath, mockLoggerWarn } = vi.hoisted(
  () => ({
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockGetDbSignalPath: vi.fn().mockReturnValue('/mock/path/signal.txt'),
    mockLoggerWarn: vi.fn(),
  }),
);

vi.mock('fs', () => ({
  default: {
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
    existsSync: vi.fn(),
    watch: vi.fn(),
  },
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: mockLoggerWarn,
  },
}));

vi.mock('../../src/database/index', () => ({
  getDbSignalPath: mockGetDbSignalPath,
}));

import { readSignalEvalId, updateSignalFile } from '../../src/database/signal';

describe('signal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFileSync.mockReset();
    mockReadFileSync.mockReset();
    // Re-set the mock return value after reset
    mockGetDbSignalPath.mockReturnValue('/mock/path/signal.txt');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('updateSignalFile', () => {
    it('should write timestamp only when no evalId is provided', () => {
      updateSignalFile();

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/mock/path/signal.txt',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      );
    });

    it('should write evalId:timestamp when evalId is provided', () => {
      updateSignalFile('eval-123-abc');

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/mock/path/signal.txt',
        expect.stringMatching(/^eval-123-abc:\d{4}-\d{2}-\d{2}T/),
      );
    });

    it('should log warning when write fails', () => {
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      updateSignalFile('eval-123');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write database signal file'),
      );
    });
  });

  describe('readSignalEvalId', () => {
    it('should return evalId when signal file contains evalId:timestamp format', () => {
      mockReadFileSync.mockReturnValue('eval-12345-abcdef:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBe('eval-12345-abcdef');
    });

    it('should return undefined when signal file contains only timestamp', () => {
      mockReadFileSync.mockReturnValue('2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should return undefined when evalId is too short (8 chars or less)', () => {
      mockReadFileSync.mockReturnValue('short:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should return evalId when it is longer than 8 characters', () => {
      mockReadFileSync.mockReturnValue('123456789:2024-01-01T00:00:00.000Z');

      const result = readSignalEvalId();

      expect(result).toBe('123456789');
    });

    it('should return undefined when file read fails', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should handle empty string content', () => {
      mockReadFileSync.mockReturnValue('');

      const result = readSignalEvalId();

      expect(result).toBeUndefined();
    });

    it('should trim whitespace from content', () => {
      mockReadFileSync.mockReturnValue('  eval-12345-abcdef:2024-01-01T00:00:00.000Z  \n');

      const result = readSignalEvalId();

      expect(result).toBe('eval-12345-abcdef');
    });

    it('should handle UUID-style eval IDs', () => {
      mockReadFileSync.mockReturnValue(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890:2024-01-01T00:00:00.000Z',
      );

      const result = readSignalEvalId();

      expect(result).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });
});
