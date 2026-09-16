/**
 * Git Branch Validation
 */

import { GitError } from '../../types/codeScan';
import type { SimpleGit } from 'simple-git';

/**
 * Validate that we're on a branch (not detached HEAD)
 * @param git Simple git instance
 * @throws GitError if not on a branch
 */
export async function validateOnBranch(git: SimpleGit): Promise<string> {
  try {
    const status = await git.status();
    if (status.detached) {
      throw new GitError('Not on a branch. Please checkout a branch before running the scan.');
    }
    if (!status.current) {
      throw new GitError('Could not determine current branch.');
    }
    return status.current;
  } catch (error) {
    if (error instanceof GitError) {
      throw error;
    }
    throw new GitError(
      `Failed to validate branch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
