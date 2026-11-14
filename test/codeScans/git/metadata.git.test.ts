import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { GitPluginError, simpleGit } from 'simple-git';
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
    await git(['init', '--template=', '--initial-branch=main']);
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
    await expect(validateOnBranch(simpleGit(repoPath))).resolves.toBe('feature/topic');
  });

  it('reports invalid comparison refs as metadata errors', async () => {
    await expect(extractMetadata(repoPath, 'missing-base', 'feature/topic')).rejects.toThrow(
      GitMetadataError,
    );
  });

  it('rejects a detached checkout', async () => {
    await git(['update-ref', '--no-deref', 'HEAD', compareSha]);

    await expect(validateOnBranch(simpleGit(repoPath))).rejects.toThrow(GitError);
    await expect(validateOnBranch(simpleGit(repoPath))).rejects.toThrow('Not on a branch');
  });

  it('allows full option names but rejects abbreviated long options', async () => {
    await expect(simpleGit(repoPath).raw(['branch', '--list'])).resolves.toContain('feature/topic');
    await expect(simpleGit(repoPath).raw(['branch', '--lis'])).rejects.toThrow('abbreviated');
  });

  it.each(['VISUAL', 'visual', 'ViSuAl'])(
    'rejects an explicitly supplied %s editor variable before running git',
    async (key) => {
      const command = simpleGit(repoPath)
        .env({ [key]: 'promptfoo-inert-editor-fixture' })
        .raw(['--version']);

      await expect(command).rejects.toThrow(GitPluginError);
      await expect(command).rejects.toThrow('VISUAL');
      await expect(command).rejects.toThrow('allowUnsafeEditor');
    },
  );
});
