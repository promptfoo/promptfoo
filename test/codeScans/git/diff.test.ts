/**
 * Git Diff Tests
 */

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { validateOnBranch } from '../../../src/codeScan/git/diff';
import { GitError } from '../../../src/types/codeScan';
import type { SimpleGit, StatusResult } from 'simple-git';

type MockSimpleGit = Pick<SimpleGit, 'status'> & {
  status: Mock;
};

const mockGit: MockSimpleGit = {
  status: vi.fn(),
};

describe('Git Diff', () => {
  beforeEach(() => {
    mockGit.status.mockReset();
  });

  describe('validateOnBranch', () => {
    it('should return current branch name when on a branch', async () => {
      mockGit.status.mockResolvedValue({
        current: 'feature/test-branch',
        detached: false,
      } as StatusResult);

      const branchName = await validateOnBranch(mockGit as unknown as SimpleGit);

      expect(branchName).toBe('feature/test-branch');
    });

    it('should throw GitError when in detached HEAD state', async () => {
      mockGit.status.mockResolvedValue({
        current: null,
        detached: true,
      } as StatusResult);

      await expect(validateOnBranch(mockGit as unknown as SimpleGit)).rejects.toThrow(GitError);
      await expect(validateOnBranch(mockGit as unknown as SimpleGit)).rejects.toThrow(
        'Not on a branch',
      );
    });
  });
});
