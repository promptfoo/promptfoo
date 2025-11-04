/**
 * Git Diff Tests
 */

import { validateOnBranch, extractDiff, GitError } from './diff';
import type { SimpleGit, StatusResult, DefaultLogFields } from 'simple-git';

// Mock simple-git
jest.mock('simple-git');

describe('Git Diff', () => {
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock SimpleGit instance
    mockGit = {
      status: jest.fn(),
      branch: jest.fn(),
      diff: jest.fn(),
      log: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;

    // Mock the default import
    const simpleGit = require('simple-git');
    simpleGit.default = jest.fn(() => mockGit);
  });

  describe('validateOnBranch', () => {
    it('should return current branch name when on a branch', async () => {
      mockGit.status.mockResolvedValue({
        current: 'feature/test-branch',
        detached: false,
      } as StatusResult);

      const branchName = await validateOnBranch(mockGit);

      expect(branchName).toBe('feature/test-branch');
    });

    it('should throw GitError when in detached HEAD state', async () => {
      mockGit.status.mockResolvedValue({
        current: null,
        detached: true,
      } as StatusResult);

      await expect(validateOnBranch(mockGit)).rejects.toThrow(GitError);
      await expect(validateOnBranch(mockGit)).rejects.toThrow('Not on a branch');
    });
  });

  describe('extractDiff', () => {
    it('should extract diff comparing against main branch', async () => {
      const mockDiff = `diff --git a/file.ts b/file.ts
index 123..456 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
+const newLine = 'test';
 const existingLine = 'existing';`;

      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      // Mock main branch exists
      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);
      mockGit.diff.mockResolvedValue(mockDiff);

      const result = await extractDiff('/fake/repo');

      expect(result).toEqual({
        diff: mockDiff,
        baseBranch: 'main',
      });
      expect(mockGit.diff).toHaveBeenCalledWith(['main...HEAD']);
    });

    it('should fall back to master branch if main does not exist', async () => {
      const mockDiff = 'diff content';

      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      // Mock main branch does not exist, master does
      mockGit.branch.mockResolvedValue({
        all: ['master', 'feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);
      mockGit.diff.mockResolvedValue(mockDiff);

      const result = await extractDiff('/fake/repo');

      expect(result).toEqual({
        diff: mockDiff,
        baseBranch: 'master',
      });
      expect(mockGit.diff).toHaveBeenCalledWith(['master...HEAD']);
    });

    it('should default to main when neither main nor master exists', async () => {
      const mockDiff = 'diff content';

      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      // Mock neither branch exists (defaults to main)
      mockGit.branch.mockResolvedValue({
        all: ['feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);
      mockGit.diff.mockResolvedValue(mockDiff);

      const result = await extractDiff('/fake/repo');

      expect(result).toEqual({
        diff: mockDiff,
        baseBranch: 'main',
      });
    });

    it('should throw GitError if no changes detected', async () => {
      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);

      // Mock empty diff
      mockGit.diff.mockResolvedValue('');

      await expect(extractDiff('/fake/repo')).rejects.toThrow(GitError);
      await expect(extractDiff('/fake/repo')).rejects.toThrow('No changes detected');
    });

    it('should throw GitError if diff extraction fails', async () => {
      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      mockGit.branch.mockResolvedValue({
        all: ['main', 'feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);

      mockGit.diff.mockRejectedValue(new Error('git diff failed'));

      await expect(extractDiff('/fake/repo')).rejects.toThrow(GitError);
      await expect(extractDiff('/fake/repo')).rejects.toThrow('Failed to extract diff');
    });
  });
});
