/**
 * Git Metadata Tests
 */

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { extractMetadata } from '../../../src/codeScan/git/metadata';
import { GitMetadataError } from '../../../src/types/codeScan';
import type { SimpleGit } from 'simple-git';

// Define a partial mock type for the SimpleGit methods we use
type MockSimpleGit = Pick<SimpleGit, 'log' | 'revparse'> & {
  log: Mock;
  revparse: Mock;
};

// Mock simple-git with a factory that returns a mock instance
const mockGit: MockSimpleGit = {
  log: vi.fn(),
  revparse: vi.fn(),
};

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGit),
}));

describe('Git Metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract metadata from git log', async () => {
      const mockLog = {
        all: [
          {
            hash: 'abc1234',
            date: '2025-01-15T10:30:00Z',
            message: 'Add LLM integration',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
          {
            hash: 'def5678',
            date: '2025-01-14T15:20:00Z',
            message: 'Fix prompt handling',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
        ],
        latest: {
          hash: 'abc1234',
          date: '2025-01-15T10:30:00Z',
          message: 'Add LLM integration',
          author_name: 'Test User',
          author_email: 'test@example.com',
        },
        total: 2,
      };

      mockGit.log.mockResolvedValue(mockLog as any);
      (mockGit.revparse as any).mockImplementation(async (options: any) => {
        const ref = Array.isArray(options) ? options[0] : options;
        return ref === 'main' ? 'base-sha-123456' : 'compare-sha-789012';
      });

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

      expect(mockGit.log).toHaveBeenCalledWith({
        from: 'main',
        to: 'feature/test',
      });
    });

    it('should handle single commit', async () => {
      const mockLog = {
        all: [
          {
            hash: 'abc1234567',
            date: '2025-01-15T10:30:00Z',
            message: 'Initial commit',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
        ],
        latest: {
          hash: 'abc1234567',
          date: '2025-01-15T10:30:00Z',
          message: 'Initial commit',
          author_name: 'Test User',
          author_email: 'test@example.com',
        },
        total: 1,
      };

      mockGit.log.mockResolvedValue(mockLog as any);
      (mockGit.revparse as any).mockImplementation(async (options: any) => {
        const ref = Array.isArray(options) ? options[0] : options;
        return ref === 'main' ? 'base-sha-123456' : 'compare-sha-789012';
      });

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual(['abc1234: Initial commit']);
      expect(metadata.author).toBe('Test User');
    });

    it('should handle no commits with default values', async () => {
      const mockLog = {
        all: [],
        latest: null,
        total: 0,
      };

      mockGit.log.mockResolvedValue(mockLog as any);
      (mockGit.revparse as any).mockImplementation(async (options: any) => {
        const ref = Array.isArray(options) ? options[0] : options;
        return ref === 'main' ? 'base-sha-123456' : 'compare-sha-789012';
      });

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual([]);
      expect(metadata.author).toBe('Unknown');
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO date format
    });

    it('should throw GitMetadataError if log extraction fails', async () => {
      mockGit.log.mockRejectedValue(new Error('git log failed'));

      await expect(extractMetadata('/fake/repo', 'main', 'feature/test')).rejects.toThrow(
        GitMetadataError,
      );
      await expect(extractMetadata('/fake/repo', 'main', 'feature/test')).rejects.toThrow(
        'Failed to extract git metadata',
      );
    });

    it('should handle commits with multiline messages', async () => {
      const mockLog = {
        all: [
          {
            hash: 'abc123def',
            date: '2025-01-15T10:30:00Z',
            message: 'Add feature\n\nDetailed description here',
            author_name: 'Test User',
            author_email: 'test@example.com',
          },
        ],
        latest: {
          hash: 'abc123def',
          date: '2025-01-15T10:30:00Z',
          message: 'Add feature\n\nDetailed description here',
          author_name: 'Test User',
          author_email: 'test@example.com',
        },
        total: 1,
      };

      mockGit.log.mockResolvedValue(mockLog as any);
      (mockGit.revparse as any).mockImplementation(async (options: any) => {
        const ref = Array.isArray(options) ? options[0] : options;
        return ref === 'main' ? 'base-sha-123456' : 'compare-sha-789012';
      });

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.commitMessages).toEqual([
        'abc123d: Add feature\n\nDetailed description here',
      ]);
    });

    it('should use latest commit for author and timestamp', async () => {
      const mockLog = {
        all: [
          {
            hash: 'abc1234',
            date: '2025-01-15T10:30:00Z',
            message: 'Latest commit',
            author_name: 'Latest Author',
            author_email: 'latest@example.com',
          },
          {
            hash: 'def5678',
            date: '2025-01-14T15:20:00Z',
            message: 'Older commit',
            author_name: 'Old Author',
            author_email: 'old@example.com',
          },
        ],
        latest: {
          hash: 'abc1234',
          date: '2025-01-15T10:30:00Z',
          message: 'Latest commit',
          author_name: 'Latest Author',
          author_email: 'latest@example.com',
        },
        total: 2,
      };

      mockGit.log.mockResolvedValue(mockLog as any);
      (mockGit.revparse as any).mockImplementation(async (options: any) => {
        const ref = Array.isArray(options) ? options[0] : options;
        return ref === 'main' ? 'base-sha-123456' : 'compare-sha-789012';
      });

      const metadata = await extractMetadata('/fake/repo', 'main', 'feature/test');

      expect(metadata.author).toBe('Latest Author');
      expect(metadata.timestamp).toBe('2025-01-15T10:30:00Z');
    });
  });
});
