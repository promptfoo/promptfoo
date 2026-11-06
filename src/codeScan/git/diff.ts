/**
 * Git Branch Validation
 */

import { GitError } from '../../types/codeScan';
import { runCommand } from '../../util/runCommand';

/**
 * Validate that we're on a branch (not detached HEAD)
 * @throws GitError if not on a branch
 */
export async function validateOnBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await runCommand('git', ['branch', '--show-current'], { cwd: repoPath });
    if (!stdout) {
      throw new GitError('Not on a branch. Please checkout a branch before running the scan.');
    }
    return stdout;
  } catch (error) {
    if (error instanceof GitError) {
      throw error;
    }
    throw new GitError(
      `Failed to validate branch: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function getDefaultBaseBranch(repoPath: string): Promise<string> {
  const { stdout } = await runCommand(
    'git',
    ['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads', 'refs/remotes/origin'],
    { cwd: repoPath },
  );
  const refs = new Set(stdout.split('\n'));
  return ['main', 'master', 'origin/main', 'origin/master'].find((ref) => refs.has(ref)) ?? 'main';
}

export async function countUncommittedFiles(repoPath: string): Promise<number> {
  const { stdout } = await runCommand(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      'status',
      '--porcelain=v2',
      '--untracked-files=all',
      '-z',
    ],
    { cwd: repoPath },
  );
  const records = stdout.split('\0');
  let count = 0;
  for (let i = 0; i < records.length && records[i]; i++) {
    count++;
    if (records[i].startsWith('2 ')) {
      i++; // A rename or copy has a second NUL-delimited path.
    }
  }
  return count;
}
