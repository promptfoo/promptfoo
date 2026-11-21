import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BLOB_SIZE_BYTES } from '../../../src/codeScan/constants/filtering';
import * as gitCommand from '../../../src/codeScan/git/command';
import { createFilesystemSnapshot } from '../../../src/codeScan/mcp/snapshot';
import { mockProcessEnv } from '../../util/utils';

describe('hosted filesystem snapshot', () => {
  let repository: string;
  let snapshot: Awaited<ReturnType<typeof createFilesystemSnapshot>> | undefined;

  function git(args: string[], input?: string): string {
    return execFileSync(
      'git',
      [
        '-c',
        'user.name=Snapshot test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgSign=false',
        ...args,
      ],
      { cwd: repository, input, encoding: 'utf8' },
    ).trim();
  }

  async function write(relativePath: string, contents: string | Buffer) {
    const file = path.join(repository, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }

  beforeEach(async () => {
    repository = await mkdtemp(path.join(tmpdir(), 'promptfoo-snapshot-test-'));
    git(['init', '--quiet', '--template=']);
  });

  afterEach(async () => {
    await snapshot?.dispose();
    snapshot = undefined;
    await rm(repository, { recursive: true, force: true });
  });

  it('serves eligible Git blobs without exposing private or local files', async () => {
    await write('src/some code.ts', 'export const value = 1;');
    // Keep the NUL outside the beginning, middle, and end samples used for diff classification.
    const binary = Buffer.alloc(512, 'a');
    binary[100] = 0;
    await write('src/opaque.ts', binary);
    await write('src/notes.custom', 'first line\nsecond line\n');
    await write('src/large.ts', Buffer.alloc(MAX_BLOB_SIZE_BYTES + 1, 'a'));
    await write('dist/generated.js', 'generated fixture');
    await write('.github/dist/generated.js', 'generated fixture');
    await write('config/clientCredentials.json', 'private fixture');
    await write('config/.env.production', 'fixture only');
    await write('config/private.pem', 'fixture only');
    await write('config/secrets.json', '{}');
    await write(
      'src/otherwise-normal.ts',
      '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
    );
    git(['add', '--force', '.']);
    git(['commit', '--quiet', '-m', 'fixture']);
    const compare = git(['rev-parse', 'HEAD']);

    await write('src/some code.ts', 'later commit');
    git(['commit', '--quiet', '-am', 'later revision']);
    await write('src/some code.ts', 'staged modification');
    git(['add', 'src/some code.ts']);
    await write('src/some code.ts', 'local modification');
    await write('src/untracked.ts', 'local fixture');

    snapshot = await createFilesystemSnapshot(repository, compare);
    expect(await readdir(snapshot.rootDir)).toEqual(['src']);
    expect((await readdir(path.join(snapshot.rootDir, 'src'))).sort()).toEqual([
      'notes.custom',
      'some code.ts',
    ]);
    expect(await readFile(path.join(snapshot.rootDir, 'src', 'notes.custom'), 'utf8')).toBe(
      'first line\nsecond line\n',
    );
    expect(await readFile(path.join(snapshot.rootDir, 'src', 'some code.ts'), 'utf8')).toBe(
      'export const value = 1;',
    );
    await snapshot.dispose();
    await expect(readdir(snapshot.rootDir)).rejects.toMatchObject({ code: 'ENOENT' });
    snapshot = undefined;
    expect(await readFile(path.join(repository, 'src', 'some code.ts'), 'utf8')).toBe(
      'local modification',
    );
  });

  it('keeps tokenizer source and omits configuration containing literal credentials', async () => {
    await write('src/tokenizer.ts', 'export function pick(key: string) { return key; }');
    await write('src/service-config.json', '{"password":"example-only-test-value"}');
    await write('settings.txt', 'API_KEY=test-value-for-fixture\n');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'configuration fixture']);

    snapshot = await createFilesystemSnapshot(repository);
    expect(await readdir(snapshot.rootDir)).toEqual(['src']);
    expect(await readdir(path.join(snapshot.rootDir, 'src'))).toEqual(['tokenizer.ts']);
  });

  it('omits Git symlinks and submodules even when their checkout paths contain readable files', async () => {
    await write('safe.ts', 'ordinary tracked source');
    git(['add', 'safe.ts']);
    git(['commit', '--quiet', '-m', 'base fixture']);
    const commit = git(['rev-parse', 'HEAD']);
    const link = git(['hash-object', '-w', '--stdin'], 'local-only.ts');
    git(['update-index', '--add', '--cacheinfo', `120000,${link},shortcut.ts`]);
    git(['update-index', '--add', '--cacheinfo', `160000,${commit},dependency`]);
    git(['commit', '--quiet', '-m', 'record special Git entries']);
    await write('local-only.ts', 'fixture outside the tracked set');
    await write('shortcut.ts', 'readable worktree fixture');
    await write('dependency/nested.ts', 'submodule fixture');

    snapshot = await createFilesystemSnapshot(repository);
    expect(await readdir(snapshot.rootDir)).toEqual(['safe.ts']);
  });

  it('restricts a nested scan root to the selected subtree and keeps its relative paths', async () => {
    await write('outside.ts', 'sibling fixture');
    await write('app/lib/feature.ts', 'selected fixture');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'nested fixture']);

    snapshot = await createFilesystemSnapshot(path.join(repository, 'app'));
    expect(await readdir(snapshot.rootDir)).toEqual(['app']);
    expect(await readFile(path.join(snapshot.rootDir, 'app', 'lib', 'feature.ts'), 'utf8')).toBe(
      'selected fixture',
    );
  });

  it('applies path exclusions to ancestors of the selected directory', async () => {
    await write('credentials/nested/normal.ts', 'private fixture');
    git(['add', 'credentials']);
    git(['commit', '--quiet', '-m', 'private fixture']);

    snapshot = await createFilesystemSnapshot(path.join(repository, 'credentials', 'nested'));
    expect(await readdir(snapshot.rootDir)).toEqual([]);
  });

  it('refuses a temporary directory inside the checkout even for a nested scan', async () => {
    await write('app/feature.ts', 'committed');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'fixture']);
    const privateTemp = path.join(repository, 'scratch');
    await mkdir(privateTemp);
    const restore = mockProcessEnv({ TMPDIR: privateTemp, TMP: privateTemp, TEMP: privateTemp });
    try {
      await expect(createFilesystemSnapshot(path.join(repository, 'app'))).rejects.toThrow();
    } finally {
      restore();
    }
    expect(await readdir(privateTemp)).toEqual([]);
  });

  it('rejects a missing ref before starting other Git processes and keeps the error private', async () => {
    const missingRef = 'missing-private-branch';
    const commands = vi.spyOn(gitCommand, 'runGit');
    try {
      const error = await createFilesystemSnapshot(repository, missingRef).catch(
        (cause: Error) => cause,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(repository);
      expect(String(error)).not.toContain(missingRef);
      expect(commands).toHaveBeenCalledTimes(1);
    } finally {
      commands.mockRestore();
    }
  });
});
