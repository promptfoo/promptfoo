/**
 * Isolated workspaces for agentic providers (`copy_working_dir`).
 *
 * For each eval step, `promptfoo eval` creates a fresh workspace from the provider's
 * `working_dir`, passes it to the provider as that call's `working_dir`, and removes it once
 * the step's assertions have run. Clean Git repositories are cloned when checkout preserves
 * their files; otherwise the directory is copied. Clones leave the source untouched and record
 * the agent's changes as a diff.
 *
 * A workspace keeps one call from affecting another; it is not a security sandbox.
 */
import { execFile } from 'node:child_process';
import { constants, lstatSync, realpathSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { onExit } from 'signal-exit';
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
  objectFormat: string;
}

const MAX_DIFF_LENGTH = 100_000;
const MAX_GIT_BUFFER = 64 * 1024 * 1024;
const MAX_SHARED_INDEX_FILES = 64;
const GIT_TIMEOUT_MS = 30_000;
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
const liveWorkspaces = new Set<string>();
// Pending or failed removals still need synchronous cleanup on exit.
const cleanupRoots = new Set<string>();
let exitCleanupRegistered = false;

/** Clear Git repository selectors from a per-call subprocess environment. */
export function clearRepositoryEnv(env: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(env)) {
    const canonicalName = process.platform === 'win32' ? name.toUpperCase() : name;
    if (REPOSITORY_ENV_VARS.includes(canonicalName)) {
      delete env[name];
    }
  }
}

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

/** Whether `dir` is registered. Throws if a registered workspace was deleted or replaced. */
export function isAgentWorkspace(dir: string): boolean {
  const resolved = path.resolve(dir);
  if (!liveWorkspaces.has(resolved)) {
    return false;
  }
  try {
    // The agent can replace the workspace or its parent with a link after its call.
    if (lstatSync(resolved).isDirectory() && realpathSync(resolved) === resolved) {
      return true;
    }
  } catch {
    // A missing managed workspace must not make graders fall back to another directory.
  }
  throw new Error(`copy_working_dir workspace is no longer available or was replaced: ${resolved}`);
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
  const mode = getCopyWorkingDirMode(config.copy_working_dir);
  if (typeof config.working_dir === 'string' && isAgentWorkspace(config.working_dir)) {
    return true;
  }
  if (!mode) {
    return false;
  }
  throw new Error(
    'copy_working_dir runs each eval step in a fresh copy of working_dir, which promptfoo eval ' +
      'creates for the step. This call was not made by an eval step, so it would run in ' +
      'working_dir itself and was not made.',
  );
}

async function git(
  args: string[],
  {
    cwd,
    env,
    input,
    signal,
  }: { cwd?: string; env?: Record<string, string>; input?: string; signal?: AbortSignal } = {},
): Promise<string> {
  signal?.throwIfAborted();
  const baseEnv = { ...process.env };
  clearRepositoryEnv(baseEnv);
  const command = execFileAsync('git', cwd ? ['-C', cwd, ...args] : args, {
    env: { ...baseEnv, ...env },
    maxBuffer: MAX_GIT_BUFFER,
    timeout: GIT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    signal,
  });
  if (input !== undefined) {
    // Cancellation can close the pipe while input is still being written.
    command.child.stdin?.on('error', () => {});
    command.child.stdin?.end(input);
  }
  const { stdout } = await command;
  return stdout;
}

class UnsupportedGitAttributesError extends Error {}
class UnsupportedGitSubmoduleError extends Error {}

/**
 * The repository to clone when `source` is the root of a git repository whose working tree
 * matches its current commit. `allowIgnored` also accepts ignored files, which a clone leaves
 * out.
 */
async function getCloneableRepository(
  source: string,
  allowIgnored: boolean,
  signal?: AbortSignal,
): Promise<RepositoryState | undefined> {
  try {
    const [topLevel, objectsDir, infoAttributes, objectFormat, head] = (
      await git(
        [
          'rev-parse',
          '--show-toplevel',
          '--path-format=absolute',
          '--git-path',
          'objects',
          '--git-path',
          'info/attributes',
          '--show-object-format',
          'HEAD',
        ],
        { cwd: source, signal },
      )
    )
      .trim()
      .split('\n');
    if ((await fs.realpath(topLevel)) !== source) {
      return undefined;
    }
    // Older Git silently ignores GIT_ATTR_SOURCE; the equivalent option fails explicitly.
    await git(['--attr-source=' + head, 'check-attr', '-z', 'diff', '--', '.'], {
      cwd: source,
      signal,
    }).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 129) {
        throw new UnsupportedGitAttributesError(
          "copy_working_dir: 'git' requires Git with --attr-source support (2.41 or newer); " +
            "upgrade Git or use 'copy' or true.",
        );
      }
      throw error;
    });
    const trackedEntries = (
      await git(['ls-files', '--stage', '-z'], { cwd: source, signal })
    ).split('\0');
    if (trackedEntries.some((entry) => entry.startsWith('160000 '))) {
      throw new UnsupportedGitSubmoduleError(
        `copy_working_dir does not support git submodules yet: ${source}`,
      );
    }
    if (!allowIgnored) {
      // Cloning loses repository attribute overrides; diffing also ignores configured global ones.
      const configKeys = await git(['config', '--name-only', '--list'], { cwd: source, signal });
      if (
        configKeys.split('\n').includes('core.attributesfile') ||
        (await fs.lstat(infoAttributes).catch(() => undefined))
      ) {
        return undefined;
      }
    }
    const trackedPaths = trackedEntries
      .map((entry) => entry.slice(entry.indexOf('\t') + 1))
      .join('\0');
    const attributes = (
      await git(['check-attr', '-z', '--stdin', 'filter', 'ident', 'working-tree-encoding'], {
        cwd: source,
        input: trackedPaths,
        signal,
      })
    ).split('\0');
    for (let index = 0; index + 2 < attributes.length; index += 3) {
      const attribute = attributes[index + 1];
      const value = attributes[index + 2];
      if (value === 'unspecified' || value === 'unset') {
        continue;
      }
      if (attribute === 'filter') {
        throw new UnsupportedGitAttributesError(
          "copy_working_dir: 'git' does not support tracked Git filter attributes; use 'copy' or true to preserve materialized files.",
        );
      }
      // Ident expansion and encoding conversion can change bytes without dirtying Git status.
      if (!allowIgnored) {
        return undefined;
      }
    }
    if (!allowIgnored) {
      const endings = await git(['ls-files', '--eol', '-z'], { cwd: source, signal });
      if (
        endings.split('\0').some((entry) => {
          const match = /^i\/(\S+)\s+w\/(\S+)\s+attr\/(.*?)\t/.exec(entry);
          if (!match) {
            return false;
          }
          const [, index, working, attributes] = match;
          return (
            index !== working ||
            (attributes.includes('eol=crlf') && (working === 'lf' || working === 'mixed'))
          );
        })
      ) {
        return undefined;
      }
    }
    // --no-optional-locks: a plain status refreshes, and so rewrites, the source's index.
    const status = await git(
      [
        '--no-optional-locks',
        // Compare materialized modes and links even when the source config ignores them.
        ...(process.platform === 'win32' ? [] : ['-c', 'core.filemode=true']),
        '-c',
        'core.symlinks=true',
        'status',
        '--porcelain',
        '--untracked-files=all',
        ...(allowIgnored ? [] : ['--ignored']),
      ],
      { cwd: source, signal },
    );
    if (status.trim()) {
      return undefined;
    }
    // Status does not report files marked assume-unchanged or skip-worktree (which includes
    // a sparse checkout), so they can differ from the commit. `ls-files -v` tags them with a
    // lowercase letter or S.
    const files = await git(['--no-optional-locks', 'ls-files', '-v'], { cwd: source, signal });
    return /^[a-zS]/m.test(files) ? undefined : { head, objectsDir, objectFormat };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && 'killed' in error && error.killed) {
      throw error;
    }
    if (
      error instanceof UnsupportedGitSubmoduleError ||
      (allowIgnored && error instanceof UnsupportedGitAttributesError)
    ) {
      throw error;
    }
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

async function assertCopyable(
  entry: string,
  root: string,
  signal?: AbortSignal,
  destinationRoot = root,
): Promise<boolean> {
  signal?.throwIfAborted();
  const stat = await fs.lstat(entry);
  const destination = path.join(destinationRoot, path.relative(root, entry));
  if (stat.isSymbolicLink()) {
    if (path.basename(entry) === '.git') {
      throw new Error(
        `copy_working_dir cannot copy ${entry}: symbolic .git metadata can share another repository`,
      );
    }
    const target = await fs.readlink(entry);
    if (
      path.isAbsolute(target) ||
      !isInside(root, path.resolve(path.dirname(entry), target)) ||
      !isInside(destinationRoot, path.resolve(path.dirname(destination), target)) ||
      !isInside(root, await fs.realpath(entry))
    ) {
      throw new Error(`copy_working_dir cannot copy ${entry}: it links outside working_dir`);
    }
  } else if (stat.isDirectory() && path.basename(entry) === '.git') {
    const worktree = (
      await git(
        [
          '--git-dir',
          entry,
          'config',
          '--includes',
          '--path',
          '--default',
          '',
          '--get',
          'core.worktree',
        ],
        { signal },
      )
    ).trim();
    if (
      worktree &&
      (path.isAbsolute(worktree) ||
        !isInside(root, path.resolve(entry, worktree)) ||
        !isInside(destinationRoot, path.resolve(destination, worktree)))
    ) {
      throw new Error(
        `copy_working_dir cannot copy ${entry}: core.worktree would point outside the copy. ` +
          'Commit the changes so working_dir is cloned instead.',
      );
    }
    if (await fs.lstat(path.join(entry, 'commondir')).catch(() => undefined)) {
      throw new Error(`copy_working_dir cannot copy ${entry}: it shares a git common directory`);
    }
    if (await fs.lstat(path.join(entry, 'worktrees')).catch(() => undefined)) {
      throw new Error(
        `copy_working_dir cannot copy ${entry}: it contains linked worktree metadata; use a clean clone instead`,
      );
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
  const signals = ['SIGINT', 'SIGTERM'] as const;
  const existingListeners = new Set(signals.flatMap((signal) => process.rawListeners(signal)));
  // A call still running when the process exits (e.g. after an eval timeout) never reaches
  // its cleanup. `exit` handlers must be synchronous.
  onExit(() => {
    for (const root of cleanupRoots) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Best effort: the process is exiting.
      }
    }
  });
  // Observe the signal before existing once-handlers remove themselves during graceful shutdown.
  for (const signal of signals) {
    for (const listener of process.rawListeners(signal) as NodeJS.SignalsListener[]) {
      if (!existingListeners.has(listener)) {
        process.removeListener(signal, listener);
        process.prependListener(signal, listener);
      }
    }
  }
}

async function copyIndexFile(
  indexPath: string,
  destination: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<number | undefined> {
  signal?.throwIfAborted();
  // A nonblocking open prevents a replacement FIFO from hanging between checking and reading.
  const flags =
    constants.O_RDONLY |
    (process.platform === 'win32' ? 0 : constants.O_NONBLOCK | constants.O_NOFOLLOW);
  if (
    process.platform === 'win32' &&
    (await fs.lstat(indexPath).catch(() => undefined))?.isSymbolicLink()
  ) {
    throw new Error('workspace Git index must not be a symbolic link');
  }
  const index = await fs.open(indexPath, flags).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!index) {
    return undefined;
  }
  try {
    const stat = await index.stat();
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new Error(
        `workspace Git indexes must be regular files totaling at most ${MAX_GIT_BUFFER} bytes`,
      );
    }
    const contents = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < contents.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await index.read(contents, offset, contents.length - offset, offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    await fs.writeFile(destination, contents.subarray(0, offset));
    return offset;
  } finally {
    await index.close();
  }
}

async function copyWorkspaceIndex(
  dir: string,
  destination: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const gitDir = path.join(dir, '.git');
  const indexSize = await copyIndexFile(
    path.join(gitDir, 'index'),
    destination,
    MAX_GIT_BUFFER,
    signal,
  );
  if (indexSize === undefined) {
    return false;
  }
  // A split index resolves its shared file beside GIT_INDEX_FILE. Keep the snapshot bounded
  // even when the workspace contains many stale or agent-created shared indexes.
  let remainingBytes = MAX_GIT_BUFFER - indexSize;
  let sharedCount = 0;
  for await (const entry of await fs.opendir(gitDir)) {
    signal?.throwIfAborted();
    if (!/^sharedindex\.(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(entry.name)) {
      continue;
    }
    if (++sharedCount > MAX_SHARED_INDEX_FILES) {
      throw new Error(
        `workspace Git index snapshot exceeds ${MAX_SHARED_INDEX_FILES} shared files`,
      );
    }
    remainingBytes -=
      (await copyIndexFile(
        path.join(gitDir, entry.name),
        path.join(path.dirname(destination), entry.name),
        remainingBytes,
        signal,
      )) ?? 0;
  }
  return true;
}

/**
 * Diff against the cloned commit using a scratch repository. The agent's Git configuration
 * is never loaded, and its index is copied through a checked file handle before Git reads it.
 * User/system filters are disabled; attributes and ignore rules come from the cloned commit.
 */
async function getWorkspaceDiff(
  dir: string,
  repo: RepositoryState,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (!isAgentWorkspace(dir)) {
    // Otherwise the diff would copy whatever the link points to into the results.
    throw new Error('the workspace directory was replaced by a link');
  }
  const scratch = await fs.mkdtemp(path.join(path.dirname(dir), 'diff-'));
  try {
    const gitDir = path.join(scratch, 'git');
    const isolatedConfig = {
      // Git for Windows accepts /dev/null, but rejects Node's \\.\nul spelling.
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TEMPLATE_DIR: '',
    };
    await git(['init', '--quiet', '--bare', `--object-format=${repo.objectFormat}`, gitDir], {
      env: isolatedConfig,
      signal,
    });
    await fs.writeFile(path.join(gitDir, 'objects', 'info', 'alternates'), `${repo.objectsDir}\n`);
    const env = {
      ...isolatedConfig,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: dir,
      GIT_ATTR_SOURCE: repo.head,
    };
    await git(['read-tree', repo.head], { env, signal });
    // Check new files against committed ignore rules, not rules the agent can replace.
    const ignoreDir = path.join(scratch, 'ignore');
    await fs.mkdir(ignoreDir);
    const ignoreFiles = await git(['ls-files', '-z', '--', '.gitignore', ':(glob)**/.gitignore'], {
      env,
      signal,
    });
    if (ignoreFiles) {
      await git(['checkout-index', '-z', '--stdin', `--prefix=${ignoreDir}${path.sep}`], {
        env,
        input: ignoreFiles,
        signal,
      });
    }
    const ignoreEnv = { ...env, GIT_WORK_TREE: ignoreDir };
    // Include ignored files the agent explicitly added, without loading its Git configuration.
    const workspaceIndex = path.join(scratch, 'workspace-index');
    const ignoredTracked = (await copyWorkspaceIndex(dir, workspaceIndex, signal))
      ? await git(['ls-files', '-z', '--cached', '--ignored', '--exclude-standard'], {
          env: { ...ignoreEnv, GIT_INDEX_FILE: workspaceIndex },
          signal,
        })
      : '';
    const newFiles = new Set<string>();
    for (const file of ignoredTracked.split('\0').filter(Boolean)) {
      const fullPath = path.resolve(dir, file);
      if (isInside(dir, fullPath) && (await fs.lstat(fullPath).catch(() => undefined))) {
        newFiles.add(file);
      }
    }
    const untracked = await git(['ls-files', '-z', '--others'], { env, signal });
    if (untracked) {
      const ignored = await git(['check-ignore', '--no-index', '-z', '--stdin'], {
        env: ignoreEnv,
        input: untracked,
        signal,
      }).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 1) {
          return ''; // check-ignore returns 1 when no paths are ignored.
        }
        throw error;
      });
      const ignoredFiles = new Set(ignored.split('\0'));
      for (const file of untracked.split('\0').filter(Boolean)) {
        if (!ignoredFiles.has(file)) {
          newFiles.add(file);
        }
      }
    }
    if (newFiles.size > 0) {
      await git(
        ['--literal-pathspecs', 'add', '--force', '--pathspec-from-file=-', '--pathspec-file-nul'],
        {
          env,
          input: `${[...newFiles].join('\0')}\0`,
          signal,
        },
      );
    }
    await git(['-c', 'core.fsmonitor=false', 'add', '--update'], { env, signal });
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
      { env, signal },
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
  signal?: AbortSignal,
): Promise<AgentWorkspace> {
  signal?.throwIfAborted();
  const realSource = await fs.realpath(source).catch(() => {
    throw new Error(`copy_working_dir: working_dir does not exist: ${source}`);
  });
  if (!(await fs.stat(realSource)).isDirectory()) {
    throw new Error(`copy_working_dir requires working_dir to be a directory: ${source}`);
  }
  // `auto` clones only when the clone would contain exactly the files in working_dir.
  const repo =
    mode === 'copy' ? undefined : await getCloneableRepository(realSource, mode === 'git', signal);
  if (mode === 'git' && !repo) {
    throw new Error(
      "copy_working_dir: 'git' requires working_dir to be the root of a git repository whose " +
        `files all match its current commit, apart from ignored files: ${source}`,
    );
  }
  if (repo && (await fs.stat(path.join(realSource, '.gitmodules')).catch(() => undefined))) {
    throw new Error(`copy_working_dir does not support git submodules yet: ${source}`);
  }

  const tempDir = await fs.realpath(os.tmpdir());
  const tempParent = isInside(realSource, tempDir) ? path.dirname(realSource) : tempDir;
  if (isInside(realSource, tempParent)) {
    throw new Error(`copy_working_dir cannot create a workspace outside working_dir: ${source}`);
  }
  const root = await fs.realpath(await fs.mkdtemp(path.join(tempParent, 'promptfoo-workspace-')));
  const dir = path.join(root, 'workspace');
  liveWorkspaces.add(dir);
  cleanupRoots.add(root);
  registerExitCleanup();
  const remove = async () => {
    liveWorkspaces.delete(dir);
    try {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
      cleanupRoots.delete(root);
    } catch (error) {
      logger.warn(`[copy_working_dir] Could not remove workspace ${root}: ${error}`);
    }
  };

  try {
    if (repo) {
      await git(
        ['clone', '--quiet', '--shared', '--no-checkout', '--origin', 'origin', realSource, dir],
        {
          signal,
        },
      );
      await git(
        [
          '-c',
          'core.autocrlf=false',
          '-c',
          'core.eol=lf',
          '-c',
          'core.symlinks=true',
          'checkout',
          '--quiet',
          '--detach',
          repo.head,
        ],
        { cwd: dir, signal },
      );
      // Without a remote, a push from the agent cannot reach the source repository.
      await git(['remote', 'remove', 'origin'], { cwd: dir, signal });
      // Check links after checkout: ignored targets may exist only in the source repository.
      const trackedFiles = await git(['ls-files', '--stage', '-z'], { cwd: dir, signal });
      for (const entry of trackedFiles.split('\0')) {
        if (entry.startsWith('120000 ')) {
          await assertCopyable(path.join(dir, entry.slice(entry.indexOf('\t') + 1)), dir, signal);
        }
      }
    } else {
      await fs.cp(realSource, dir, {
        recursive: true,
        // Otherwise fs.cp rewrites relative links to absolute links into the source.
        verbatimSymlinks: true,
        errorOnExist: true,
        force: false,
        filter: (entry) => assertCopyable(entry, realSource, signal, dir),
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
        return { workingDir: dir, workspaceDiff: await getWorkspaceDiff(dir, repo, signal) };
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && 'killed' in error && error.killed) {
          throw error;
        }
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
  signal?: AbortSignal,
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
    signal,
  );
}
