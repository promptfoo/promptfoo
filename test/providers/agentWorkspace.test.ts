import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import {
  type AgentWorkspace,
  assertIsolatedWorkingDir,
  clearRepositoryEnv,
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

describe('clearRepositoryEnv', () => {
  it.each(['win32', 'linux'])(
    'matches repository selectors using %s environment rules',
    (platform) => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      try {
        const env = {
          GIT_DIR: 'repository',
          git_work_tree: 'source',
          Git_Index_File: 'index',
          GIT_SSH_COMMAND: 'ssh',
        };
        clearRepositoryEnv(env);
        expect(env).toEqual(
          platform === 'win32'
            ? { GIT_SSH_COMMAND: 'ssh' }
            : { git_work_tree: 'source', Git_Index_File: 'index', GIT_SSH_COMMAND: 'ssh' },
        );
      } finally {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    },
  );
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
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-test-')));
    workspaces = [];
    restoreBasePath = cliState.basePath;
  });

  afterEach(async () => {
    await Promise.all(workspaces.map((workspace) => workspace.remove()));
    cliState.basePath = restoreBasePath;
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('process cleanup', () => {
    it.each([
      ['SIGINT', 'none'],
      ['SIGTERM', 'none'],
      ['SIGINT', 'observer-before'],
      ['SIGTERM', 'observer-before'],
      ['SIGINT', 'observer-after'],
      ['SIGTERM', 'observer-after'],
      ['SIGINT', 'removed'],
      ['SIGTERM', 'removed'],
      ['SIGINT', 'removal-pending'],
      ['SIGTERM', 'removal-pending'],
      ['SIGINT', 'removal-failed'],
      ['SIGTERM', 'removal-failed'],
      ['SIGINT', 'consume'],
      ['SIGTERM', 'consume'],
      ['SIGINT', 'before'],
      ['SIGTERM', 'before'],
      ['SIGINT', 'after'],
      ['SIGTERM', 'after'],
    ] as const)('cleans up on %s with a handler registered %s', async (signal, handler) => {
      if (process.platform === 'win32') {
        return; // Windows terminates signal-targeted processes without invoking Node handlers.
      }
      const source = path.join(root, 'source');
      write(path.join(source, 'fixture.txt'), 'original\n');
      const moduleUrl = new URL('../../src/providers/agentWorkspace.ts', import.meta.url).href;
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `
            import fs from 'node:fs';
            import fsPromises from 'node:fs/promises';
            const { createAgentWorkspace, isAgentWorkspace } = await import(${JSON.stringify(moduleUrl)});
            const { onExit } = await import('signal-exit');
            const [source, signal, handler, marker] = process.argv.slice(1);
            let workspace;
            const handleSignal = () => {
              process.send({ handled: true, workspaceAvailable: fs.existsSync(workspace.dir) });
              if (handler !== 'consume') setImmediate(() => process.exit(42));
            };
            if (handler === 'before' || handler === 'consume') process.once(signal, handleSignal);
            if (handler === 'observer-before') onExit(() => fs.writeFileSync(marker, 'handled'));
            workspace = await createAgentWorkspace(source, 'copy');
            if (handler === 'after') process.once(signal, handleSignal);
            if (handler === 'observer-after') onExit(() => fs.writeFileSync(marker, 'handled'));
            if (handler === 'removed') await workspace.remove();
            if (handler.startsWith('removal-')) {
              fsPromises.rm = async () => {
                if (handler === 'removal-failed') throw new Error('simulated cleanup failure');
                await new Promise(() => {});
              };
              process.once(signal, async () => {
                const cleanup = workspace.remove();
                if (handler === 'removal-failed') await cleanup;
                process.send({
                  removing: true,
                  workspaceActive: isAgentWorkspace(workspace.dir),
                  workspaceAvailable: fs.existsSync(workspace.dir),
                });
              });
            }
            setInterval(() => {}, 1000);
            process.send({ workingDir: workspace.dir });
          `,
          source,
          signal,
          handler,
          path.join(root, 'observer-ran'),
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          env: {
            ...process.env,
            PROMPTFOO_CONFIG_DIR: path.join(root, 'config'),
            PROMPTFOO_DISABLE_TELEMETRY: 'true',
          },
        },
      );
      let stderr = '';
      child.stderr?.on('data', (data) => {
        stderr += data;
      });
      const messages: unknown[] = [];
      child.on('message', (message) => messages.push(message));
      const exited = once(child, 'exit');
      let workingDir: string | undefined;
      try {
        const ready = await Promise.race([
          once(child, 'message').then(([message]) => message as { workingDir: string }),
          exited.then(() => {
            throw new Error(stderr || 'Child exited before creating its workspace');
          }),
        ]);
        workingDir = ready.workingDir;
        expect(fs.existsSync(workingDir)).toBe(handler !== 'removed');
        const handled = ['consume', 'removal-pending', 'removal-failed'].includes(handler)
          ? once(child, 'message')
          : undefined;
        expect(child.kill(signal)).toBe(true);
        if (handled) {
          await handled;
          expect(fs.existsSync(workingDir)).toBe(true);
          expect(child.kill(signal)).toBe(true);
        }

        const customExit = ['before', 'after'].includes(handler);
        expect(await exited).toEqual(customExit ? [42, null] : [null, signal]);
        if (customExit || handler === 'consume') {
          expect(messages).toContainEqual({ handled: true, workspaceAvailable: true });
        }
        if (handler.startsWith('removal-')) {
          expect(messages).toContainEqual({
            removing: true,
            workspaceActive: false,
            workspaceAvailable: true,
          });
        }
        expect(fs.existsSync(workingDir)).toBe(false);
        if (handler.startsWith('observer-')) {
          expect(fs.readFileSync(path.join(root, 'observer-ran'), 'utf8')).toBe('handled');
        }
        expect(fs.readFileSync(path.join(source, 'fixture.txt'), 'utf8')).toBe('original\n');
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await exited;
        }
        if (workingDir) {
          fs.rmSync(path.dirname(workingDir), { recursive: true, force: true });
        }
      }
    });
  });

  describe('git repositories', () => {
    it('copies when Git cannot pin attributes and rejects explicit git mode', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { 'app.ts': 'const value = 1;\n' });
      const actualGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const bin = path.join(root, 'bin');
      const wrapper = path.join(bin, 'git');
      write(
        wrapper,
        [
          `#!${process.execPath}`,
          "const { spawnSync } = require('node:child_process');",
          'const args = process.argv.slice(2);',
          // Git before 2.41 ignores the environment variable and rejects the option.
          "if (args.some((arg) => arg.startsWith('--attr-source='))) { process.exit(129); }",
          'const { GIT_ATTR_SOURCE, ...env } = process.env;',
          `const result = spawnSync(${JSON.stringify(actualGit)}, args, { env, stdio: 'inherit' });`,
          'process.exit(result.status ?? 1);',
        ].join('\n'),
      );
      fs.chmodSync(wrapper, 0o755);
      const restoreEnv = mockProcessEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` });
      try {
        const workspace = await create(source);
        write(path.join(workspace.dir, '.gitattributes'), '*.ts -diff\n');
        write(path.join(workspace.dir, 'app.ts'), 'const value = 2;\n');

        expect(workspace.strategy).toBe('copy');
        expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
        await expect(create(source, 'git')).rejects.toThrow(
          'requires Git with --attr-source support',
        );
        expect(fs.readFileSync(path.join(source, 'app.ts'), 'utf8')).toBe('const value = 1;\n');
        expect(fs.existsSync(path.join(source, '.gitattributes'))).toBe(false);
      } finally {
        restoreEnv();
      }
    });

    it('records code changes when the agent marks them as binary in attributes', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { 'app.ts': 'const value = 1;\n' });
      const workspace = await create(source, 'git');
      write(path.join(workspace.dir, '.gitattributes'), '*.ts -diff\n');
      write(path.join(workspace.dir, 'app.ts'), 'const value = 2;\n');

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toContain('-const value = 1;');
      expect(workspaceDiff).toContain('+const value = 2;');
      expect(workspaceDiff).not.toContain('Binary files');
      expect(fs.readFileSync(path.join(source, 'app.ts'), 'utf8')).toBe('const value = 1;\n');
    });

    it('keeps the workspace and diff scratch outside a source-local temp directory', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const tempDir = path.join(source, '.tmp');
      fs.mkdirSync(tempDir);
      const sourceFiles = listFiles(source);
      const tmpdir = vi.spyOn(os, 'tmpdir').mockReturnValue(tempDir);
      try {
        const workspace = await create(source, 'git');
        write(path.join(workspace.dir, 'README.md'), 'changed\n');

        expect((await workspace.metadata()).workspaceDiff).toContain('+changed');
        expect(listFiles(source)).toEqual(sourceFiles);
        expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('original\n');
        await workspace.remove();
        expect(fs.existsSync(path.dirname(workspace.dir))).toBe(false);
      } finally {
        tmpdir.mockRestore();
      }
    });

    it('cancels a Git command blocked on a source index without falling back to copying', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const index = path.join(source, '.git', 'index');
      fs.unlinkSync(index);
      execFileSync('mkfifo', [index]);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 100);
      try {
        await expect(create(source, 'auto', controller.signal)).rejects.toMatchObject({
          name: 'AbortError',
        });
      } finally {
        clearTimeout(timer);
      }
    });

    it('propagates cancellation when computing metadata', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const controller = new AbortController();
      const workspace = await create(source, 'git', controller.signal);
      controller.abort();

      await expect(workspace.metadata()).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('does not let an agent-controlled FIFO index block metadata or cleanup', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      const index = path.join(workspace.dir, '.git', 'index');
      fs.unlinkSync(index);
      execFileSync('mkfifo', [index]);

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
      await workspace.remove();
      expect(fs.existsSync(workspace.dir)).toBe(false);
    });

    it('rejects an oversized agent-controlled index before reading it', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      fs.truncateSync(path.join(workspace.dir, '.git', 'index'), 64 * 1024 * 1024 + 1);

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it.each(['agent', 'global'])(
      'records changes when %s configuration enables a split index',
      async (configuration) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': '*.snap\n' });
        const configFile = path.join(root, 'global.gitconfig');
        write(configFile, configuration === 'global' ? '[core]\n splitIndex = true\n' : '');
        const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
        try {
          const workspace = await create(source);
          if (configuration === 'agent') {
            git(workspace.dir, 'update-index', '--split-index');
          }
          write(path.join(workspace.dir, 'README.md'), 'changed\n');
          write(path.join(workspace.dir, 'added.snap'), 'new snapshot\n');
          git(workspace.dir, 'add', '-f', 'added.snap');
          expect(fs.readdirSync(path.join(workspace.dir, '.git'))).toEqual(
            expect.arrayContaining([expect.stringMatching(/^sharedindex\.[a-f0-9]+$/)]),
          );

          const { workspaceDiff } = await workspace.metadata();

          expect(workspaceDiff).toContain('+changed');
          expect(workspaceDiff).toContain('+++ b/added.snap');
          expect(workspaceDiff).toContain('+new snapshot');
          expect(git(source, 'status', '--porcelain')).toBe('');
        } finally {
          restoreEnv();
        }
      },
    );

    it('records changes with a SHA-256 split index', async () => {
      const source = path.join(root, 'repo');
      fs.mkdirSync(source);
      git(source, 'init', '-q', '--object-format=sha256');
      makeRepository(source);
      const workspace = await create(source);
      git(workspace.dir, 'update-index', '--split-index');
      write(path.join(workspace.dir, 'README.md'), 'changed\n');

      expect((await workspace.metadata()).workspaceDiff).toContain('+changed');
    });

    it.each(['link', 'fifo'])('rejects a shared index replaced with a %s', async (kind) => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      git(workspace.dir, 'update-index', '--split-index');
      const gitDir = path.join(workspace.dir, '.git');
      const name = fs.readdirSync(gitDir).find((file) => file.startsWith('sharedindex.'))!;
      const sharedIndex = path.join(gitDir, name);
      const original = path.join(root, 'original-index');
      fs.renameSync(sharedIndex, original);
      if (kind === 'link') {
        fs.symlinkSync(original, sharedIndex);
      } else {
        execFileSync('mkfifo', [sharedIndex]);
      }

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it('bounds the total size of copied shared indexes', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      for (const hash of ['a', 'b']) {
        const file = path.join(workspace.dir, '.git', `sharedindex.${hash.repeat(40)}`);
        write(file, '');
        fs.truncateSync(file, 33 * 1024 * 1024);
      }

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it('bounds the number of copied shared indexes', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      for (let index = 0; index < 65; index++) {
        write(
          path.join(workspace.dir, '.git', `sharedindex.${index.toString(16).padStart(40, '0')}`),
          '',
        );
      }

      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it.each([
      ['sha256', 'sha1'],
      ['sha1', 'sha256'],
    ])(
      'diffs a %s repository when the default object format is %s',
      async (format, defaultHash) => {
        const source = path.join(root, 'repo');
        fs.mkdirSync(source);
        git(source, 'init', '-q', `--object-format=${format}`);
        makeRepository(source);
        const restoreEnv = mockProcessEnv({ GIT_DEFAULT_HASH: defaultHash });
        try {
          const workspace = await create(source);
          write(path.join(workspace.dir, 'README.md'), 'changed\n');

          expect(workspace.strategy).toBe('git');
          expect((await workspace.metadata()).workspaceDiff).toContain('+changed');
        } finally {
          restoreEnv();
        }
      },
    );

    it('copies filtered tracked files and rejects explicit git mode', async () => {
      const source = path.join(root, 'repo');
      const filter = path.join(root, 'filter.cjs');
      const marker = path.join(root, 'filter-ran');
      write(
        filter,
        [
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`,
          "let data = ''; process.stdin.on('data', chunk => data += chunk);",
          "process.stdin.on('end', () => process.stdout.write(process.argv[2] === 'clean' ? data.replaceAll('MATERIALIZED', 'CANONICAL') : data.replaceAll('CANONICAL', 'MATERIALIZED')));",
        ].join('\n'),
      );
      const configFile = path.join(root, 'global.gitconfig');
      const command = `node "${filter.split(path.sep).join('/')}"`;
      write(
        configFile,
        `[filter "review"]\n clean = ${command} clean\n smudge = ${command} smudge\n`,
      );
      const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
      try {
        makeRepository(source, {
          '.gitattributes': '*.txt filter=review\n',
          'report data.txt': 'MATERIALIZED\n',
        });
        expect(git(source, 'show', 'HEAD:report data.txt')).toBe('CANONICAL');
        fs.rmSync(marker);

        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.readFileSync(path.join(workspace.dir, 'report data.txt'), 'utf8')).toBe(
          'MATERIALIZED\n',
        );
        expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
        await expect(create(source, 'git')).rejects.toThrow('tracked Git filter attributes');
        expect(fs.existsSync(marker)).toBe(false);
      } finally {
        restoreEnv();
      }
    });

    it('copies ident fixtures without expanding their contents in automatic mode', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitattributes': '*.txt ident\n', 'fixture.txt': '$Id$\n' });
      expect(git(source, 'status', '--porcelain')).toBe('');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\n');
      const clone = await create(source, 'git');
      expect(clone.strategy).toBe('git');
      expect(fs.readFileSync(path.join(clone.dir, 'fixture.txt'), 'utf8')).toMatch(/^\$Id: /);
    });

    it.each(['.gitattributes', '.git/info/attributes'])(
      'copies encoded fixture bytes with attributes in %s',
      async (attributePath) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        write(path.join(source, attributePath), '*.txt working-tree-encoding=ISO-8859-1\n');
        const contents = Buffer.from('caf\xe9\n', 'latin1');
        fs.writeFileSync(path.join(source, 'fixture.txt'), contents);
        git(source, 'add', '-A');
        git(source, 'commit', '-q', '-m', 'encoded fixture');
        expect(git(source, 'status', '--porcelain')).toBe('');

        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'))).toEqual(contents);
        const clone = await create(source, 'git');
        expect(clone.strategy).toBe('git');
        expect(fs.readFileSync(path.join(clone.dir, 'fixture.txt'))).toEqual(
          attributePath === '.gitattributes' ? contents : Buffer.from('caf\u00e9\n'),
        );
      },
    );

    it.each([
      ['ident', '-ident'],
      ['text eol=crlf', 'text eol=lf'],
    ])('copies files when repository attributes override %s', async (tracked, override) => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitattributes': `*.txt ${tracked}\n`, 'fixture.txt': '$Id$\n' });
      write(path.join(source, '.git/info/attributes'), `*.txt ${override}\n`);
      expect(git(source, 'status', '--porcelain')).toBe('');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\n');
      const clone = await create(source, 'git');
      expect(clone.strategy).toBe('git');
      expect(fs.readFileSync(path.join(clone.dir, 'fixture.txt'), 'utf8')).not.toBe('$Id$\n');
    });

    it.each([false, true])(
      'copies files when core.attributesFile overrides global attributes (empty: %s)',
      async (empty) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { 'fixture.txt': '$Id$\n' });
        const configFile = path.join(root, 'global.gitconfig');
        const globalAttributes = path.join(root, 'global.attributes');
        const localAttributes = path.join(root, 'local.attributes');
        write(configFile, '');
        write(globalAttributes, '*.txt text eol=crlf\n');
        write(localAttributes, '*.txt text eol=lf\n');
        git(source, 'config', '--file', configFile, 'core.attributesFile', globalAttributes);
        git(source, 'config', 'core.attributesFile', empty ? '' : localAttributes);
        const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
        try {
          expect(git(source, 'status', '--porcelain')).toBe('');

          const workspace = await create(source);

          expect(workspace.strategy).toBe('copy');
          expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\n');
          const clone = await create(source, 'git');
          expect(clone.strategy).toBe('git');
          expect(fs.readFileSync(path.join(clone.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\r\n');
        } finally {
          restoreEnv();
        }
      },
    );

    it('still clones when source and workspace share default global attributes', async () => {
      const source = path.join(root, 'repo');
      const configFile = path.join(root, 'global.gitconfig');
      const configHome = path.join(root, 'config');
      write(configFile, '');
      write(path.join(configHome, 'git/attributes'), '*.txt text eol=lf\n');
      const restoreEnv = mockProcessEnv({
        GIT_CONFIG_GLOBAL: configFile,
        XDG_CONFIG_HOME: configHome,
      });
      try {
        makeRepository(source, { 'fixture.txt': '$Id$\n' });

        const workspace = await create(source);

        expect(workspace.strategy).toBe('git');
        expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\n');
        expect((await workspace.metadata()).workspaceDiff).toBe('');
      } finally {
        restoreEnv();
      }
    });

    it('still clones files with explicitly unset checkout transformations', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, {
        '.gitattributes': '*.txt -filter -ident -working-tree-encoding\n',
        'fixture.txt': '$Id$\n',
      });

      const workspace = await create(source);

      expect(workspace.strategy).toBe('git');
      expect(fs.readFileSync(path.join(workspace.dir, 'fixture.txt'), 'utf8')).toBe('$Id$\n');
    });

    it.each(['staged', 'committed'])(
      'includes newly %s ignored files in its diff',
      async (state) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': '*.snap\n' });
        const workspace = await create(source);
        write(path.join(workspace.dir, 'added file.snap'), 'new snapshot\n');
        write(path.join(workspace.dir, 'untracked.snap'), 'excluded\n');
        git(workspace.dir, 'add', '-f', 'added file.snap');
        if (state === 'committed') {
          git(workspace.dir, 'commit', '-q', '-m', 'agent snapshot');
        }
        write(path.join(workspace.dir, '.gitignore'), '*\n');

        const { workspaceDiff } = await workspace.metadata();

        expect(workspaceDiff).toContain('+++ b/added file.snap');
        expect(workspaceDiff).toContain('+new snapshot');
        expect(workspaceDiff).not.toContain('untracked.snap');
        expect(fs.existsSync(path.join(source, 'added file.snap'))).toBe(false);
      },
    );

    it('records new files when the agent creates an ignore-all file', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, '.gitignore'), '*\n');
      write(path.join(workspace.dir, 'new.ts'), 'export const changed = true;\n');
      const indexBefore = fs.readFileSync(path.join(workspace.dir, '.git/index'));

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toContain('+++ b/.gitignore');
      expect(workspaceDiff).toContain('+export const changed = true;');
      expect(fs.readFileSync(path.join(workspace.dir, '.git/index'))).toEqual(indexBefore);
      expect(fs.readFileSync(path.join(workspace.dir, '.gitignore'), 'utf8')).toBe('*\n');
      expect(fs.existsSync(path.join(source, '.gitignore'))).toBe(false);
      expect(fs.existsSync(path.join(source, 'new.ts'))).toBe(false);
    });

    it.each(['changes', 'removes'])(
      'uses baseline nested ignore rules when the agent %s them',
      async (action) => {
        const source = path.join(root, 'repo');
        makeRepository(source, {
          '.gitignore': '*.snap\nbuild/\n',
          'src/.gitignore': '/secret.ts\n*.tmp\n!keep.tmp\n',
        });
        const workspace = await create(source);
        for (const file of ['.gitignore', 'src/.gitignore']) {
          if (action === 'changes') {
            write(path.join(workspace.dir, file), '*\n');
          } else {
            fs.rmSync(path.join(workspace.dir, file));
          }
        }
        for (const [file, contents] of Object.entries({
          'new.ts': 'new root code\n',
          'src/new.ts': 'new nested code\n',
          'src/keep.tmp': 'allowed exception\n',
          'src/subdir/secret.ts': 'anchored pattern allows this\n',
          'untracked.snap': 'excluded artifact\n',
          'build/output.js': 'excluded artifact\n',
          'src/secret.ts': 'excluded artifact\n',
          'src/untracked.tmp': 'excluded artifact\n',
        })) {
          write(path.join(workspace.dir, file), contents);
        }
        const indexBefore = fs.readFileSync(path.join(workspace.dir, '.git/index'));

        const { workspaceDiff } = await workspace.metadata();

        expect(workspaceDiff).toContain('+new root code');
        expect(workspaceDiff).toContain('+new nested code');
        expect(workspaceDiff).toContain('+allowed exception');
        expect(workspaceDiff).toContain('+anchored pattern allows this');
        expect(workspaceDiff).not.toContain('excluded artifact');
        expect(fs.readFileSync(path.join(workspace.dir, '.git/index'))).toEqual(indexBefore);
        expect(fs.readFileSync(path.join(source, '.gitignore'), 'utf8')).toBe('*.snap\nbuild/\n');
        expect(fs.existsSync(path.join(source, 'new.ts'))).toBe(false);
      },
    );

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

    it('copies materialized CRLF files in automatic mode', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      git(source, 'config', 'core.autocrlf', 'true');
      fs.unlinkSync(path.join(source, 'README.md'));
      git(source, 'checkout-index', '--force', '--index', '--all');
      expect(git(source, 'status', '--porcelain')).toBe('');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace.dir, 'README.md'), 'utf8')).toBe('original\r\n');
      expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
    });

    it.each([
      [0o644, 0o755],
      [0o755, 0o644],
    ])(
      'preserves changed executable permissions hidden by core.filemode=false',
      async (before, after) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        const file = path.join(source, 'run.sh');
        write(file, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(file, before);
        git(source, 'add', 'run.sh');
        git(source, 'commit', '-q', '-m', 'script');
        git(source, 'config', 'core.filemode', 'false');
        fs.chmodSync(file, after);
        expect(git(source, 'status', '--porcelain')).toBe('');

        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.statSync(path.join(workspace.dir, 'run.sh')).mode & 0o777).toBe(after);
        await expect(create(source, 'git')).rejects.toThrow('files all match its current commit');
      },
    );

    it('still clones matching executable permissions with core.filemode=false', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const file = path.join(source, 'run.sh');
      write(file, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(file, 0o755);
      git(source, 'add', 'run.sh');
      git(source, 'commit', '-q', '-m', 'script');
      git(source, 'config', 'core.filemode', 'false');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('git');
      expect(fs.statSync(path.join(workspace.dir, 'run.sh')).mode & 0o100).toBe(0o100);
    });

    it('copies LF files that attributes would convert to CRLF during checkout', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitattributes': '*.txt text eol=crlf\n' });
      expect(git(source, 'status', '--porcelain')).toBe('');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('copy');
      expect(fs.readFileSync(path.join(workspace.dir, 'src', 'app.txt'), 'utf8')).toBe('app\n');
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

    it.each(['auto', 'git'] as const)(
      'removes the clone remote with a custom default remote name in %s mode',
      async (mode) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const configFile = path.join(root, 'global.gitconfig');
        write(configFile, '[clone]\n defaultRemoteName = upstream\n');
        const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
        const warnings = vi.spyOn(logger, 'warn');
        try {
          const workspace = await create(source, mode);

          expect(workspace.strategy).toBe('git');
          expect(git(workspace.dir, 'remote')).toBe('');
          const metadata = await workspace.metadata();
          expect(metadata.workspaceDiff, warnings.mock.calls.flat().join('\n')).toBe('');
        } finally {
          warnings.mockRestore();
          restoreEnv();
        }
      },
    );

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

    it('copies symlink placeholders instead of converting them into links', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const link = path.join(source, 'linked-readme');
      fs.symlinkSync('README.md', link);
      git(source, 'add', 'linked-readme');
      git(source, 'commit', '-q', '-m', 'tracked link');
      git(source, 'config', 'core.symlinks', 'false');
      fs.unlinkSync(link);
      git(source, 'checkout-index', '--force', '--index', '--all');
      expect(git(source, 'status', '--porcelain')).toBe('');

      const workspace = await create(source);

      expect(workspace.strategy).toBe('copy');
      expect(fs.lstatSync(path.join(workspace.dir, 'linked-readme')).isFile()).toBe(true);
      expect(fs.readFileSync(path.join(workspace.dir, 'linked-readme'), 'utf8')).toBe('README.md');
      await expect(create(source, 'git')).rejects.toThrow('files all match its current commit');
    });

    it('preserves source links when global configuration disables symlink checkout', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      fs.symlinkSync('README.md', path.join(source, 'linked-readme'));
      git(source, 'add', 'linked-readme');
      git(source, 'commit', '-q', '-m', 'tracked link');
      git(source, 'config', 'core.symlinks', 'true');
      const configFile = path.join(root, 'global.gitconfig');
      write(configFile, '[core]\n symlinks = false\n');
      const restoreEnv = mockProcessEnv({ GIT_CONFIG_GLOBAL: configFile });
      try {
        const workspace = await create(source);

        expect(workspace.strategy).toBe('git');
        expect(fs.lstatSync(path.join(workspace.dir, 'linked-readme')).isSymbolicLink()).toBe(true);
        expect((await workspace.metadata()).workspaceDiff).toBe('');
      } finally {
        restoreEnv();
      }
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

    it('copies filter attributes even when their driver is configured later', async () => {
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
        expect(workspace.strategy).toBe('copy');
        expect(await workspace.metadata()).toEqual({ workingDir: workspace.dir });
        expect(fs.existsSync(marker)).toBe(false);
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
      git(
        main,
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.eol=lf',
        'worktree',
        'add',
        '-q',
        linked,
        '-b',
        'feature',
      );
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

    it.each([true, false])('rejects populated gitlinks with .gitmodules=%s', async (hasConfig) => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      if (hasConfig) {
        const nestedSource = path.join(root, 'module');
        makeRepository(nestedSource);
        git(
          source,
          '-c',
          'core.autocrlf=false',
          '-c',
          'core.eol=lf',
          '-c',
          'protocol.file.allow=always',
          'submodule',
          'add',
          nestedSource,
          'lib',
        );
      } else {
        makeRepository(path.join(source, 'lib'));
        git(source, 'add', 'lib');
      }
      git(source, 'commit', '-q', '-m', 'populated gitlink');
      expect(git(source, 'status', '--porcelain')).toBe('');
      expect(git(source, 'ls-files', '--stage')).toContain('160000');

      for (const mode of ['auto', 'git'] as const) {
        await expect(create(source, mode)).rejects.toThrow('does not support git submodules');
      }
      expect(fs.readFileSync(path.join(source, 'lib', 'README.md'), 'utf8')).toBe('original\n');
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
    it.each(['auto', 'copy'] as const)(
      'rejects copied worktree backlinks in %s mode',
      async (mode) => {
        const source = path.join(root, 'repo');
        const linked = path.join(root, 'linked');
        makeRepository(source);
        git(source, 'worktree', 'add', '-q', '--detach', linked);
        const linkedGitFile = fs.readFileSync(path.join(linked, '.git'), 'utf8');
        write(path.join(source, 'README.md'), 'uncommitted\n');

        await expect(create(source, mode)).rejects.toThrow('linked worktree metadata');

        expect(fs.readFileSync(path.join(linked, '.git'), 'utf8')).toBe(linkedGitFile);
        expect(fs.realpathSync.native(git(linked, 'rev-parse', '--show-toplevel'))).toBe(
          fs.realpathSync.native(linked),
        );
      },
    );

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

    it.each(['auto', 'copy'] as const)(
      'rejects relative links that point back to the source after %s relocation',
      async (mode) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'fixture');
        const original = path.join(source, 'file.txt');
        write(original, 'original\n');
        const filesystemRoot = path.parse(source).root;
        const target = path.join(
          path.relative(source, filesystemRoot),
          path.relative(filesystemRoot, original),
        );
        fs.symlinkSync(target, path.join(source, 'link'));
        expect(fs.realpathSync(path.join(source, 'link'))).toBe(original);

        await expect(create(source, mode)).rejects.toThrow('links outside working_dir');

        expect(fs.readFileSync(original, 'utf8')).toBe('original\n');
        expect(fs.readlinkSync(path.join(source, 'link'))).toBe(target);
      },
    );

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

    it.each(['auto', 'copy'] as const)(
      'rejects tilde-expanded core.worktree in %s mode',
      async (mode) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const relativeToHome = path.relative(os.homedir(), source).split(path.sep).join('/');
        git(source, 'config', 'core.worktree', `~/${relativeToHome}`);
        write(path.join(source, 'README.md'), 'uncommitted\n');

        await expect(create(source, mode)).rejects.toThrow('core.worktree');
        expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
      },
    );

    it('keeps a relative git working tree inside the copy', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      git(source, 'config', 'core.worktree', '..');
      write(path.join(source, 'README.md'), 'uncommitted\n');

      const workspace = await create(source);
      git(
        workspace.dir,
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.eol=lf',
        'checkout',
        '--',
        'README.md',
      );

      expect(fs.readFileSync(path.join(workspace.dir, 'README.md'), 'utf8')).toBe('original\n');
      expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
    });

    it.each(['auto', 'copy'] as const)(
      'rejects core.worktree that points back to the source after %s relocation',
      async (mode) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const filesystemRoot = path.parse(source).root;
        const target = path.join(
          path.relative(path.join(source, '.git'), filesystemRoot),
          path.relative(filesystemRoot, source),
        );
        git(source, 'config', 'core.worktree', target);
        write(path.join(source, 'README.md'), 'uncommitted\n');
        expect(fs.realpathSync.native(git(source, 'rev-parse', '--show-toplevel'))).toBe(
          fs.realpathSync.native(source),
        );

        await expect(create(source, mode)).rejects.toThrow('core.worktree');

        expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('uncommitted\n');
      },
    );

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

    it.each([
      ['auto', 'source'],
      ['copy', 'source'],
      ['auto', 'nested'],
      ['copy', 'nested'],
      ['auto', 'symlink'],
      ['copy', 'symlink'],
    ] as const)('copies with %s mode when the temp directory is %s', async (mode, location) => {
      if (location === 'symlink' && process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'fixture');
      write(path.join(source, 'file.txt'), 'original\n');
      let tempDir = source;
      if (location !== 'source') {
        tempDir = path.join(source, '.tmp');
        fs.mkdirSync(tempDir);
      }
      if (location === 'symlink') {
        const link = path.join(root, 'temp-link');
        fs.symlinkSync(tempDir, link);
        tempDir = link;
      }
      const sourceFiles = listFiles(source);
      const tmpdir = vi.spyOn(os, 'tmpdir').mockReturnValue(tempDir);
      try {
        const workspace = await create(source, mode);

        expect(workspace.strategy).toBe('copy');
        expect(fs.readFileSync(path.join(workspace.dir, 'file.txt'), 'utf8')).toBe('original\n');
        write(path.join(workspace.dir, 'file.txt'), 'changed\n');
        expect(listFiles(source)).toEqual(sourceFiles);
        expect(fs.readFileSync(path.join(source, 'file.txt'), 'utf8')).toBe('original\n');
        await workspace.remove();
        expect(fs.existsSync(path.dirname(workspace.dir))).toBe(false);
      } finally {
        tmpdir.mockRestore();
      }
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
