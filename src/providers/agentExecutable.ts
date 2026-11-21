import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

async function getProjectRoots(workspace: string, basePath?: string): Promise<string[]> {
  const projectRoots = new Set(
    [workspace, basePath ?? process.cwd(), process.cwd()]
      .map((root) => path.resolve(root))
      .filter((root) => path.dirname(root) !== root),
  );
  for (const root of [...projectRoots]) {
    projectRoots.add(await fs.realpath(root));
  }
  const visited = new Set<string>();
  for (const root of [...projectRoots]) {
    let directory = root;
    while (!visited.has(directory)) {
      visited.add(directory);
      try {
        // Git worktrees use a file here. Inspect every ancestor so a nested
        // marker cannot hide a repository bin above the selected workspace.
        const marker = path.join(directory, '.git');
        // Sandboxes can mount empty .git directories at non-repository roots.
        if (!(await fs.lstat(marker)).isDirectory() || (await fs.readdir(marker)).length) {
          projectRoots.add(directory);
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
      }
      const parent = path.dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  return [...projectRoots];
}

export async function getProjectPathCheck(workspace: string, basePath?: string) {
  const roots = await getProjectRoots(workspace, basePath);
  return (candidate: string) =>
    roots.some((root) => {
      const relative = path.relative(root, candidate);
      return (
        !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
      );
    });
}

// Select the agent and its descendants' search path outside the checkout.
// Relative and empty PATH entries resolve against the child's untrusted cwd.
export async function resolveAgentExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
  isLocal: (candidate: string) => boolean,
  basePath?: string,
): Promise<string | undefined> {
  const trusted = new Set<string>();
  for (const entry of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    if (path.isAbsolute(entry) && !isLocal(entry)) {
      const directory = await fs.realpath(entry).catch(() => undefined);
      if (directory && !directory.includes(path.delimiter) && !isLocal(directory)) {
        trusted.add(directory);
      }
    }
  }
  if (!trusted.size) {
    return undefined;
  }
  delete env.Path;
  env.PATH = [...trusted].join(path.delimiter);
  if (process.platform === 'win32') {
    env.NoDefaultCurrentDirectoryInExePath = '1';
  }

  const explicit = command.includes('/') || command.includes('\\');
  const names =
    process.platform === 'win32' && !path.extname(command)
      ? [`${command}.exe`, command]
      : [command];
  for (const directory of explicit ? [basePath ?? process.cwd()] : trusted) {
    for (const name of names) {
      const filename = path.resolve(directory, name);
      if (isLocal(filename)) {
        continue;
      }
      try {
        const target = await fs.realpath(filename);
        if (!isLocal(target) && (await fs.stat(target)).isFile()) {
          await fs.access(target, constants.X_OK);
          return target;
        }
      } catch {
        // Missing or non-executable candidates are common on PATH.
      }
    }
  }
  return undefined;
}
