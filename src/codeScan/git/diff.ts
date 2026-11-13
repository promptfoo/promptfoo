/**
 * Git Branch Validation
 */

import { GitError } from '../../types/codeScan';
import { runGit } from './command';

/**
 * Validate that we're on a branch (not detached HEAD)
 * @throws GitError if not on a branch
 */
export async function validateOnBranch(repoPath: string): Promise<string> {
  let ref: string;
  try {
    ref = await runGit(repoPath, ['symbolic-ref', '--quiet', 'HEAD']);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1) {
      throw new GitError('Not on a branch. Please checkout a branch before running the scan.');
    }
    throw new GitError(
      `Failed to validate branch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const prefix = 'refs/heads/';
  if (!ref.startsWith(prefix)) {
    throw new GitError('Failed to validate branch: HEAD points outside refs/heads/.');
  }
  return ref.slice(prefix.length);
}

export async function getDefaultBaseBranch(repoPath: string): Promise<string> {
  const stdout = await runGit(repoPath, [
    'for-each-ref',
    '--format=%(refname:lstrip=2)',
    'refs/heads',
    'refs/remotes/origin',
  ]);
  const refs = new Set(stdout.split('\n'));
  return ['main', 'master', 'origin/main', 'origin/master'].find((ref) => refs.has(ref)) ?? 'main';
}

export async function countUncommittedFiles(repoPath: string): Promise<number> {
  const stdout = await runGit(repoPath, [
    '--no-optional-locks',
    '-c',
    'core.fsmonitor=false',
    'status',
    '--porcelain=v2',
    '--untracked-files=all',
    '-z',
  ]);
  const records = stdout.split('\0');
  let count = 0;
  for (let i = 0; i < records.length && records[i]; i++) {
    if (records[i].startsWith('# ')) {
      continue; // Porcelain v2 headers describe repository state, not files.
    }
    count++;
    if (records[i].startsWith('2 ')) {
      i++; // A rename or copy has a second NUL-delimited path.
    }
  }
  return count;
}
