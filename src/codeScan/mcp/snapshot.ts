import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FilesystemMcpError } from '../../types/codeScan';
import { MAX_BLOB_SIZE_BYTES } from '../constants/filtering';
import { readGitBlobBatch, runGit } from '../git/command';
import { isShareableContent, isShareablePath } from './sharing';

// Count paths as well as bytes: a Git tree may reuse one small object many times.
const MAX_SNAPSHOT_FILES = 30_000;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

interface SnapshotFile {
  name: string;
  oid: string;
  size: number;
}

async function writeBlobs(repository: string, rootDir: string, files: SnapshotFile[]) {
  const stdout = await readGitBlobBatch(repository, files);
  let offset = 0;
  for (const { oid, size, name } of files) {
    const end = stdout.indexOf(10, offset);
    if (end < 0 || stdout.toString('ascii', offset, end) !== `${oid} blob ${size}`) {
      throw new Error('Unexpected Git object');
    }
    const blob = stdout.subarray(end + 1, end + 1 + size);
    offset = end + size + 2;
    if (blob.length !== size || stdout[offset - 1] !== 10) {
      throw new Error('Incomplete Git object');
    }
    if (isShareableContent(blob.toString('utf8'))) {
      const dest = path.join(rootDir, name);
      await mkdir(path.dirname(dest), { mode: 0o700, recursive: true });
      // Fail closed on filenames aliased by the local filesystem.
      await writeFile(dest, blob, { flag: 'wx', mode: 0o600 });
    }
  }
}

/** Materialize eligible regular files from Git's object database, never the working tree. */
export async function createFilesystemSnapshot(
  repository: string,
  compareRef = 'HEAD',
  signal?: AbortSignal,
) {
  let rootDir: string | undefined;
  try {
    // On Windows a running Git child keeps its working directory locked.
    // Finish each preflight command before starting the next so errors leave no children behind.
    const commit = await runGit(repository, [
      '--no-replace-objects',
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${compareRef}^{commit}`,
    ]);
    const prefix = await runGit(repository, ['rev-parse', '--show-prefix']);
    const checkout = await realpath(await runGit(repository, ['rev-parse', '--show-toplevel']));
    const temp = await realpath(tmpdir());
    const relativeTemp = path.relative(checkout, temp);
    if (
      !path.isAbsolute(relativeTemp) &&
      relativeTemp !== '..' &&
      !relativeTemp.startsWith(`..${path.sep}`)
    ) {
      throw new Error('Temporary storage is inside checkout');
    }
    const listing = await runGit(repository, [
      '--no-replace-objects',
      'ls-tree',
      '-r',
      '-l',
      '-z',
      '--full-name',
      commit,
      '--',
      '.',
    ]);
    rootDir = await mkdtemp(path.join(temp, 'promptfoo-code-scan-'));
    let bytes = 0;
    let count = 0;
    const batch: SnapshotFile[] = [];
    for (const record of listing.split('\0')) {
      signal?.throwIfAborted();
      const match = /^(?:100644|100755) blob ([a-f0-9]{40,64}) +([0-9]+)\t([^\0]+)$/u.exec(record);
      if (!match) {
        continue;
      }
      const [, oid, size, name] = match;
      if (
        Number(size) > MAX_BLOB_SIZE_BYTES ||
        !name.startsWith(prefix) ||
        !isShareablePath(name)
      ) {
        continue;
      }
      count++;
      bytes += Number(size);
      if (count > MAX_SNAPSHOT_FILES || bytes > MAX_SNAPSHOT_BYTES) {
        throw new Error('Snapshot size limit exceeded');
      }
      batch.push({ name, oid, size: Number(size) });
      if (batch.length === 16) {
        await writeBlobs(repository, rootDir, batch);
        batch.length = 0;
      }
    }
    if (batch.length) {
      await writeBlobs(repository, rootDir, batch);
    }
    const snapshot = rootDir;
    return {
      rootDir: snapshot,
      checkout,
      commit,
      dispose: () => rm(snapshot, { force: true, recursive: true }),
    };
  } catch {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
    signal?.throwIfAborted();
    throw new FilesystemMcpError(
      'Unable to prepare a private full-scan snapshot. Use --diffs-only to scan the diff.',
    );
  }
}
