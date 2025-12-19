/**
 * Git Diff Tests
 */

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { extractDiff, validateOnBranch } from '../../../src/codeScan/git/diff';
import { GitError } from '../../../src/types/codeScan';
import type { SimpleGit, StatusResult } from 'simple-git';

// Define a partial mock type for the SimpleGit methods we use
type MockSimpleGit = Pick<SimpleGit, 'status' | 'branch' | 'diff' | 'log'> & {
  status: Mock;
  branch: Mock;
  diff: Mock;
  log: Mock;
};

// Mock simple-git with a factory that returns a mock instance
const mockGit: MockSimpleGit = {
  status: vi.fn(),
  branch: vi.fn(),
  diff: vi.fn(),
  log: vi.fn(),
};

vi.mock('simple-git', () => ({
  default: vi.fn(() => mockGit),
}));

describe('Git Diff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('should throw GitError when neither main nor master exists', async () => {
      // Mock status (for validateOnBranch)
      mockGit.status.mockResolvedValue({
        current: 'feature/test',
        detached: false,
      } as StatusResult);

      // Mock neither branch exists - should throw error
      mockGit.branch.mockResolvedValue({
        all: ['feature/test'],
        branches: {},
        current: 'feature/test',
        detached: false,
      } as any);

      await expect(extractDiff('/fake/repo')).rejects.toThrow(GitError);
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
