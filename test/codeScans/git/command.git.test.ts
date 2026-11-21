import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readGitBlob } from '../../../src/codeScan/git/command';

describe('readGitBlob with real git', () => {
  // No trailing newline: `runCommand` strips the final newline from stdout by default.
  const content = 'const message = "read this blob";';
  let repoPath: string;
  let blobSha: string;

  beforeAll(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'promptfoo-read-blob-'));
    await promisify(execFile)('git', ['init', '--bare', '--template='], { cwd: repoPath });
    const command = promisify(execFile)('git', ['hash-object', '-w', '--stdin'], {
      cwd: repoPath,
    });
    command.child.stdin?.end(content);
    blobSha = (await command).stdout.trim();
  });

  afterAll(async () => {
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it('reads a blob by object ID', async () => {
    expect((await readGitBlob(repoPath, blobSha)).toString('utf8')).toBe(content);
  });

  it('reads a blob by object ID without honoring replace refs', async () => {
    expect((await readGitBlob(repoPath, blobSha, true)).toString('utf8')).toBe(content);
  });

  it.each(['--help', '--batch'])(
    'rejects the option-like object name %s instead of treating it as a git flag',
    async (sha) => {
      await expect(readGitBlob(repoPath, sha)).rejects.toThrow();
    },
  );
});
