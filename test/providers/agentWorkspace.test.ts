import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  type AgentWorkspace,
  assertIsolatedWorkingDir,
  createAgentWorkspace,
  createAgentWorkspaceForConfig,
  getCopyWorkingDirMode,
  isAgentWorkspace,
} from '../../src/providers/agentWorkspace';
import { mockProcessEnv } from '../util/utils';

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-C',
      cwd,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort();
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A committed repository with README.md and src/app.txt. Returns its HEAD. */
function makeRepository(dir: string, files: Record<string, string> = {}): string {
  write(path.join(dir, 'README.md'), 'original\n');
  write(path.join(dir, 'src', 'app.txt'), 'app\n');
  for (const [name, content] of Object.entries(files)) {
    write(path.join(dir, name), content);
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return git(dir, 'rev-parse', 'HEAD');
}

describe('getCopyWorkingDirMode', () => {
  it('maps copy_working_dir values to a mode', () => {
    expect(getCopyWorkingDirMode(undefined)).toBeUndefined();
    expect(getCopyWorkingDirMode(false)).toBeUndefined();
    expect(getCopyWorkingDirMode(true)).toBe('auto');
    expect(getCopyWorkingDirMode('git')).toBe('git');
    expect(getCopyWorkingDirMode('copy')).toBe('copy');
  });

  it.each(['yes', 1, null])('rejects %s', (value) => {
    expect(() => getCopyWorkingDirMode(value)).toThrow(
      "copy_working_dir must be true, false, 'git', or 'copy'",
    );
  });
});

describe('agent workspaces', () => {
  let root: string;
  let workspaces: AgentWorkspace[];
  let restoreBasePath: string | undefined;

  const create = async (...args: Parameters<typeof createAgentWorkspace>) => {
    const workspace = await createAgentWorkspace(...args);
    workspaces.push(workspace);
    return workspace;
  };

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-test-')));
    workspaces = [];
    restoreBasePath = cliState.basePath;
  });

  afterEach(async () => {
    await Promise.all(workspaces.map((workspace) => workspace.remove()));
    cliState.basePath = restoreBasePath;
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('git repositories', () => {
    it('keeps an unchanged clone diff empty with global CRLF conversion enabled', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const configFile = path.join(root, 'global.gitconfig');
      write(configFile, '[core]\n\tautocrlf = true\n');
      const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
      try {
        const workspace = await create(source);
        expect(workspace.strategy).toBe('git');
        expect((await workspace.metadata()).workspaceDiff).toBe('');
      } finally {
        restoreEnv();
      }
    });

    it.each(['local-fixture.txt', 'node_modules/pkg/index.js'])(
      'preserves %s when git status is configured to hide untracked files',
      async (file) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': 'node_modules/\n' });
        git(source, 'config', 'status.showUntrackedFiles', 'no');
        write(path.join(source, file), 'local fixture\n');

        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.readFileSync(path.join(workspace.dir, file), 'utf8')).toBe('local fixture\n');
      },
    );

    it('clones a clean repository at its commit without writing to the source', async () => {
      const source = path.join(root, 'repo');
      const head = makeRepository(source);
      // A newer mtime makes the index stale, which a plain `git status` would rewrite.
      const later = new Date(Date.now() + 60_000);
      fs.utimesSync(path.join(source, 'README.md'), later, later);
      const indexBefore = fs.readFileSync(path.join(source, '.git', 'index'));
      const refsBefore = git(source, 'for-each-ref');

      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'changed by the agent\n');
      await workspace.metadata();

      expect(workspace.strategy).toBe('git');
      expect(isAgentWorkspace(workspace.dir)).toBe(true);
      expect(git(workspace.dir, 'rev-parse', 'HEAD')).toBe(head);
      // A push from the workspace has nowhere to go.
      expect(git(workspace.dir, 'remote')).toBe('');
      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('original\n');
      expect(fs.readFileSync(path.join(source, '.git', 'index'))).toEqual(indexBefore);
      expect(git(source, 'for-each-ref')).toBe(refsBefore);
    });

    it('records committed, uncommitted, new, and deleted files in the diff', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);

      write(path.join(workspace.dir, 'README.md'), 'original\ncommitted change\n');
      git(workspace.dir, 'commit', '-q', '-am', 'agent commit');
      fs.rmSync(path.join(workspace.dir, 'src', 'app.txt'));
      write(path.join(workspace.dir, 'notes', 'new.txt'), 'new file\n');

      const metadata = await workspace.metadata();

      expect(metadata.workingDir).toBe(workspace.dir);
      expect(metadata.workspaceDiff).toContain('+committed change');
      expect(metadata.workspaceDiff).toContain('diff --git a/src/app.txt b/src/app.txt');
      expect(metadata.workspaceDiff).toContain('deleted file mode');
      expect(metadata.workspaceDiff).toContain('+++ b/notes/new.txt');
    });

    it.each(['auto', 'git'] as const)(
      'rejects tracked absolute links back into the source in %s mode',
      async (mode) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        fs.symlinkSync(path.join(source, 'README.md'), path.join(source, 'linked-readme'));
        git(source, 'add', 'linked-readme');
        git(source, 'commit', '-q', '-m', 'tracked link');

        await expect(create(source, mode)).rejects.toThrow('links outside working_dir');
        expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('original\n');
      },
    );

    it('rejects tracked links that escape through another link', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      fs.symlinkSync('.', path.join(source, 'alias'));
      fs.symlinkSync('alias/../README.md', path.join(source, 'escape'));
      git(source, 'add', 'alias', 'escape');
      git(source, 'commit', '-q', '-m', 'tracked links');

      await expect(create(source, 'git')).rejects.toThrow();
    });

    it('keeps tracked relative links inside the clone', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      fs.symlinkSync('README.md', path.join(source, 'linked-readme'));
      git(source, 'add', 'linked-readme');
      git(source, 'commit', '-q', '-m', 'tracked link');

      const workspace = await create(source);
      fs.writeFileSync(path.join(workspace.dir, 'linked-readme'), 'changed\n');

      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('original\n');
      expect((await workspace.metadata()).workspaceDiff).toContain('+changed');
    });

    it('truncates a long diff', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'big.txt'), 'x'.repeat(150_000));

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toMatch(/\n\[diff truncated after 100000 characters\]$/);
    });

    it("does not run filters defined in the workspace's own git config", async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      const marker = path.join(root, 'filter-ran');
      const filter = path.join(root, 'filter.cjs');
      write(
        filter,
        `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');process.stdin.pipe(process.stdout);`,
      );
      git(
        workspace.dir,
        'config',
        'filter.agent.clean',
        `node "${filter.split(path.sep).join('/')}"`,
      );
      write(path.join(workspace.dir, '.gitattributes'), '* filter=agent\n');
      write(path.join(workspace.dir, 'README.md'), 'changed\n');
      // The filter runs for git commands that use the workspace's configuration.
      git(workspace.dir, 'add', 'README.md');
      expect(fs.existsSync(marker)).toBe(true);
      fs.rmSync(marker);

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toContain('+changed');
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('never writes to the source repository, even for a filter the agent selects', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const marker = path.join(root, 'filter-ran');
      const filter = path.join(root, 'filter.cjs');
      // Like git-lfs, the filter also writes into the repository git runs it for.
      write(
        filter,
        [
          "const fs = require('fs');",
          `fs.writeFileSync(${JSON.stringify(marker)}, 'x');`,
          "fs.writeFileSync(require('path').join(process.env.GIT_DIR, 'filter-output'), 'x');",
          'process.stdin.pipe(process.stdout);',
        ].join('\n'),
      );
      // A filter from the user's git config, which a .gitattributes file can select.
      const userConfig = path.join(root, 'gitconfig');
      write(userConfig, `[filter "user"]\n\tclean = node "${filter.split(path.sep).join('/')}"\n`);
      const gitFilesBefore = listFiles(path.join(source, '.git'));
      const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: userConfig });
      let workspaceDiff: string | undefined;
      try {
        const workspace = await create(source);
        write(path.join(workspace.dir, '.gitattributes'), '* filter=user\n');
        write(path.join(workspace.dir, 'README.md'), 'changed\n');
        ({ workspaceDiff } = await workspace.metadata());
      } finally {
        restoreEnv();
      }

      expect(workspaceDiff).toContain('+changed');
      expect(listFiles(path.join(source, '.git'))).toEqual(gitFilesBefore);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('ignores links the agent plants next to its workspace', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      const victim = path.join(root, 'victim.txt');
      write(victim, 'keep me\n');
      const victimDir = path.join(root, 'victim-dir');
      fs.mkdirSync(victimDir);
      // An agent that can write to the temp directory knows the workspace's parent.
      const parent = path.dirname(workspace.dir);
      fs.symlinkSync(victim, path.join(parent, 'index'));
      fs.symlinkSync(victimDir, path.join(parent, 'objects'));
      write(path.join(workspace.dir, 'README.md'), 'changed\n');

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toContain('+changed');
      expect(fs.readFileSync(victim, 'utf8')).toBe('keep me\n');
      expect(fs.readdirSync(victimDir)).toEqual([]);
    });

    it('does not invoke user git filters while diffing agent-controlled files', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitattributes': '*.txt filter=user\n' });
      const workspace = await create(source);
      const marker = path.join(root, 'filter-ran');
      const filter = path.join(root, 'filter.cjs');
      write(filter, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
      const userConfig = path.join(root, 'user.gitconfig');
      write(userConfig, `[filter "user"]\n clean = node "${filter.split(path.sep).join('/')}"\n`);
      write(path.join(workspace.dir, 'src', 'app.txt'), 'changed\n');
      const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: userConfig });
      try {
        const { workspaceDiff } = await workspace.metadata();
        expect(fs.existsSync(marker)).toBe(false);
        expect(workspaceDiff).toContain('+changed');
      } finally {
        restoreEnv();
      }
    });

    it('does not diff a workspace the agent replaced with a link', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      const secrets = path.join(root, 'secrets');
      write(path.join(secrets, 'README.md'), 'secret\n');
      fs.renameSync(workspace.dir, `${workspace.dir}-moved`);
      fs.symlinkSync(secrets, workspace.dir);

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it('clones a linked worktree at its own commit', async () => {
      const main = path.join(root, 'main');
      makeRepository(main);
      const linked = path.join(root, 'linked');
      git(main, 'worktree', 'add', '-q', linked, '-b', 'feature');
      write(path.join(linked, 'README.md'), 'feature\n');
      git(linked, 'commit', '-q', '-am', 'feature commit');
      const linkedHead = git(linked, 'rev-parse', 'HEAD');
      const worktreesBefore = git(main, 'worktree', 'list', '--porcelain');

      const workspace = await create(linked);
      write(path.join(workspace.dir, 'README.md'), 'changed by the agent\n');

      expect(workspace.strategy).toBe('git');
      expect(git(workspace.dir, 'rev-parse', 'HEAD')).toBe(linkedHead);
      expect(fs.readFileSync(path.join(linked, 'README.md'), 'utf8')).toBe('feature\n');
      expect(git(linked, 'rev-parse', 'HEAD')).toBe(linkedHead);
      expect(git(main, 'worktree', 'list', '--porcelain')).toBe(worktreesBefore);
    });

    it('copies a repository with uncommitted changes, which git mode rejects', async () => {
      const source = path.join(root, 'repo');
      const head = makeRepository(source);
      write(path.join(source, 'README.md'), 'uncommitted\n');

      const workspace = await create(source);
      git(workspace.dir, 'commit', '-q', '-am', 'agent commit');

      expect(workspace.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace.dir, 'README.md'), 'utf8')).toBe('uncommitted\n');
      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
      expect(git(source, 'rev-parse', 'HEAD')).toBe(head);
      await expect(createAgentWorkspace(source, 'git')).rejects.toThrow(
        'whose files all match its current commit',
      );
    });

    it.each(['--assume-unchanged', '--skip-worktree'])(
      'copies a repository with %s files, which git status does not report',
      async (flag) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        write(path.join(source, 'README.md'), 'hidden local change\n');
        git(source, 'update-index', flag, 'README.md');

        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.readFileSync(path.join(workspace.dir, 'README.md'), 'utf8')).toBe(
          'hidden local change\n',
        );
        await expect(createAgentWorkspace(source, 'git')).rejects.toThrow(
          'whose files all match its current commit',
        );
      },
    );

    it('copies ignored files unless git mode is requested', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'node_modules/\n' });
      write(path.join(source, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');

      const copied = await create(source);
      const cloned = await create(source, 'git');

      expect(copied.strategy).toBe('copy');
      expect(fs.existsSync(path.join(copied.dir, 'node_modules', 'pkg', 'index.js'))).toBe(true);
      expect(cloned.strategy).toBe('git');
      expect(fs.existsSync(path.join(cloned.dir, 'node_modules'))).toBe(false);
    });

    it('copies a subdirectory of a repository', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);

      const workspace = await create(path.join(source, 'src'));

      expect(workspace.strategy).toBe('copy');
      expect(fs.readdirSync(workspace.dir)).toEqual(['app.txt']);
    });

    it('rejects repositories with submodules', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitmodules': '[submodule "lib"]\n\tpath = lib\n' });

      await expect(createAgentWorkspace(source)).rejects.toThrow(
        'copy_working_dir does not support git submodules yet',
      );
    });

    it('ignores repository variables inherited from a git hook', async () => {
      const source = path.join(root, 'repo');
      const head = makeRepository(source);
      const other = path.join(root, 'other');
      makeRepository(other, { 'other.txt': 'other\n' });
      const restoreEnv = mockProcessEnv({
        GIT_DIR: path.join(other, '.git'),
        GIT_INDEX_FILE: path.join(other, '.git', 'index'),
        GIT_WORK_TREE: other,
      });
      let workspace: AgentWorkspace;
      try {
        workspace = await create(source);
        write(path.join(workspace.dir, 'README.md'), 'changed\n');
        expect((await workspace.metadata()).workspaceDiff).toContain('+changed');
      } finally {
        restoreEnv();
      }

      expect(workspace.strategy).toBe('git');
      expect(git(workspace.dir, 'rev-parse', 'HEAD')).toBe(head);
      expect(fs.existsSync(path.join(workspace.dir, 'other.txt'))).toBe(false);
    });
  });

  describe('copies', () => {
    it('rejects symbolic git metadata that redirects the working tree to the source', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      git(source, 'config', 'core.worktree', source);
      fs.renameSync(path.join(source, '.git'), path.join(source, 'metadata'));
      fs.symlinkSync('metadata', path.join(source, '.git'));
      write(path.join(source, 'README.md'), 'uncommitted\n');

      await expect(create(source, 'copy')).rejects.toThrow('symbolic .git metadata');
      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
    });

    it('preserves relative links that stay inside working_dir', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'fixture');
      write(path.join(source, 'data.txt'), 'data\n');
      fs.symlinkSync('../data.txt', path.join(root, 'fixture', 'link-parent'), 'file');
      fs.mkdirSync(path.join(source, 'bin'));
      fs.symlinkSync('../data.txt', path.join(source, 'bin', 'data'));

      await expect(createAgentWorkspace(source)).rejects.toThrow('links outside working_dir');
      fs.rmSync(path.join(source, 'link-parent'));
      const workspace = await create(source);

      expect(fs.readlinkSync(path.join(workspace.dir, 'bin', 'data'))).toBe('../data.txt');
      expect(fs.readFileSync(path.join(workspace.dir, 'bin', 'data'), 'utf8')).toBe('data\n');
    });

    it('rejects absolute links', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'fixture');
      write(path.join(root, 'outside.txt'), 'outside\n');
      fs.mkdirSync(source);
      fs.symlinkSync(path.join(root, 'outside.txt'), path.join(source, 'outside'));

      await expect(createAgentWorkspace(source)).rejects.toThrow(
        `copy_working_dir cannot copy ${path.join(source, 'outside')}: it links outside working_dir`,
      );
    });

    it('rejects relative links that escape through another link', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'fixture');
      write(path.join(root, 'outside.txt'), 'outside\n');
      fs.mkdirSync(source);
      fs.symlinkSync('.', path.join(source, 'alias'));
      // Lexically inside fixture, but alias resolves before .. is traversed.
      fs.symlinkSync('alias/../outside.txt', path.join(source, 'escape'));

      await expect(create(source, 'copy')).rejects.toThrow('links outside working_dir');
    });

    it('rejects copied git metadata that redirects its working tree to the source', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      git(source, 'config', 'core.worktree', source);
      write(path.join(source, 'README.md'), 'uncommitted\n');

      await expect(create(source)).rejects.toThrow('core.worktree');
      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
    });

    it('keeps a relative git working tree inside the copy', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      git(source, 'config', 'core.worktree', '..');
      write(path.join(source, 'README.md'), 'uncommitted\n');

      const workspace = await create(source);
      git(workspace.dir, 'checkout', '--', 'README.md');

      expect(fs.readFileSync(path.join(workspace.dir, 'README.md'), 'utf8')).toBe('original\n');
      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
    });

    it('rejects copied git metadata with a shared common directory', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const linked = path.join(root, 'linked');
      git(source, 'worktree', 'add', '-q', linked, '-b', 'feature');
      const gitDir = git(linked, 'rev-parse', '--absolute-git-dir');
      fs.unlinkSync(path.join(linked, '.git'));
      fs.cpSync(gitDir, path.join(linked, '.git'), { recursive: true });
      // A directory-shaped gitdir can still share HEAD, refs, and objects elsewhere.
      fs.writeFileSync(path.join(linked, '.git', 'commondir'), path.join(source, '.git'));

      await expect(create(linked, 'copy')).rejects.toThrow('shares a git common directory');
    });

    it('rejects special files', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'fixture');
      fs.mkdirSync(source);
      const socket = createServer();
      await new Promise<void>((resolve) => socket.listen(path.join(source, 'sock'), resolve));
      try {
        await expect(createAgentWorkspace(source)).rejects.toThrow(
          'it is not a regular file or directory',
        );
      } finally {
        await new Promise<void>((resolve) => socket.close(() => resolve()));
      }
    });

    it('rejects a .git file, which points at another repository', async () => {
      const source = path.join(root, 'fixture');
      write(path.join(source, '.git'), `gitdir: ${path.join(root, 'elsewhere')}\n`);

      await expect(createAgentWorkspace(source)).rejects.toThrow(
        'it belongs to a git worktree or submodule',
      );
    });

    it('rejects a missing working_dir and leaves nothing behind', async () => {
      // Workspaces are created under os.tmpdir(), which other test files share, so point it
      // at a directory only this test uses.
      const tempDir = path.join(root, 'tmp');
      fs.mkdirSync(tempDir);
      const tmpdir = vi.spyOn(os, 'tmpdir').mockReturnValue(tempDir);
      try {
        await expect(createAgentWorkspace(path.join(root, 'missing'))).rejects.toThrow(
          'copy_working_dir: working_dir does not exist',
        );
        write(path.join(root, 'fixture', '.git'), 'gitdir: nowhere\n');
        await expect(createAgentWorkspace(path.join(root, 'fixture'))).rejects.toThrow(
          'it belongs to a git worktree or submodule',
        );
      } finally {
        tmpdir.mockRestore();
      }

      expect(fs.readdirSync(tempDir)).toEqual([]);
    });
  });

  it('removes the workspace and forgets it', async () => {
    const source = path.join(root, 'fixture');
    write(path.join(source, 'file.txt'), 'content\n');
    const workspace = await create(source, 'copy');

    await workspace.remove();
    await workspace.remove();

    expect(fs.existsSync(path.dirname(workspace.dir))).toBe(false);
    expect(isAgentWorkspace(workspace.dir)).toBe(false);
  });

  describe('assertIsolatedWorkingDir', () => {
    it('allows calls without copy_working_dir', () => {
      expect(assertIsolatedWorkingDir({ working_dir: root })).toBe(false);
      expect(assertIsolatedWorkingDir({ working_dir: root, copy_working_dir: false })).toBe(false);
    });

    it('allows only live workspaces when copy_working_dir is set', async () => {
      const source = path.join(root, 'fixture');
      write(path.join(source, 'file.txt'), 'content\n');
      const workspace = await create(source);
      const message = 'This call was not made by an eval step';

      expect(assertIsolatedWorkingDir({ working_dir: workspace.dir, copy_working_dir: true })).toBe(
        true,
      );
      expect(assertIsolatedWorkingDir({ working_dir: workspace.dir })).toBe(true);
      expect(() =>
        assertIsolatedWorkingDir({ working_dir: source, copy_working_dir: true }),
      ).toThrow(message);
      expect(() => assertIsolatedWorkingDir({ copy_working_dir: 'copy' })).toThrow(message);
      await workspace.remove();
      expect(() =>
        assertIsolatedWorkingDir({ working_dir: workspace.dir, copy_working_dir: true }),
      ).toThrow(message);
    });

    it.each(['workspace', 'parent'])(
      'rejects a live workspace whose %s was replaced with a link',
      async (part) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'fixture');
        write(path.join(source, 'file.txt'), 'content\n');
        const workspace = await create(source, 'copy');
        const replaced = part === 'workspace' ? workspace.dir : path.dirname(workspace.dir);
        const moved = `${replaced}-moved`;
        fs.renameSync(replaced, moved);
        fs.symlinkSync(moved, replaced);
        try {
          expect(() => isAgentWorkspace(workspace.dir)).toThrow('workspace is no longer available');
          expect(() =>
            assertIsolatedWorkingDir({ working_dir: workspace.dir, copy_working_dir: true }),
          ).toThrow('workspace is no longer available');
        } finally {
          fs.unlinkSync(replaced);
          fs.renameSync(moved, replaced);
        }
      },
    );
  });

  describe('createAgentWorkspaceForConfig', () => {
    it('does nothing without copy_working_dir', async () => {
      await expect(createAgentWorkspaceForConfig({ working_dir: root })).resolves.toBeUndefined();
      await expect(createAgentWorkspaceForConfig(undefined)).resolves.toBeUndefined();
    });

    it('renders working_dir and resolves it against the config directory', async () => {
      write(path.join(root, 'fixtures', 'app', 'file.txt'), 'content\n');
      cliState.basePath = root;

      const workspace = await createAgentWorkspaceForConfig(
        { working_dir: 'fixtures/{{ fixture }}', copy_working_dir: 'copy' },
        { fixture: 'app' },
      );
      if (workspace) {
        workspaces.push(workspace);
      }

      expect(workspace?.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace!.dir, 'file.txt'), 'utf8')).toBe('content\n');
    });

    it('requires working_dir', async () => {
      await expect(createAgentWorkspaceForConfig({ copy_working_dir: true })).rejects.toThrow(
        'copy_working_dir requires working_dir',
      );
    });
  });
});
