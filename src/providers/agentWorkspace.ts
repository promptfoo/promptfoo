/**
 * Isolated workspaces for agentic providers (`copy_working_dir`).
 *
 * For each eval step, `promptfoo eval` creates a fresh workspace from the provider's
 * `working_dir`, passes it to the provider as that call's `working_dir`, and removes it once
 * the step's assertions have run. A git repository whose working tree matches its current
 * commit is cloned, which is fast, leaves the source repository untouched, and records the
 * agent's changes as a diff. Anything else is copied.
 *
 * A workspace keeps one call from affecting another; it is not a security sandbox.
 */
import { execFile } from 'node:child_process';
import { lstatSync, realpathSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import cliState from '../cliState';
import logger from '../logger';
import { renderVarsInObject } from '../util/render';
import { resolveAgenticWorkingDir } from './agentic-utils';

import type { VarValue } from '../types/index';

const execFileAsync = promisify(execFile);

export type AgentWorkspaceMode = 'auto' | 'git' | 'copy';

export interface AgentWorkspace {
  /** Directory the agent runs in. */
  readonly dir: string;
  readonly strategy: 'git' | 'copy';
  /** Response metadata describing the workspace, including the agent's diff for git workspaces. */
  metadata(): Promise<{ workingDir: string; workspaceDiff?: string }>;
  /** Delete the workspace. Never throws. */
  remove(): Promise<void>;
}

interface RepositoryState {
  head: string;
  objectsDir: string;
}

const MAX_DIFF_LENGTH = 100_000;
// Git variables that point a git command at a particular repository, set for example when
// promptfoo runs from a git hook. They are cleared so every command uses the repository
// chosen here (the list `git rev-parse --local-env-vars` prints, plus GIT_ATTR_SOURCE).
const REPOSITORY_ENV_VARS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_ATTR_SOURCE',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
];
// Workspace directory -> temporary root that contains it.
const liveWorkspaces = new Map<string, string>();
let exitCleanupRegistered = false;

/** Parse `copy_working_dir`: `true` picks git or copy automatically. */
export function getCopyWorkingDirMode(value: unknown): AgentWorkspaceMode | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }
  if (value === true) {
    return 'auto';
  }
  if (value === 'git' || value === 'copy') {
    return value;
  }
  throw new Error("copy_working_dir must be true, false, 'git', or 'copy'");
}

/** Whether `dir` is a workspace that this process created and has not removed. */
export function isAgentWorkspace(dir: string): boolean {
  const resolved = path.resolve(dir);
  if (!liveWorkspaces.has(resolved)) {
    return false;
  }
  try {
    // The agent can replace the workspace or its parent with a link after its call.
    return lstatSync(resolved).isDirectory() && realpathSync(resolved) === resolved;
  } catch {
    return false;
  }
}

/**
 * Check a provider call made with `copy_working_dir`. Returns true when the call runs in a
 * workspace, so the provider can skip its response cache. Throws when the call would run in
 * the original `working_dir`, which happens when something other than an eval step calls the
 * provider, such as a multi-turn redteam strategy or a script.
 */
export function assertIsolatedWorkingDir(config: {
  copy_working_dir?: unknown;
  working_dir?: unknown;
}): boolean {
  if (!getCopyWorkingDirMode(config.copy_working_dir)) {
    return false;
  }
  if (typeof config.working_dir === 'string' && isAgentWorkspace(config.working_dir)) {
    return true;
  }
  throw new Error(
    'copy_working_dir runs each eval step in a fresh copy of working_dir, which promptfoo eval ' +
      'creates for the step. This call was not made by an eval step, so it would run in ' +
      'working_dir itself and was not made.',
  );
}

async function git(
  args: string[],
  { cwd, env }: { cwd?: string; env?: Record<string, string> } = {},
): Promise<string> {
  const baseEnv = { ...process.env };
  for (const name of REPOSITORY_ENV_VARS) {
    delete baseEnv[name];
  }
  const { stdout } = await execFileAsync('git', cwd ? ['-C', cwd, ...args] : args, {
    env: { ...baseEnv, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * The repository to clone when `source` is the root of a git repository whose working tree
 * matches its current commit. `allowIgnored` also accepts ignored files, which a clone leaves
 * out.
 */
async function getCloneableRepository(
  source: string,
  allowIgnored: boolean,
): Promise<RepositoryState | undefined> {
  try {
    const [topLevel, objectsDir, head] = (
      await git(
        ['rev-parse', '--show-toplevel', '--path-format=absolute', '--git-path', 'objects', 'HEAD'],
        { cwd: source },
      )
    )
      .trim()
      .split('\n');
    if ((await fs.realpath(topLevel)) !== source) {
      return undefined;
    }
    // --no-optional-locks: a plain status refreshes, and so rewrites, the source's index.
    const status = await git(
      ['--no-optional-locks', 'status', '--porcelain', ...(allowIgnored ? [] : ['--ignored'])],
      { cwd: source },
    );
    if (status.trim()) {
      return undefined;
    }
    // Status does not report files marked assume-unchanged or skip-worktree (which includes
    // a sparse checkout), so they can differ from the commit. `ls-files -v` tags them with a
    // lowercase letter or S.
    const files = await git(['--no-optional-locks', 'ls-files', '-v'], { cwd: source });
    return /^[a-zS]/m.test(files) ? undefined : { head, objectsDir };
  } catch {
    // Not a git repository, a repository without commits, or git is not installed.
    return undefined;
  }
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function assertCopyable(entry: string, root: string): Promise<boolean> {
  const stat = await fs.lstat(entry);
  if (stat.isSymbolicLink()) {
    const target = await fs.readlink(entry);
    if (
      path.isAbsolute(target) ||
      !isInside(root, path.resolve(path.dirname(entry), target)) ||
      !isInside(root, await fs.realpath(entry))
    ) {
      throw new Error(`copy_working_dir cannot copy ${entry}: it links outside working_dir`);
    }
  } else if (stat.isDirectory() && path.basename(entry) === '.git') {
    const worktree = (
      await git([
        '--git-dir',
        entry,
        'config',
        '--includes',
        '--default',
        '',
        '--get',
        'core.worktree',
      ])
    ).trim();
    if (worktree && (path.isAbsolute(worktree) || !isInside(root, path.resolve(entry, worktree)))) {
      throw new Error(
        `copy_working_dir cannot copy ${entry}: core.worktree would point outside the copy. ` +
          'Commit the changes so working_dir is cloned instead.',
      );
    }
    if (await fs.lstat(path.join(entry, 'commondir')).catch(() => undefined)) {
      throw new Error(`copy_working_dir cannot copy ${entry}: it shares a git common directory`);
    }
  } else if (stat.isFile() && path.basename(entry) === '.git') {
    // A git worktree or submodule points at another repository, which the copy would share.
    throw new Error(
      `copy_working_dir cannot copy ${entry}: it belongs to a git worktree or submodule, whose ` +
        'repository a copy would share. Commit the changes so working_dir is cloned instead.',
    );
  } else if (!stat.isFile() && !stat.isDirectory()) {
    throw new Error(`copy_working_dir cannot copy ${entry}: it is not a regular file or directory`);
  }
  return true;
}

function registerExitCleanup(): void {
  if (exitCleanupRegistered) {
    return;
  }
  exitCleanupRegistered = true;
  // A call still running when the process exits (e.g. after an eval timeout) never reaches
  // its cleanup. `exit` handlers must be synchronous.
  process.once('exit', () => {
    for (const root of liveWorkspaces.values()) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Best effort: the process is exiting.
      }
    }
  });
}

/**
 * The agent's changes as a unified diff against the cloned commit, including changes it
 * committed. Everything in and around the workspace may have been written by the agent (a
 * sandboxed agent can often write to the whole temp directory), so none of it is trusted:
 *
 * - Git runs in a scratch repository created now, at an unpredictable path, never with the
 *   workspace's `.git`, whose config could define commands for git to run.
 * - The scratch repository reads the cloned commit from the source repository's objects,
 *   which git never writes to, so nothing is written to the source repository.
 * - User/system Git config and templates are disabled so attributes cannot invoke a
 *   configured filter on agent-controlled files. Attributes come from the cloned commit.
 */
async function getWorkspaceDiff(dir: string, repo: RepositoryState): Promise<string> {
  if (!isAgentWorkspace(dir)) {
    // Otherwise the diff would copy whatever the link points to into the results.
    throw new Error('the workspace directory was replaced by a link');
  }
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-workspace-diff-'));
  try {
    const gitDir = path.join(scratch, 'git');
    const isolatedConfig = {
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TEMPLATE_DIR: '',
    };
    await git(['init', '--quiet', '--bare', gitDir], { env: isolatedConfig });
    await fs.writeFile(path.join(gitDir, 'objects', 'info', 'alternates'), `${repo.objectsDir}\n`);
    const env = {
      ...isolatedConfig,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: dir,
      GIT_ATTR_SOURCE: repo.head,
    };
    await git(['read-tree', repo.head], { env });
    await git(['-c', 'core.fsmonitor=false', 'add', '--all'], { env });
    const diff = await git(
      [
        '-c',
        'core.fsmonitor=false',
        'diff',
        '--cached',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        repo.head,
      ],
      { env },
    );
    return diff.length > MAX_DIFF_LENGTH
      ? `${diff.slice(0, MAX_DIFF_LENGTH)}\n[diff truncated after ${MAX_DIFF_LENGTH} characters]`
      : diff;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Create a workspace from `source`, an absolute directory. */
export async function createAgentWorkspace(
  source: string,
  mode: AgentWorkspaceMode = 'auto',
): Promise<AgentWorkspace> {
  const realSource = await fs.realpath(source).catch(() => {
    throw new Error(`copy_working_dir: working_dir does not exist: ${source}`);
  });
  if (!(await fs.stat(realSource)).isDirectory()) {
    throw new Error(`copy_working_dir requires working_dir to be a directory: ${source}`);
  }
  // `auto` clones only when the clone would contain exactly the files in working_dir.
  const repo =
    mode === 'copy' ? undefined : await getCloneableRepository(realSource, mode === 'git');
  if (mode === 'git' && !repo) {
    throw new Error(
      "copy_working_dir: 'git' requires working_dir to be the root of a git repository whose " +
        `files all match its current commit, apart from ignored files: ${source}`,
    );
  }
  if (repo && (await fs.stat(path.join(realSource, '.gitmodules')).catch(() => undefined))) {
    throw new Error(`copy_working_dir does not support git submodules yet: ${source}`);
  }

  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-workspace-')));
  const dir = path.join(root, 'workspace');
  liveWorkspaces.set(dir, root);
  registerExitCleanup();
  const remove = async () => {
    liveWorkspaces.delete(dir);
    try {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
    } catch (error) {
      logger.warn(`[copy_working_dir] Could not remove workspace ${root}: ${error}`);
    }
  };

  try {
    if (repo) {
      await git(['clone', '--quiet', '--shared', '--no-checkout', realSource, dir]);
      await git(['checkout', '--quiet', '--detach', repo.head], { cwd: dir });
      // Without a remote, a push from the agent cannot reach the source repository.
      await git(['remote', 'remove', 'origin'], { cwd: dir });
    } else {
      await fs.cp(realSource, dir, {
        recursive: true,
        // Otherwise fs.cp rewrites relative links to absolute links into the source.
        verbatimSymlinks: true,
        errorOnExist: true,
        force: false,
        filter: (entry) => assertCopyable(entry, realSource),
      });
    }
  } catch (error) {
    await remove();
    throw error;
  }

  return {
    dir,
    strategy: repo ? 'git' : 'copy',
    remove,
    async metadata() {
      if (!repo) {
        return { workingDir: dir };
      }
      try {
        return { workingDir: dir, workspaceDiff: await getWorkspaceDiff(dir, repo) };
      } catch (error) {
        logger.warn(`[copy_working_dir] Could not compute the workspace diff: ${error}`);
        return { workingDir: dir };
      }
    },
  };
}

/**
 * Create the workspace for one eval step when `config`, a provider config merged with its
 * prompt config, sets `copy_working_dir`.
 */
export async function createAgentWorkspaceForConfig(
  config: { copy_working_dir?: unknown; working_dir?: unknown } | undefined,
  vars?: Record<string, VarValue>,
): Promise<AgentWorkspace | undefined> {
  const mode = getCopyWorkingDirMode(config?.copy_working_dir);
  if (!mode) {
    return undefined;
  }
  const workingDir = renderVarsInObject(config?.working_dir, vars);
  if (typeof workingDir !== 'string' || !workingDir) {
    throw new Error('copy_working_dir requires working_dir');
  }
  return createAgentWorkspace(
    resolveAgenticWorkingDir(workingDir, cliState.basePath) as string,
    mode,
  );
}
