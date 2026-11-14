import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { validateOnBranch } from '../../../src/codeScan/git/diff';
import { extractMetadata } from '../../../src/codeScan/git/metadata';
import { GitError, GitMetadataError } from '../../../src/types/codeScan';

describe('code scan metadata with real git', () => {
  let repoPath: string;
  let baseSha: string;
  let compareSha: string;

  async function git(args: string[], input?: string): Promise<string> {
    const command = promisify(execFile)('git', ['-c', 'commit.gpgSign=false', ...args], {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Metadata test',
        GIT_AUTHOR_EMAIL: 'metadata-test@example.com',
        GIT_COMMITTER_NAME: 'Metadata test',
        GIT_COMMITTER_EMAIL: 'metadata-test@example.com',
      },
    });
    command.child.stdin?.end(input);
    return (await command).stdout.trim();
  }

  beforeAll(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'promptfoo-git-metadata-'));
    await git(['init', '--template=']);
    const tree = await git(['mktree'], '');
    baseSha = await git(['commit-tree', tree, '-m', 'base']);
    compareSha = await git(['commit-tree', tree, '-p', baseSha, '-m', 'feature; literal text']);
    await git(['update-ref', 'refs/heads/main', baseSha]);
    await git(['update-ref', 'refs/heads/feature/topic', compareSha]);
  });

  beforeEach(async () => {
    await git(['symbolic-ref', 'HEAD', 'refs/heads/feature/topic']);
  });

  afterAll(async () => {
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('extracts the comparison refs, commits, and author through the installed Git client', async () => {
    const metadata = await extractMetadata(repoPath, 'main', 'feature/topic');

    expect(metadata).toMatchObject({
      baseBranch: 'main',
      baseRef: 'main',
      baseSha,
      branch: 'feature/topic',
      compareRef: 'feature/topic',
      compareSha,
      commitMessages: [`${compareSha.slice(0, 7)}: feature; literal text`],
      author: 'Metadata test',
    });
    expect(Number.isNaN(Date.parse(metadata.timestamp))).toBe(false);
    await expect(validateOnBranch(repoPath)).resolves.toBe('feature/topic');
  });

  it('identifies an unborn branch before its first commit', async () => {
    await git(['symbolic-ref', 'HEAD', 'refs/heads/new/topic']);
    await expect(validateOnBranch(repoPath)).resolves.toBe('new/topic');
  });

  it('preserves the branch name when a tag has the same name', async () => {
    await git(['update-ref', 'refs/heads/review/collision', compareSha]);
    await git(['update-ref', 'refs/tags/review/collision', compareSha]);
    await git(['symbolic-ref', 'HEAD', 'refs/heads/review/collision']);
    await expect(validateOnBranch(repoPath)).resolves.toBe('review/collision');
  });

  it('rejects a symbolic HEAD that points to a tag', async () => {
    await git(['update-ref', 'refs/tags/nonbranch', compareSha]);
    await git(['symbolic-ref', 'HEAD', 'refs/tags/nonbranch']);
    await expect(validateOnBranch(repoPath)).rejects.toThrow('Failed to validate branch');
  });

  it('reports invalid comparison refs as metadata errors', async () => {
    await expect(extractMetadata(repoPath, 'missing-base', 'feature/topic')).rejects.toThrow(
      GitMetadataError,
    );
  });

  it('rejects a detached checkout', async () => {
    await git(['update-ref', '--no-deref', 'HEAD', compareSha]);

    await expect(validateOnBranch(repoPath)).rejects.toThrow(GitError);
    await expect(validateOnBranch(repoPath)).rejects.toThrow('Not on a branch');
  });

  it.each(['--help', '--output=ignored'])(
    'rejects option-like refs as metadata errors',
    async (ref) => {
      await expect(extractMetadata(repoPath, ref, 'feature/topic')).rejects.toThrow(
        GitMetadataError,
      );
    },
  );

  it('includes commits on both sides of a diverged branch', async () => {
    const tree = await git(['rev-parse', 'main^{tree}']);
    const other = await git(['commit-tree', tree, '-p', baseSha, '-m', 'other side']);
    const metadata = await extractMetadata(repoPath, other, compareSha);
    expect(metadata.commitMessages.sort()).toEqual(
      [
        `${compareSha.slice(0, 7)}: feature; literal text`,
        `${other.slice(0, 7)}: other side`,
      ].sort(),
    );
  });
});
