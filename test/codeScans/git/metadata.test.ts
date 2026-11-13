/**
 * Git Metadata Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractMetadata } from '../../../src/codeScan/git/metadata';
import { GitMetadataError } from '../../../src/types/codeScan';
import { runCommand } from '../../../src/util/runCommand';

vi.mock('../../../src/util/runCommand', () => ({ runCommand: vi.fn() }));
const mockLog = vi.fn();

function mockGitLog(
  commits: Array<{ hash: string; date: string; message: string; author_name: string }>,
) {
  const records = commits.map((commit) =>
    [commit.hash, commit.message, commit.author_name, commit.date, ''].join('\0'),
  );
  mockLog.mockResolvedValue({ stdout: records.join(''), stderr: '' });
}

describe('Git Metadata', () => {
  beforeEach(() => {
    vi.mocked(runCommand).mockImplementation(async (_file, args) => {
      if (args[0] === 'log') {
        return mockLog();
      }
      return {
        stdout: args.at(-1) === 'main' ? 'base-sha-123456' : 'compare-sha-789012',
        stderr: '',
      };
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract metadata from git log', async () => {
      mockGitLog([
        {
          hash: 'abc1234',
          date: '2025-01-15T10:30:00Z',
          message: 'Add LLM integration',
          author_name: 'Test User',
        },
        {
          hash: 'def5678',
          date: '2025-01-14T15:20:00Z',
          message: 'Fix prompt handling',
          author_name: 'Test User',
        },
      ]);

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata).toEqual({
        branch: 'feature/test',
        baseBranch: 'main',
        baseRef: 'main',
        baseSha: 'base-sha-123456',
        compareRef: 'feature/test',
        compareSha: 'compare-sha-789012',
        commitMessages: ['abc1234: Add LLM integration', 'def5678: Fix prompt handling'],
        author: 'Test User',
        timestamp: '2025-01-15T10:30:00Z',
      });
    });

    it('should handle single commit', async () => {
      mockGitLog([
        {
          hash: 'abc1234567',
          date: '2025-01-15T10:30:00Z',
          message: 'Initial commit',
          author_name: 'Test User',
        },
      ]);

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual(['abc1234: Initial commit']);
      expect(metadata.author).toBe('Test User');
    });

    it('should handle no commits with default values', async () => {
      mockGitLog([]);

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual([]);
      expect(metadata.author).toBe('Unknown');
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO date format
    });

    it('should throw GitMetadataError if log extraction fails', async () => {
      mockLog.mockRejectedValue(new Error('git log failed'));

      await expect(extractMetadata('/fake/repo', 'main', 'feature/test')).rejects.toThrow(
        GitMetadataError,
      );
      await expect(extractMetadata('/fake/repo', 'main', 'feature/test')).rejects.toThrow(
        'Failed to extract git metadata',
      );
      expect(mockLog).toHaveBeenCalledTimes(2);
    });

    it('should handle commits with multiline messages', async () => {
      mockGitLog([
        {
          hash: 'abc123def',
          date: '2025-01-15T10:30:00Z',
          message: 'Add feature\n\nDetailed description here',
          author_name: 'Test User',
        },
      ]);

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual([
        'abc123d: Add feature\n\nDetailed description here',
      ]);
    });

    it('should use latest commit for author and timestamp', async () => {
      mockGitLog([
        {
          hash: 'abc1234',
          date: '2025-01-15T10:30:00Z',
          message: 'Latest commit',
          author_name: 'Latest Author',
        },
        {
          hash: 'def5678',
          date: '2025-01-14T15:20:00Z',
          message: 'Older commit',
          author_name: 'Old Author',
        },
      ]);

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.author).toBe('Latest Author');
      expect(metadata.timestamp).toBe('2025-01-15T10:30:00Z');
    });
  });
});
