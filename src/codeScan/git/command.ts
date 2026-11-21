import { runCommand } from '../../util/runCommand';

export async function runGit(
  repoPath: string,
  args: string[],
  options: { input?: string; maxBuffer?: number } = {},
): Promise<string> {
  const { stdout } = await runCommand('git', args, { cwd: repoPath, ...options });
  return stdout;
}

export async function readGitBlob(
  repoPath: string,
  sha: string,
  noReplaceObjects = false,
): Promise<Buffer> {
  const { stdout } = await runCommand(
    'git',
    [...(noReplaceObjects ? ['--no-replace-objects'] : []), 'cat-file', 'blob', sha],
    {
      cwd: repoPath,
      encoding: 'buffer',
    },
  );
  return stdout;
}

/** Read unmodified Git blobs in one bounded, binary-safe batch. */
export async function readGitBlobBatch(repoPath: string, files: { oid: string; size: number }[]) {
  const { stdout } = await runCommand('git', ['--no-replace-objects', 'cat-file', '--batch'], {
    cwd: repoPath,
    input: files.map(({ oid }) => oid).join('\n') + '\n',
    encoding: 'buffer',
    stripFinalNewline: false,
    maxBuffer: files.reduce((bytes, file) => bytes + file.size + 128, 0),
  });
  return stdout;
}
