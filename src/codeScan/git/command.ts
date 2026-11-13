import { runCommand } from '../../util/runCommand';

export async function runGit(
  repoPath: string,
  args: string[],
  options: { input?: string; maxBuffer?: number } = {},
): Promise<string> {
  const { stdout } = await runCommand('git', args, { cwd: repoPath, ...options });
  return stdout;
}

export async function readGitBlob(repoPath: string, sha: string): Promise<Buffer> {
  const { stdout } = await runCommand('git', ['cat-file', 'blob', sha], {
    cwd: repoPath,
    encoding: 'buffer',
  });
  return stdout;
}
