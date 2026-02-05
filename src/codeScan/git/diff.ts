/**
 * Git Diff Extraction
 *
 * Extracts git diffs between the current branch and the base branch.
 */

import simpleGit, { type SimpleGit } from 'simple-git';
import { GitError } from '../../types/codeScan';

/**
 * Get the base branch name by detecting the remote's default branch
 * Falls back to local branch detection (main or master)
 * @param git Simple git instance
 * @returns Base branch name
 */
async function getBaseBranch(git: SimpleGit): Promise<string> {
  try {
    // First, try to detect the remote's default branch
    try {
      const remoteHead = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      if (remoteHead) {
        // Parse branch name from "refs/remotes/origin/main" -> "main"
        const match = remoteHead.trim().match(/refs\/remotes\/origin\/(.+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // Remote HEAD not set or no remote, fall back to local detection
    }

    // Fallback: Check local branches for main or master
    const branches = await git.branch();
    if (branches.all.includes('main')) {
      return 'main';
    }
    if (branches.all.includes('master')) {
      return 'master';
    }

    throw new GitError(
      'Could not find a default base branch (main or master). Please specify a base branch or commit to compare against with --base',
    );
  } catch (error) {
    if (error instanceof GitError) {
      throw error;
    }
    throw new GitError(
      `Failed to determine base branch: ${error instanceof Error ? error.message : String(error)}. Please specify a base branch or commit to compare against with --base`,
    );
  }
}

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

/**
 * Extract git diff between current branch and base branch
 * @param repoPath Path to the git repository
 * @returns Git diff string
 * @throws GitError if diff extraction fails or if there are no diffs
 */
export async function extractDiff(repoPath: string): Promise<{ diff: string; baseBranch: string }> {
  const git = simpleGit(repoPath);

  // Validate we're on a branch
  await validateOnBranch(git);

  // Get base branch
  const baseBranch = await getBaseBranch(git);

  try {
    // Get diff using three-dot syntax (merge base)
    const diff = await git.diff([`${baseBranch}...HEAD`]);

    if (!diff || diff.trim().length === 0) {
      throw new GitError(
        `No changes detected between current branch and ${baseBranch}. ` +
          'Please commit your changes or ensure your branch has diverged from the base branch.',
      );
    }

    return { diff, baseBranch };
  } catch (error) {
    if (error instanceof GitError) {
      throw error;
    }
    throw new GitError(
      `Failed to extract diff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
