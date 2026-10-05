import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type TestContext, vi } from 'vitest';
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

/**
 * Listens on a socket named `name` in `directory`. The socket is bound through a relative
 * path, because the absolute one can exceed the platform's limit for socket paths.
 * Returns cleanup that closes in the same directory: libuv unlinks that relative path.
 */
async function listenIn(directory: string, name: string) {
  const previous = process.cwd();
  const socket = createServer();
  process.chdir(directory);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.listen(name, resolve);
    });
  } finally {
    process.chdir(previous);
  }
  return async () => {
    const previous = process.cwd();
    process.chdir(directory);
    try {
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    } finally {
      process.chdir(previous);
    }
  };
}

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort();
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Some filesystems reject invalid UTF-8 names before the workspace can inspect them. */
function createRawPath(file: Buffer, context: TestContext, create: () => void): void {
  try {
    create();
  } catch (error) {
    if (
      !Buffer.from(file.toString('utf8')).equals(file) &&
      error instanceof Error &&
      'code' in error
    ) {
      if (error.code === 'EILSEQ' || error.code === 'EINVAL') {
        context.skip(`Filesystem rejects invalid UTF-8 names (${error.code})`);
      }
      if (process.platform === 'win32' && error.code === 'ENOENT') {
        // Windows may reject invalid UTF-8 as ENOENT. Prove the parent is writable
        // with a valid name before treating that error as a fixture limitation.
        const probe = path.join(path.dirname(file.toString('utf8')), `.raw-name-${randomUUID()}`);
        fs.writeFileSync(probe, '', { flag: 'wx' });
        fs.unlinkSync(probe);
        context.skip('Filesystem rejects invalid UTF-8 names (ENOENT with a writable parent)');
      }
    }
    throw error;
  }
}

function createRawDirectory(directory: Buffer, context: TestContext): void {
  createRawPath(directory, context, () => fs.mkdirSync(directory));
}

function writeRawFile(file: Buffer, content: string, context: TestContext): void {
  createRawPath(file, context, () => fs.writeFileSync(file, content));
}

/** Real directory listing with the entry types omitted, as on a filesystem without d_type. */
function omitDirectoryEntryTypes() {
  const opendir = fs.promises.opendir;
  return vi.spyOn(fs.promises, 'opendir').mockImplementation(async (...args) => {
    const directory = await opendir(...args);
    return {
      async *[Symbol.asyncIterator]() {
        for await (const entry of directory) {
          yield new Proxy(entry, {
            get(target, key) {
              if (key === 'isFile' || key === 'isDirectory' || key === 'isSymbolicLink') {
                return () => false;
              }
              return Reflect.get(target, key, target);
            },
          });
        }
      },
    } as fs.Dir;
  });
}

/** Force Node's real getDirent/lstat fallback before yielding each actual directory entry. */
function forceNativeUnknownDirectoryEntryTypes() {
  const opendir = fs.promises.opendir;
  return vi.spyOn(fs.promises, 'opendir').mockImplementation(async (...args) => {
    const directory = await opendir(...args);
    // Feed real entry names back through Node's Dir conversion as UV_DIRENT_UNKNOWN.
    // A handle adapter keeps this working when Node makes processReadResult private.
    type Request = {
      oncomplete: (error: unknown, result?: Array<string | Buffer | number> | null) => void;
    };
    const handle = {
      read(_encoding: BufferEncoding, _bufferSize: number, request: Request) {
        void directory.read().then(
          (entry) => request.oncomplete(null, entry ? [entry.name, 0] : null),
          (error: unknown) => request.oncomplete(error),
        );
      },
      close(request: Request) {
        void directory.close().then(
          () => request.oncomplete(null),
          (error: unknown) => request.oncomplete(error),
        );
      },
    };
    return Reflect.construct(fs.Dir, [handle, ...args]) as fs.Dir;
  });
}

/** Ends the diff when the agent's own Git index could not be read. The diff is still computed. */
const UNREADABLE_INDEX_NOTE =
  "[diff incomplete: the workspace's Git index could not be read, so ignored files the agent " +
  'added to it are not included]';

/** Whether `chmod 000` makes a file unreadable here. It does not on Windows or for root. */
const canMakeUnreadable = process.platform !== 'win32' && process.getuid?.() !== 0;

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

  it('closes relative fixture sockets without deleting a same-named file in another directory', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const fixture = path.join(root, 'fixture');
    const other = path.join(root, 'other');
    fs.mkdirSync(fixture);
    write(path.join(other, 'policy.txt'), 'keep me');
    const previous = process.cwd();
    process.chdir(other);
    try {
      const close = await listenIn(fixture, 'policy.txt');
      expect(process.cwd()).toBe(other);
      await close();
      expect(process.cwd()).toBe(other);
      expect(fs.existsSync(path.join(fixture, 'policy.txt'))).toBe(false);
      expect(fs.readFileSync(path.join(other, 'policy.txt'), 'utf8')).toBe('keep me');
    } finally {
      process.chdir(previous);
    }
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

    it.each(['modified', 'added', 'deleted', 'attributes'] as const)(
      'records binary completeness for a %s file',
      async (kind) => {
        const source = path.join(root, 'repo');
        makeRepository(source, {
          'policy.txt': kind === 'deleted' ? 'safe\0original\n' : 'safe\n',
          ...(kind === 'attributes' ? { '.gitattributes': 'policy.txt -diff\n' } : {}),
        });
        const workspace = await create(source, 'git');
        if (kind === 'deleted') {
          fs.rmSync(path.join(workspace.dir, 'policy.txt'));
        } else {
          write(
            path.join(workspace.dir, kind === 'added' ? 'new.bin' : 'policy.txt'),
            kind === 'attributes' ? 'forbidden\n' : 'safe\0forbidden\n',
          );
        }
        write(path.join(workspace.dir, 'README.md'), 'original\nvisible change\n');

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(kind === 'deleted' ? undefined : true);
        expect(metadata.workspaceDiff).toContain('Binary files');
        expect(metadata.workspaceDiff).not.toContain('forbidden');
        expect(metadata.workspaceDiff).toContain('+visible change');
        if (kind !== 'deleted') {
          expect(metadata.workspaceDiff).toContain(
            '[diff incomplete: binary file contents are not included]',
          );
        }
        expect(fs.readFileSync(path.join(source, 'policy.txt'), 'utf8')).toBe(
          kind === 'deleted' ? 'safe\0original\n' : 'safe\n',
        );
      },
    );

    it('marks the diff incomplete when changed content is not valid UTF-8', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source, 'git');
      // Without a NUL byte Git takes the file for text. The byte is lost when the diff is
      // read as text, so other bytes in its place would look the same.
      fs.writeFileSync(
        path.join(workspace.dir, 'README.md'),
        Buffer.concat([Buffer.from('original\nhi'), Buffer.from([0xff]), Buffer.from('den\n')]),
      );

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiff).toContain('+hi\uFFFDden');
      expect(metadata.workspaceDiffIncomplete).toBe(true);
      expect(metadata.workspaceDiff).toMatch(
        /\[diff incomplete: some changed content is not valid UTF-8 and is shown with replacement characters\]$/,
      );
    });

    it('does not mark the diff incomplete for content that holds the replacement character', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source, 'git');
      // Valid UTF-8, shown as it is, next to other text that is not ASCII.
      write(path.join(workspace.dir, 'README.md'), 'original\nna\u00EFve \uFFFD \u{1F600}\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toContain('+na\u00EFve \uFFFD \u{1F600}');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      expect(metadata.workspaceDiffError).toBeUndefined();
    });

    it.each([
      'deleted',
      'deleted-with-edit',
      'deleted-with-invalid-addition',
      'context',
      'removed-line',
    ])('records UTF-8 completeness for legacy text that is %s', async (kind) => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const legacy = Buffer.from('hi\xffden\nline 2\nline 3\nline 4\n', 'latin1');
      fs.writeFileSync(path.join(source, 'a-legacy.txt'), legacy);
      git(source, 'add', 'a-legacy.txt');
      git(source, 'commit', '-q', '-m', 'legacy text');
      const workspace = await create(source, 'git');
      if (kind.startsWith('deleted')) {
        fs.unlinkSync(path.join(workspace.dir, 'a-legacy.txt'));
      } else {
        fs.writeFileSync(
          path.join(workspace.dir, 'a-legacy.txt'),
          kind === 'context'
            ? Buffer.from('hi\xffden\nline 2\nline 3\nchanged 4\n', 'latin1')
            : Buffer.from('safe\nline 2\nline 3\nline 4\n'),
        );
      }
      if (kind === 'deleted-with-edit') {
        write(path.join(workspace.dir, 'README.md'), 'original\nvisible change\n');
      } else if (kind === 'deleted-with-invalid-addition') {
        fs.writeFileSync(
          path.join(workspace.dir, 'z-new.txt'),
          Buffer.from('new\xffbytes\n', 'latin1'),
        );
      }

      const metadata = await workspace.metadata();
      const complete = kind === 'deleted' || kind === 'deleted-with-edit';

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiffIncomplete).toBe(complete ? undefined : true);
      expect(metadata.workspaceDiff).toContain('hi\uFFFDden');
      expect(metadata.workspaceDiff?.includes('not valid UTF-8')).toBe(!complete);
      if (kind.startsWith('deleted')) {
        expect(metadata.workspaceDiff).toContain('deleted file mode');
      }
      if (kind === 'deleted-with-edit') {
        expect(metadata.workspaceDiff).toContain('+visible change');
      }
      expect(fs.readFileSync(path.join(source, 'a-legacy.txt'))).toEqual(legacy);
    });

    it('does not treat binary-marker text or renamed path names as binary content', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source, 'git');
      write(
        path.join(workspace.dir, 'README.md'),
        'Binary files a/policy and b/policy differ\n' +
          'prefix\rBinary files a/one and b/one differ\n' +
          'prefix\u2028Binary files a/two and b/two differ\n',
      );
      // Tabs/newlines in a rename must remain paths, not numstat records.
      const name = process.platform === 'win32' ? 'renamed.txt' : '-\t-\tpretend-binary\n.txt';
      fs.renameSync(path.join(workspace.dir, 'src', 'app.txt'), path.join(workspace.dir, name));

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiff).toContain('+Binary files a/policy and b/policy differ');
      expect(metadata.workspaceDiff).toContain('rename from src/app.txt');
    });

    it.each([false, true])(
      'reports binary rename completeness with content changes=%s',
      async (changed) => {
        const source = path.join(root, 'repo');
        const original = `safe\0${'retained line\n'.repeat(1000)}`;
        makeRepository(source, { 'asset.bin': original });
        const workspace = await create(source, 'git');
        const renamed = path.join(workspace.dir, 'renamed.bin');
        fs.renameSync(path.join(workspace.dir, 'asset.bin'), renamed);
        if (changed) {
          fs.appendFileSync(renamed, 'forbidden\n');
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiff).toContain('rename from asset.bin');
        expect(metadata.workspaceDiff).toContain('rename to renamed.bin');
        expect(metadata.workspaceDiffIncomplete).toBe(changed ? true : undefined);
        expect(metadata.workspaceDiff).not.toContain('forbidden');
        expect(fs.readFileSync(path.join(source, 'asset.bin'), 'utf8')).toBe(original);
      },
    );

    it('keeps a binary mode-only change complete', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { 'asset.bin': 'safe\0unchanged\n' });
      const workspace = await create(source, 'git');
      fs.chmodSync(path.join(workspace.dir, 'asset.bin'), 0o755);

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      expect(metadata.workspaceDiff).toContain('old mode 100644');
      expect(metadata.workspaceDiff).toContain('new mode 100755');
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
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      const index = path.join(workspace.dir, '.git', 'index');
      fs.unlinkSync(index);
      execFileSync('mkfifo', [index]);

      // Replacing the index must not hide the agent's changes from the diff.
      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();
      expect(workspaceDiff).toContain('+tampered');
      expect(workspaceDiff).toContain(UNREADABLE_INDEX_NOTE);
      expect(workspaceDiffIncomplete).toBe(true);
      await workspace.remove();
      expect(fs.existsSync(workspace.dir)).toBe(false);
    });

    it('still reports the changes of an agent that corrupted its index', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      fs.writeFileSync(path.join(workspace.dir, '.git', 'index'), 'not an index');

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('+tampered');
      expect(workspaceDiff).toContain(UNREADABLE_INDEX_NOTE);
      expect(workspaceDiffIncomplete).toBe(true);
    });

    it('reports a complete diff for a repository whose commit has no files', async () => {
      const source = path.join(root, 'repo');
      fs.mkdirSync(source, { recursive: true });
      git(source, 'init', '-q');
      git(source, 'commit', '-q', '--allow-empty', '-m', 'empty');
      const workspace = await create(source);
      // Git writes an index for the clone even though it has no entries, so a missing index
      // always means that the agent removed it.
      expect(fs.existsSync(path.join(workspace.dir, '.git', 'index'))).toBe(true);
      write(path.join(workspace.dir, 'first.txt'), 'first file\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toContain('+first file');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      expect(metadata.workspaceDiffError).toBeUndefined();
    });

    it('marks the diff incomplete when the agent deleted its index', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'ignored.txt\n' });
      const workspace = await create(source);
      // The index is the only record of an ignored file the agent added on purpose.
      write(path.join(workspace.dir, 'ignored.txt'), 'added by the agent\n');
      git(workspace.dir, 'add', '--force', 'ignored.txt');
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      fs.rmSync(path.join(workspace.dir, '.git', 'index'));

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('+tampered');
      expect(workspaceDiff).not.toContain('ignored.txt');
      expect(workspaceDiff).toContain(UNREADABLE_INDEX_NOTE);
      expect(workspaceDiffIncomplete).toBe(true);
    });

    it('rejects an oversized agent-controlled index before reading it', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      fs.truncateSync(path.join(workspace.dir, '.git', 'index'), 64 * 1024 * 1024 + 1);

      expect(await workspace.metadata()).toEqual({
        workingDir: workspace.dir,
        workspaceDiff: UNREADABLE_INDEX_NOTE,
        workspaceDiffIncomplete: true,
      });
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

      expect(await workspace.metadata()).toEqual({
        workingDir: workspace.dir,
        workspaceDiff: UNREADABLE_INDEX_NOTE,
        workspaceDiffIncomplete: true,
      });
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

      expect(await workspace.metadata()).toEqual({
        workingDir: workspace.dir,
        workspaceDiff: UNREADABLE_INDEX_NOTE,
        workspaceDiffIncomplete: true,
      });
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

      expect(await workspace.metadata()).toEqual({
        workingDir: workspace.dir,
        workspaceDiff: UNREADABLE_INDEX_NOTE,
        workspaceDiffIncomplete: true,
      });
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
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
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

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toMatch(/\n\[diff truncated after 100000 characters\]$/);
      expect(workspaceDiffIncomplete).toBe(true);
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

      // The failure is reported, so an assertion on the diff does not read it as "no changes".
      expect(await workspace.metadata()).toEqual({
        workingDir: workspace.dir,
        workspaceDiffError: expect.stringContaining('no longer available or was replaced'),
      });
    });

    it('keeps the diff and names paths git cannot add when the agent creates a repository or an unreadable file', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      write(path.join(workspace.dir, 'notes', 'new.txt'), 'new file\n');
      // Either of these used to make `git add` fail outright, which dropped the whole diff.
      write(path.join(workspace.dir, 'newproj', 'main.py'), 'print(1)\n');
      git(path.join(workspace.dir, 'newproj'), 'init', '-q');
      const unreadable = path.join(workspace.dir, 'secret.bin');
      write(unreadable, 'x');
      fs.chmodSync(unreadable, 0o000);

      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+tampered');
        expect(metadata.workspaceDiff).toContain('+++ b/notes/new.txt');
        expect(metadata.workspaceDiff).toMatch(
          /\[diff incomplete: 2 changed path\(s\) could not be included: (newproj\/, secret\.bin|secret\.bin, newproj\/)\]$/,
        );
      } finally {
        fs.chmodSync(unreadable, 0o600);
      }
    });

    it('names a tracked file the agent changed and then made unreadable', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { 'docs/guide.md': 'guide\n' });
      const workspace = await create(source);
      const hidden = path.join(workspace.dir, 'README.md');
      write(hidden, 'original\nhidden change\n');
      fs.chmodSync(hidden, 0o000);
      write(path.join(workspace.dir, 'src', 'app.txt'), 'app\nvisible change\n');

      try {
        const { workspaceDiff } = await workspace.metadata();

        expect(workspaceDiff).toContain('+visible change');
        // The content cannot be read, but a check for changes to README.md must not pass.
        // Unchanged files, such as docs/guide.md, are not listed.
        expect(workspaceDiff).toContain(
          '[diff incomplete: 1 changed path(s) could not be included: README.md]',
        );
      } finally {
        fs.chmodSync(hidden, 0o600);
      }
    });

    it.each(['fifo', 'socket'] as const)(
      'marks the diff incomplete when the agent creates a %s, which git does not list',
      async (kind) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        const workspace = await create(source);
        write(path.join(workspace.dir, 'notes', 'new.txt'), 'new file\n');
        // Neither `git status` nor `git add` reports these, so the diff alone would say that
        // nothing called policy.txt was created.
        const sockets = [];
        for (const directory of [workspace.dir, path.join(workspace.dir, 'notes')]) {
          if (kind === 'fifo') {
            execFileSync('mkfifo', [path.join(directory, 'policy.txt')]);
          } else {
            sockets.push(await listenIn(directory, 'policy.txt'));
          }
        }

        try {
          const metadata = await workspace.metadata();

          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(true);
          expect(metadata.workspaceDiff).toContain('+++ b/notes/new.txt');
          expect(metadata.workspaceDiff).toMatch(
            /\[diff incomplete: 2 changed path\(s\) could not be included: (policy\.txt, notes\/policy\.txt|notes\/policy\.txt, policy\.txt)\]$/,
          );
        } finally {
          for (const close of sockets) {
            await close();
          }
        }
      },
    );

    it('names a tracked file the agent replaced with a fifo', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      fs.rmSync(path.join(workspace.dir, 'README.md'));
      execFileSync('mkfifo', [path.join(workspace.dir, 'README.md')]);

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toBe(
        '[diff incomplete: 1 changed path(s) could not be included: README.md]',
      );
    });

    it('marks the diff incomplete when the agent makes a directory unreadable', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      // Git warns that it cannot open the directory and reports nothing inside it.
      const hidden = path.join(workspace.dir, 'hidden');
      write(path.join(hidden, 'policy.txt'), 'new file\n');
      fs.chmodSync(hidden, 0o000);

      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+tampered');
        expect(metadata.workspaceDiff).toMatch(
          /\[diff incomplete: 1 changed path\(s\) could not be included: hidden\/\]$/,
        );
      } finally {
        fs.chmodSync(hidden, 0o700);
      }
    });

    it('does not report special files and unreadable directories that the commit ignores', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'tmp/\n*.sock\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      // What a tool leaves behind in ignored places is not a change to the workspace.
      const cache = path.join(workspace.dir, 'tmp', 'cache');
      write(path.join(cache, 'entry'), 'cached\n');
      execFileSync('mkfifo', [path.join(workspace.dir, 'tmp', 'pipe')]);
      execFileSync('mkfifo', [path.join(workspace.dir, 'server.sock')]);
      fs.chmodSync(cache, 0o000);

      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
        expect(metadata.workspaceDiff).toContain('+tampered');
        expect(metadata.workspaceDiff).not.toContain('diff incomplete');
      } finally {
        fs.chmodSync(cache, 0o700);
      }
    });

    it.each([
      ['a directory', (target: string) => write(path.join(target, 'policy.txt'), 'hidden\n')],
      ['a file', (target: string) => write(target, 'hidden\n')],
    ])(
      'marks the diff incomplete when the agent hides content in %s called .git',
      async (_kind, hide) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const workspace = await create(source);
        write(path.join(workspace.dir, 'notes', 'new.txt'), 'new file\n');
        // Git never lists what a path called .git holds, whether or not it is a repository.
        hide(path.join(workspace.dir, 'notes', '.git'));

        const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

        expect(workspaceDiff).toContain('+++ b/notes/new.txt');
        expect(workspaceDiff).not.toContain('hidden');
        expect(workspaceDiffIncomplete).toBe(true);
        expect(workspaceDiff).toMatch(
          /\[diff incomplete: 1 changed path\(s\) could not be included: notes\/\.git\/?\]$/,
        );
      },
    );

    it('quotes a path whose name would add lines to the diff', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      // The agent chooses the name, and the note must not let it speak for the diff.
      const name = 'x]\n[diff incomplete: 0 changed path(s) could not be included';
      execFileSync('mkfifo', [path.join(workspace.dir, name)]);
      // A line separator and a right-to-left override, which a JSON string would keep.
      execFileSync('mkfifo', [path.join(workspace.dir, 'a\u2028b\u202ec "d"')]);

      const { workspaceDiff } = await workspace.metadata();

      expect(workspaceDiff).toContain(
        '"x]\\u{a}[diff incomplete: 0 changed path(s) could not be included"',
      );
      expect(workspaceDiff).toContain('"a\\u{2028}b\\u{202e}c \\u{22}d\\u{22}"');
      expect(workspaceDiff).toMatch(
        /^\[diff incomplete: 2 changed path\(s\) could not be included: /,
      );
      // Every character left in the note is a letter, a digit or printable ASCII.
      expect(workspaceDiff).toMatch(/^[\p{L}\p{N}\x20-\x7e]+$/u);
    });

    it('does not report a .git path that the commit ignores by name', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': '**/.git/\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'src', '.git', 'HEAD'), 'ref: x\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toBe('');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
    });

    it('does not report a .git directory under a path the commit ignores', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'node_modules/\n' });
      const workspace = await create(source);
      // Packages installed from a repository bring their own .git directory along.
      write(path.join(workspace.dir, 'node_modules', 'pkg', '.git', 'HEAD'), 'ref: x\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toBe('');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
    });

    it('names an ignored file of the cloned commit that the agent replaced with a fifo', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      write(path.join(source, '.gitignore'), 'policy.txt\n');
      write(path.join(source, 'policy.txt'), 'policy: ok\n');
      makeRepository(source);
      git(source, 'add', '--force', 'policy.txt');
      git(source, 'commit', '-q', '-m', 'track an ignored file');
      const workspace = await create(source);
      // The ignore rule must not excuse a path that the cloned commit tracks.
      git(workspace.dir, 'rm', '-q', '--cached', 'policy.txt');
      fs.rmSync(path.join(workspace.dir, 'policy.txt'));
      execFileSync('mkfifo', [path.join(workspace.dir, 'policy.txt')]);

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toBe(
        '[diff incomplete: 1 changed path(s) could not be included: policy.txt]',
      );
    });

    it('names an ignored directory made unreadable after the agent added a file in it', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'tmp/\n' });
      const workspace = await create(source);
      // The agent's index says that tmp/policy.txt is part of its work, and nothing in the
      // unreadable directory can be compared with it.
      const hidden = path.join(workspace.dir, 'tmp');
      write(path.join(hidden, 'policy.txt'), 'added by the agent\n');
      git(workspace.dir, 'add', '--force', 'tmp/policy.txt');
      fs.chmodSync(hidden, 0o000);

      try {
        const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

        expect(workspaceDiffIncomplete).toBe(true);
        expect(workspaceDiff).toBe(
          '[diff incomplete: 1 changed path(s) could not be included: tmp/]',
        );
      } finally {
        fs.chmodSync(hidden, 0o700);
      }
    });

    it('names a file the agent added in an ignored directory that can no longer be searched', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'tmp/\n' });
      const workspace = await create(source);
      const hidden = path.join(workspace.dir, 'tmp');
      write(path.join(hidden, 'policy.txt'), 'added by the agent\n');
      git(workspace.dir, 'add', '--force', 'tmp/policy.txt');
      // The directory can still be listed, but nothing in it can be examined.
      fs.chmodSync(hidden, 0o400);

      try {
        const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

        expect(workspaceDiffIncomplete).toBe(true);
        expect(workspaceDiff).toBe(
          '[diff incomplete: 1 changed path(s) could not be included: tmp/policy.txt]',
        );
      } finally {
        fs.chmodSync(hidden, 0o700);
      }
    });

    it('keeps the diff when a new file is in a directory that can no longer be searched', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      // Git lists the file and then stops altogether when it cannot examine it.
      const hidden = path.join(workspace.dir, 'stash');
      write(path.join(hidden, 'policy.txt'), 'new file\n');
      fs.chmodSync(hidden, 0o400);

      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+tampered');
        expect(metadata.workspaceDiff).toMatch(
          /\[diff incomplete: 1 changed path\(s\) could not be included: stash\/policy\.txt\]$/,
        );
      } finally {
        fs.chmodSync(hidden, 0o700);
      }
    });

    it('names a new file whose name is not valid text', async (context) => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      const name = Buffer.concat([
        Buffer.from(`${workspace.dir}${path.sep}policy`),
        Buffer.from([0xff]),
        Buffer.from('.txt'),
      ]);
      writeRawFile(name, 'new file\n', context);

      try {
        const metadata = await workspace.metadata();

        // Git's listing is read as text, which changes this name, so the file cannot be added
        // under the name that was read. It must not disappear from the account of the changes.
        expect(metadata.workspaceDiff ?? '').toContain('+tampered');
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toMatch(
          /\[diff incomplete: 1 changed path\(s\) could not be included: "policy/,
        );
      } finally {
        // Removing the workspace by its text name would not find this file either.
        fs.rmSync(name);
      }
    });

    it.each(['file', 'fifo'] as const)(
      'respects literal colon-prefixed ignore rules for an untracked %s',
      async (kind) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': ':cache\n:(top)literal\n' });
        const workspace = await create(source, 'git');
        for (const name of [':cache', ':(top)literal']) {
          if (kind === 'fifo') {
            execFileSync('mkfifo', [path.join(workspace.dir, name)]);
          } else {
            write(path.join(workspace.dir, name), 'ignored artifact\n');
          }
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiff).toBe('');
        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      },
    );

    it.for([
      ['wildcard', 'policy???.txt\n'],
      ['literal', 'policy\uFFFD.txt\n'],
    ])(
      'does not excuse lossy file or fifo names using a colliding %s ignore rule',
      async ([_kind, rule], context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': rule });
        for (const kind of ['file', 'fifo']) {
          const workspace = await create(source, 'git');
          const name = Buffer.concat([
            Buffer.from(`${workspace.dir}${path.sep}policy`),
            Buffer.from([0xff]),
            Buffer.from('.txt'),
          ]);
          writeRawFile(name, 'hidden change\n', context);
          try {
            if (kind === 'fifo') {
              fs.rmSync(name);
              const temporary = path.join(workspace.dir, 'pipe');
              execFileSync('mkfifo', [temporary]);
              createRawPath(name, context, () => fs.renameSync(temporary, name));
            }
            // Query actual bytes, independently of the decoded path seen by metadata().
            expect(() =>
              execFileSync(
                'git',
                ['-C', workspace.dir, 'check-ignore', '--no-index', '-z', '--stdin'],
                {
                  input: Buffer.concat([
                    Buffer.from('policy'),
                    Buffer.from([0xff]),
                    Buffer.from('.txt\0'),
                  ]),
                },
              ),
            ).toThrow();

            const metadata = await workspace.metadata();

            expect(metadata.workspaceDiffError).toBeUndefined();
            expect(metadata.workspaceDiffIncomplete).toBe(true);
            expect(metadata.workspaceDiff).toContain('"policy\\u{fffd}.txt"');
          } finally {
            fs.rmSync(name);
          }
        }
      },
    );

    it('does not let a name with pathspec magic borrow the ignore rule of another path', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'actual-file\n' });
      const workspace = await create(source);
      // Read as a pathspec, this name means "actual-file", which the commit ignores.
      execFileSync('mkfifo', [path.join(workspace.dir, ':(top)actual-file')]);

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toBe(
        '[diff incomplete: 1 changed path(s) could not be included: ":(top)actual-file"]',
      );
    });

    it('marks the diff incomplete when .git was replaced with a link to another repository', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'ignored.txt\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'ignored.txt'), 'added by the agent\n');
      git(workspace.dir, 'add', '--force', 'ignored.txt');
      write(path.join(workspace.dir, 'README.md'), 'original\ntampered\n');
      // The source repository's index is readable and does not hold the added file.
      fs.rmSync(path.join(workspace.dir, '.git'), { recursive: true });
      fs.symlinkSync(path.join(source, '.git'), path.join(workspace.dir, '.git'));

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('+tampered');
      expect(workspaceDiff).toContain(UNREADABLE_INDEX_NOTE);
      expect(workspaceDiffIncomplete).toBe(true);
    });

    it('names a tracked file below a readable directory that can no longer be searched', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { 'hidden/policy.txt': 'safe\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'README.md'), 'visible change\n');
      write(path.join(workspace.dir, 'hidden', 'policy.txt'), 'hidden change\n');
      fs.chmodSync(path.join(workspace.dir, 'hidden'), 0o400);
      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+visible change');
        expect(metadata.workspaceDiff).toContain('hidden/policy.txt');
      } finally {
        fs.chmodSync(path.join(workspace.dir, 'hidden'), 0o700);
      }
    });

    it.for(['empty', 'reserved'] as const)(
      'does not traverse a valid sibling of an undecodable %s directory',
      async (kind, context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { 'policy\uFFFD/keep.txt': 'safe\n' });
        const workspace = await create(source);
        const raw = Buffer.concat([
          Buffer.from(`${workspace.dir}${path.sep}policy`),
          Buffer.from([0xff]),
        ]);
        createRawDirectory(raw, context);
        if (kind === 'reserved') {
          createRawDirectory(Buffer.concat([raw, Buffer.from('/.git')]), context);
          writeRawFile(Buffer.concat([raw, Buffer.from('/.git/payload')]), 'hidden', context);
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('policy\\u{fffd}/');
        expect(fs.readFileSync(path.join(workspace.dir, 'policy\uFFFD', 'keep.txt'), 'utf8')).toBe(
          'safe\n',
        );
      },
    );

    it('preserves a tracked directory with a valid UTF-8 replacement character', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { 'policy\uFFFD/keep.txt': 'safe\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'policy\uFFFD', 'keep.txt'), 'visible change\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
      expect(metadata.workspaceDiff).toContain('+visible change');
    });

    it.for(['literal', 'raw', 'empty', 'unreadable'] as const)(
      'preserves ignore negations for %s ancestor queries',
      async (kind, context) => {
        if (
          (kind === 'raw' && process.platform === 'win32') ||
          (kind === 'unreadable' && !canMakeUnreadable)
        ) {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': 'vendor/*\n!vendor/policy*\n' });
        const workspace = await create(source);
        const vendor = path.join(workspace.dir, 'vendor');
        fs.mkdirSync(vendor);
        if (kind === 'literal') {
          write(path.join(vendor, 'policy\uFFFD.txt'), 'visible\n');
        } else if (kind === 'raw') {
          writeRawFile(
            Buffer.concat([Buffer.from(`${vendor}/policy`), Buffer.from([0xff])]),
            'hidden',
            context,
          );
        } else if (kind === 'unreadable') {
          write(path.join(vendor, 'policy.txt'), 'hidden\n');
          fs.chmodSync(vendor, 0o000);
        }
        try {
          const metadata = await workspace.metadata();

          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(kind === 'literal' ? undefined : true);
          expect(metadata.workspaceDiff).toContain('vendor/');
        } finally {
          fs.chmodSync(vendor, 0o700);
        }
      },
    );

    it('does not scan all tracked references for each ignored special file', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      const files: Record<string, string> = { '.gitignore': 'ignored-*\n' };
      for (let i = 0; i < 32; i++) {
        files[`tracked/${i}.txt`] = 'safe\n';
      }
      makeRepository(source, files);
      const workspace = await create(source);
      for (let i = 0; i < 32; i++) {
        execFileSync('mkfifo', [path.join(workspace.dir, `ignored-${i}`)]);
      }
      const original = String.prototype.startsWith;
      let comparisons = 0;
      const startsWith = vi.spyOn(String.prototype, 'startsWith').mockImplementation(function (
        this: string,
        search,
        position,
      ) {
        if (/^ignored-\d+\/$/.test(search)) {
          comparisons++;
        }
        return original.call(this, search, position);
      });
      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiff).toBe('');
        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
        expect(comparisons).toBeLessThanOrEqual(64);
      } finally {
        startsWith.mockRestore();
      }
    });

    it('keeps the diff when a copied ignore file is replaced with a directory', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'ignored/\n' });
      const workspace = await create(source);
      fs.unlinkSync(path.join(workspace.dir, '.gitignore'));
      write(path.join(workspace.dir, '.gitignore', 'nested', '.git', 'payload'), 'hidden\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiffIncomplete).toBe(true);
      expect(metadata.workspaceDiff).toContain('.gitignore/nested/.git/');
      expect(fs.readFileSync(path.join(source, '.gitignore'), 'utf8')).toBe('ignored/\n');
    });

    it.each(['EEXIST', 'ENOTDIR', 'EACCES'] as const)(
      'handles %s while preparing a case alias of a copied ignore file',
      async (code) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': 'ignored/\n' });
        const workspace = await create(source);
        fs.unlinkSync(path.join(workspace.dir, '.gitignore'));
        fs.mkdirSync(path.join(workspace.dir, '.GITIGNORE'));
        write(path.join(workspace.dir, 'README.md'), 'visible change\n');
        const original = fs.promises.mkdir;
        let collisions = 0;
        const mkdir = vi.spyOn(fs.promises, 'mkdir').mockImplementation(async (...args) => {
          const directory = String(args[0]);
          if (
            path.basename(directory) === '.GITIGNORE' &&
            path.basename(path.dirname(directory)) === 'ignore'
          ) {
            // Model the scratch file collision on a case-insensitive filesystem.
            collisions++;
            throw Object.assign(new Error(`${code}: copied ignore file collision`), { code });
          }
          return original(...args);
        });
        try {
          const metadata = await workspace.metadata();
          expect(collisions).toBeGreaterThan(0);
          if (code === 'EACCES') {
            expect(metadata.workspaceDiffError).toContain('EACCES');
            expect(metadata.workspaceDiff).toBeUndefined();
          } else {
            expect(metadata.workspaceDiffError).toBeUndefined();
            expect(metadata.workspaceDiff).toContain('+visible change');
            expect(metadata.workspaceDiffIncomplete).toBe(true);
            expect(metadata.workspaceDiff).toContain('.GITIGNORE/');
          }
        } finally {
          mkdir.mockRestore();
        }
      },
    );

    it.each([
      'file',
      'symlink',
      'deleted',
      'recreated',
      'unreadable',
      'zero-inode',
      'not-directory',
      'timeout',
      'abort',
    ] as const)(
      'uses observed %s parents when filesystem and Git Unicode spellings differ',
      async (kind) => {
        if (kind === 'symlink' && process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { 'café/keep.txt': 'safe\n' });
        if (kind === 'symlink') {
          fs.unlinkSync(path.join(source, 'café', 'keep.txt'));
          fs.symlinkSync('../README.md', path.join(source, 'café', 'keep.txt'));
          git(source, 'add', '--all');
          git(source, 'commit', '-qm', 'track link');
        }
        const controller = new AbortController();
        const workspace = await create(source, 'git', controller.signal);
        if (kind === 'recreated') {
          fs.rmSync(path.join(workspace.dir, 'café'), { recursive: true });
          fs.mkdirSync(path.join(workspace.dir, 'café'));
        } else if (kind !== 'file' && kind !== 'symlink') {
          fs.unlinkSync(path.join(workspace.dir, 'café', 'keep.txt'));
        }
        const physicalPath = (value: fs.PathLike) => {
          const text = String(value);
          return text.startsWith(`${workspace.dir}${path.sep}`) ? text.normalize('NFC') : value;
        };
        const originalAccess = fs.promises.access;
        const access = vi
          .spyOn(fs.promises, 'access')
          .mockImplementation((file, mode) => originalAccess(physicalPath(file), mode));
        const originalLstat = fs.promises.lstat;
        const start = performance.now();
        const now = vi.spyOn(performance, 'now').mockReturnValue(start);
        let identityLookups = 0;
        const lstat = vi
          .spyOn(fs.promises, 'lstat')
          .mockImplementation(async (file, ...options) => {
            const result = await originalLstat(physicalPath(file), ...options);
            if (String(file) === path.join(workspace.dir, 'café') && options[0]?.bigint) {
              identityLookups++;
              if (kind === 'unreadable') {
                throw Object.assign(new Error('Unreadable baseline directory'), { code: 'EACCES' });
              }
              if (kind === 'timeout') {
                now.mockReturnValue(start + 30_001);
              } else if (kind === 'abort') {
                controller.abort();
              }
              if (kind === 'zero-inode' || kind === 'not-directory') {
                return new Proxy(result, {
                  get(target, property, receiver) {
                    if (kind === 'zero-inode' && property === 'ino') {
                      return 0n;
                    }
                    if (kind === 'not-directory' && property === 'isDirectory') {
                      return () => false;
                    }
                    return Reflect.get(target, property, receiver);
                  },
                });
              }
            }
            return result;
          });
        const originalOpendir = fs.promises.opendir;
        const opendir = vi
          .spyOn(fs.promises, 'opendir')
          .mockImplementation(async (file, options) => {
            const directory = await originalOpendir(physicalPath(file), options);
            return {
              async *[Symbol.asyncIterator]() {
                for await (const entry of directory) {
                  yield new Proxy(entry, {
                    get(target, property, receiver) {
                      if (property === 'name') {
                        // Model decomposing directory entries while real Git reports NFC.
                        return Buffer.from(String(target.name).normalize('NFD'));
                      }
                      return Reflect.get(target, property, receiver);
                    },
                  });
                }
              },
            } as fs.Dir;
          });
        try {
          if (kind === 'abort') {
            await expect(workspace.metadata()).rejects.toMatchObject({ name: 'AbortError' });
            expect(identityLookups).toBe(1);
            expect(fs.readdirSync(path.dirname(workspace.dir))).toEqual(['workspace']);
            return;
          }
          const metadata = await workspace.metadata();
          if (kind === 'timeout') {
            expect(metadata.workspaceDiffError).toContain(
              'directory verification exceeded 30000 ms',
            );
            expect(metadata.workspaceDiff).toBeUndefined();
            expect(identityLookups).toBe(1);
            expect(fs.readdirSync(path.dirname(workspace.dir))).toEqual(['workspace']);
            return;
          }
          expect(metadata.workspaceDiffError).toBeUndefined();
          const unconfirmed = ['unreadable', 'zero-inode', 'not-directory'].includes(kind);
          expect(metadata.workspaceDiffIncomplete).toBe(unconfirmed ? true : undefined);
          if (kind !== 'file' && kind !== 'symlink') {
            expect(metadata.workspaceDiff).toContain('-safe');
            expect(metadata.workspaceDiff).toContain('deleted file mode');
          } else {
            expect(metadata.workspaceDiff).toBe('');
          }
        } finally {
          opendir.mockRestore();
          lstat.mockRestore();
          now.mockRestore();
          access.mockRestore();
        }
      },
    );

    it.each([false, true])(
      'does not borrow coverage from a distinct Unicode directory (deleted child: %s)',
      async (deleted) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { 'café/keep.txt': 'safe\n' });
        const workspace = await create(source);
        const composed = path.join(workspace.dir, 'café');
        const decomposed = path.join(workspace.dir, 'cafe\u0301');
        fs.mkdirSync(decomposed, { recursive: true });
        const sameDirectory = fs.statSync(composed).ino === fs.statSync(decomposed).ino;
        if (deleted) {
          fs.unlinkSync(path.join(composed, 'keep.txt'));
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        // Byte-preserving filesystems have a new, genuinely empty directory. Normalizing
        // filesystems resolve both spellings to the unchanged populated directory instead.
        expect(metadata.workspaceDiffIncomplete).toBe(sameDirectory ? undefined : true);
        if (sameDirectory) {
          if (deleted) {
            expect(metadata.workspaceDiff).toContain('-safe');
          } else {
            expect(metadata.workspaceDiff).toBe('');
          }
        } else {
          expect(metadata.workspaceDiff).toContain('[diff incomplete:');
        }
      },
    );

    it.for([false, true])(
      'bounds omission checks for undecodable files (unknown entry types: %s)',
      async (unknownTypes, context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        const workspace = await create(source);
        const count = 32;
        for (let i = 0; i < count; i++) {
          writeRawFile(
            Buffer.concat([
              Buffer.from(`${workspace.dir}/raw-${i}`),
              Buffer.from([0xff]),
              Buffer.from('.txt'),
            ]),
            'hidden\n',
            context,
          );
        }
        const opendir = unknownTypes ? omitDirectoryEntryTypes() : undefined;
        const original = String.prototype.endsWith;
        let comparisons = 0;
        const endsWith = vi.spyOn(String.prototype, 'endsWith').mockImplementation(function (
          this: string,
          search,
          length,
        ) {
          if (search === '/' && /^raw-\d+\uFFFD\.txt$/.test(String(this))) {
            comparisons++;
          }
          return original.call(this, search, length);
        });
        try {
          const metadata = await workspace.metadata();

          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(true);
          expect(comparisons).toBeLessThanOrEqual(8 * count);
        } finally {
          endsWith.mockRestore();
          opendir?.mockRestore();
        }
      },
    );

    it.for([false, true])(
      'checks directory names without entry types (raw-byte collision: %s)',
      async (collision, context) => {
        if (collision && process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { 'policy\uFFFD/keep.txt': 'safe\n' });
        const workspace = await create(source);
        write(path.join(workspace.dir, 'policy\uFFFD', 'keep.txt'), 'visible change\n');
        if (collision) {
          const raw = Buffer.concat([Buffer.from(`${workspace.dir}/policy`), Buffer.from([0xff])]);
          createRawDirectory(raw, context);
          createRawDirectory(Buffer.concat([raw, Buffer.from('/.git')]), context);
          writeRawFile(Buffer.concat([raw, Buffer.from('/.git/payload')]), 'hidden\n', context);
        }
        const opendir = omitDirectoryEntryTypes();
        try {
          const metadata = await workspace.metadata();

          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(collision ? true : undefined);
          expect(metadata.workspaceDiff).toContain('+visible change');
        } finally {
          opendir.mockRestore();
        }
      },
    );

    it.for(['file', 'empty-directory', 'child', 'noncolliding-directory'] as const)(
      'keeps a new valid UTF-8 path beside a raw baseline path (%s)',
      async (kind, context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        const rawName = Buffer.concat([Buffer.from('policy'), Buffer.from([0xff])]);
        const rawSource = Buffer.concat([Buffer.from(`${source}/`), rawName]);
        if (kind === 'file') {
          writeRawFile(rawSource, 'original\n', context);
        } else {
          createRawDirectory(rawSource, context);
          writeRawFile(Buffer.concat([rawSource, Buffer.from('/keep.txt')]), 'original\n', context);
        }
        git(source, 'add', '--all');
        git(source, 'commit', '-qm', 'track raw-byte path');
        const workspace = await create(source, 'git');
        const name = kind === 'noncolliding-directory' ? 'other\uFFFD' : 'policy\uFFFD';
        if (kind === 'empty-directory') {
          fs.mkdirSync(path.join(workspace.dir, name));
        } else {
          write(
            path.join(workspace.dir, name, ...(kind === 'file' ? [] : ['keep.txt'])),
            'new visible payload\n',
          );
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(
          kind === 'empty-directory' || kind === 'child' ? true : undefined,
        );
        if (kind === 'empty-directory') {
          expect(metadata.workspaceDiff).toContain('policy\\u{fffd}/');
        } else {
          expect(metadata.workspaceDiff).toContain('+new visible payload');
        }
      },
    );

    it.each(['abort', 'timeout'] as const)(
      'stops ignore-directory preparation on %s without staging unclassified files',
      async (kind) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': '.env\n' });
        const controller = new AbortController();
        const workspace = await create(source, 'git', controller.signal);
        for (let i = 0; i < 3; i++) {
          fs.mkdirSync(path.join(workspace.dir, `probe-${i}`));
        }
        write(path.join(workspace.dir, '.env'), 'SYNTHETIC_PRIVATE_VALUE=not-a-real-secret\n');
        write(path.join(workspace.dir, 'README.md'), 'visible change\n');
        const start = performance.now();
        const now = vi.spyOn(performance, 'now').mockReturnValue(start);
        const original = fs.promises.mkdir;
        let prepared = 0;
        const mkdir = vi.spyOn(fs.promises, 'mkdir').mockImplementation(async (...args) => {
          const result = await original(...args);
          if (
            path.basename(path.dirname(String(args[0]))) === 'ignore' &&
            path.basename(String(args[0])).startsWith('probe-')
          ) {
            prepared++;
            if (kind === 'abort') {
              controller.abort();
            } else {
              now.mockReturnValue(start + 30_001);
            }
          }
          return result;
        });
        try {
          if (kind === 'abort') {
            await expect(workspace.metadata()).rejects.toMatchObject({ name: 'AbortError' });
          } else {
            const metadata = await workspace.metadata();
            expect(metadata.workspaceDiffError).toContain('ignore preparation exceeded 30000 ms');
            expect(metadata.workspaceDiff).toBeUndefined();
            expect(JSON.stringify(metadata)).not.toContain('SYNTHETIC_PRIVATE_VALUE');
          }
          expect(prepared).toBe(1);
          expect(fs.readdirSync(path.dirname(workspace.dir))).toEqual(['workspace']);
        } finally {
          mkdir.mockRestore();
          now.mockRestore();
        }
      },
    );

    it.for(['unicode', 'raw-parent'] as const)(
      'preserves exact pathnames in Node’s native unknown-type fallback (%s)',
      async (kind, context) => {
        if (kind === 'raw-parent' && process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { 'café.txt': 'original\n' });
        const rawName = Buffer.concat([Buffer.from('policy'), Buffer.from([0xff])]);
        if (kind === 'raw-parent') {
          const parent = Buffer.concat([Buffer.from(`${source}/`), rawName]);
          createRawDirectory(parent, context);
          writeRawFile(Buffer.concat([parent, Buffer.from('/café.txt')]), 'original\n', context);
          git(source, 'add', '--all');
          git(source, 'commit', '-qm', 'track raw parent');
        }
        const workspace = await create(source, 'git');
        const file =
          kind === 'raw-parent'
            ? Buffer.concat([Buffer.from(`${workspace.dir}/`), rawName, Buffer.from('/café.txt')])
            : path.join(workspace.dir, 'café.txt');
        writeRawFile(Buffer.from(file), 'visible change\n', context);
        const opendir = forceNativeUnknownDirectoryEntryTypes();
        try {
          const metadata = await workspace.metadata();
          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBeUndefined();
          expect(metadata.workspaceDiff).toContain('+visible change');
        } finally {
          opendir.mockRestore();
        }
      },
    );

    it.for(['ignored', 'staged', 'ignored-colon', 'staged-colon', 'raw-staged-collision'] as const)(
      'uses exact ignore and index identities for a new valid UTF-8 file (%s)',
      async (kind, context) => {
        if (
          (kind === 'raw-staged-collision' || kind.endsWith('-colon')) &&
          process.platform === 'win32'
        ) {
          return;
        }
        const source = path.join(root, 'repo');
        const name = `${kind.endsWith('-colon') ? ':' : ''}policy\uFFFD.txt`;
        makeRepository(source, { '.gitignore': 'policy*\n:policy*\n' });
        const workspace = await create(source, 'git');
        write(path.join(workspace.dir, name), 'ignored private fixture\n');
        if (kind.startsWith('staged')) {
          git(workspace.dir, '--literal-pathspecs', 'add', '--force', name);
        } else if (kind === 'raw-staged-collision') {
          const raw = Buffer.concat([
            Buffer.from(`${workspace.dir}/policy`),
            Buffer.from([0xff]),
            Buffer.from('.txt'),
          ]);
          writeRawFile(raw, 'raw staged fixture\n', context);
          git(workspace.dir, 'add', '--force', '--all');
          git(workspace.dir, 'reset', '--', name);
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(
          kind === 'raw-staged-collision' ? true : undefined,
        );
        if (kind.startsWith('staged')) {
          expect(metadata.workspaceDiff).toContain('+ignored private fixture');
        } else {
          expect(metadata.workspaceDiff).not.toContain('ignored private fixture');
          if (kind.startsWith('ignored')) {
            expect(metadata.workspaceDiff).toBe('');
          }
        }
      },
    );

    it.for(['empty', 'child', 'colon-empty', 'colon-child'] as const)(
      'ignores only the exact new Unicode directory beside a raw baseline (%s)',
      async (kind, context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        const prefix = kind.startsWith('colon-') ? ':policy' : 'policy';
        const name = `${prefix}\uFFFD`;
        makeRepository(source, { '.gitignore': `${name}/\n` });
        const rawName = Buffer.concat([Buffer.from(prefix), Buffer.from([0xff])]);
        const rawSource = Buffer.concat([Buffer.from(`${source}/`), rawName]);
        createRawDirectory(rawSource, context);
        writeRawFile(Buffer.concat([rawSource, Buffer.from('/keep.txt')]), 'original\n', context);
        git(source, 'add', '--all');
        git(source, 'commit', '-qm', 'track raw directory');
        const workspace = await create(source, 'git');
        fs.mkdirSync(path.join(workspace.dir, name));
        if (kind.endsWith('child')) {
          write(path.join(workspace.dir, name, 'keep.txt'), 'ignored private fixture\n');
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
        expect(metadata.workspaceDiff).toBe('');
      },
    );

    it.each(['abort', 'timeout'] as const)(
      'stops new-file verification on %s and removes its scratch repository',
      async (kind) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const controller = new AbortController();
        const workspace = await create(source, 'git', controller.signal);
        for (let i = 0; i < 3; i++) {
          write(path.join(workspace.dir, `new-${i}.txt`), 'new file\n');
        }
        const start = performance.now();
        const now = vi.spyOn(performance, 'now').mockReturnValue(start);
        const original = fs.promises.lstat;
        let examined = 0;
        const lstat = vi.spyOn(fs.promises, 'lstat').mockImplementation(async (...args) => {
          const result = await original(...args);
          if (String(args[0]).startsWith(path.join(workspace.dir, 'new-'))) {
            examined++;
            if (kind === 'abort') {
              controller.abort();
            } else {
              now.mockReturnValue(start + 30_001);
            }
          }
          return result;
        });
        try {
          if (kind === 'abort') {
            await expect(workspace.metadata()).rejects.toMatchObject({ name: 'AbortError' });
          } else {
            const metadata = await workspace.metadata();
            expect(metadata.workspaceDiffError).toContain('file verification exceeded 30000 ms');
            expect(metadata.workspaceDiff).toBeUndefined();
          }
          expect(examined).toBe(1);
          expect(fs.readdirSync(path.dirname(workspace.dir))).toEqual(['workspace']);
        } finally {
          lstat.mockRestore();
          now.mockRestore();
        }
      },
    );

    it('bounds empty-directory classification by path depth rather than repository count', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source, 'git');
      const count = 16;
      for (let i = 0; i < count; i++) {
        const nested = path.join(workspace.dir, `repo-${i}`);
        makeRepository(nested);
        fs.mkdirSync(path.join(nested, 'empty'));
      }
      const original = String.prototype.startsWith;
      let comparisons = 0;
      const startsWith = vi.spyOn(String.prototype, 'startsWith').mockImplementation(function (
        this: string,
        search,
        position,
      ) {
        if (/^repo-\d+\/$/.test(search)) {
          comparisons++;
        }
        return original.call(this, search, position);
      });
      try {
        const metadata = await workspace.metadata();
        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('repo-0');
        expect(comparisons).toBeLessThanOrEqual(4 * count);
      } finally {
        startsWith.mockRestore();
      }
    });

    it.for([
      'ignored-fifo',
      'ignored-socket',
      'unignored-fifo',
      'raw-alias',
      'raw-baseline',
      'tracked-fifo',
    ] as const)(
      'uses exact pathname identities for omitted Unicode special files (%s)',
      async (kind, context) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        const name = 'policy\uFFFD.sock';
        const rawName = Buffer.concat([
          Buffer.from('policy'),
          Buffer.from([0xff]),
          Buffer.from('.sock'),
        ]);
        makeRepository(source, { '.gitignore': kind === 'unignored-fifo' ? '' : `${name}\n` });
        if (kind === 'raw-baseline') {
          writeRawFile(Buffer.concat([Buffer.from(`${source}/`), rawName]), 'original\n', context);
          git(source, 'add', '--all');
          git(source, 'commit', '-qm', 'track raw file');
        } else if (kind === 'tracked-fifo') {
          write(path.join(source, name), 'original\n');
          git(source, 'add', '--force', name);
          git(source, 'commit', '-qm', 'track ignored Unicode file');
        }
        const workspace = await create(source, 'git');
        const file = path.join(workspace.dir, name);
        if (kind === 'tracked-fifo') {
          fs.unlinkSync(file);
        }
        let close: (() => Promise<void>) | undefined;
        if (kind === 'ignored-socket') {
          close = await listenIn(workspace.dir, name);
        } else {
          execFileSync('mkfifo', [file]);
        }
        if (kind === 'raw-alias') {
          const temporary = path.join(workspace.dir, 'raw-pipe');
          execFileSync('mkfifo', [temporary]);
          const raw = Buffer.concat([Buffer.from(`${workspace.dir}/`), rawName]);
          createRawPath(raw, context, () => fs.renameSync(temporary, raw));
        }
        try {
          const metadata = await workspace.metadata();
          const incomplete = ['unignored-fifo', 'raw-alias', 'tracked-fifo'].includes(kind);
          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(incomplete ? true : undefined);
          if (incomplete) {
            expect(metadata.workspaceDiff).toContain('policy\\u{fffd}.sock');
          } else {
            expect(metadata.workspaceDiff).toBe('');
          }
        } finally {
          await close?.();
        }
      },
    );

    it.for(
      (['reserved', 'empty', 'unsearchable'] as const).flatMap((kind) =>
        (['ascii', 'valid', 'colon', 'raw', 'collision'] as const).flatMap((name) =>
          (name === 'collision' ? [true] : [false, true]).map((ignored) => ({
            kind,
            name,
            ignored,
          })),
        ),
      ),
    )(
      'keeps ignore provenance for $kind paths ($name, ignored=$ignored)',
      async ({ kind, name, ignored }, context) => {
        if (kind === 'unsearchable' && !canMakeUnreadable) {
          context.skip('This runtime cannot make directories unsearchable with chmod');
        }
        if (
          process.platform === 'win32' &&
          (kind === 'unsearchable' || ['colon', 'raw', 'collision'].includes(name))
        ) {
          return;
        }
        const source = path.join(root, 'repo');
        const valid = Buffer.from(
          name === 'ascii' ? 'policy' : name === 'colon' ? ':policy\uFFFD' : 'policy\uFFFD',
        );
        const raw = Buffer.concat([Buffer.from('policy'), Buffer.from([0xff])]);
        const parents = name === 'collision' ? [valid, raw] : [name === 'raw' ? raw : valid];
        const child = kind === 'reserved' ? '.git' : 'ignored';
        const pattern = name === 'collision' ? `policy\uFFFD/${child}/\n` : `**/${child}/\n`;
        makeRepository(source, { '.gitignore': ignored ? pattern : '' });
        for (const parent of parents) {
          const directory = Buffer.concat([Buffer.from(`${source}/`), parent]);
          createRawDirectory(directory, context);
          writeRawFile(Buffer.concat([directory, Buffer.from('/keep.txt')]), 'baseline\n', context);
        }
        git(source, 'add', '--all');
        git(source, 'commit', '-qm', 'track parent paths');
        const workspace = await create(source, 'git');
        const directories: Buffer[] = [];
        try {
          for (const parent of parents) {
            const directory = Buffer.concat([
              Buffer.from(`${workspace.dir}/`),
              parent,
              Buffer.from(`/${child}`),
            ]);
            createRawDirectory(directory, context);
            directories.push(directory);
            writeRawFile(
              Buffer.concat([directory, Buffer.from(kind === 'reserved' ? '/HEAD' : '/note.txt')]),
              kind === 'reserved' ? 'ref: x\n' : 'ignored content\n',
              context,
            );
          }
          if (kind === 'empty') {
            git(workspace.dir, 'add', '--all', '--force');
            for (const directory of directories) {
              fs.unlinkSync(Buffer.concat([directory, Buffer.from('/note.txt')]));
            }
          } else if (kind === 'unsearchable') {
            for (const directory of directories) {
              fs.chmodSync(directory, 0o600);
            }
          }
          const metadata = await workspace.metadata();
          const incomplete = !ignored || name === 'raw' || name === 'collision';
          expect(metadata.workspaceDiffError).toBeUndefined();
          expect(metadata.workspaceDiffIncomplete).toBe(incomplete ? true : undefined);
          if (incomplete) {
            expect(metadata.workspaceDiff).toContain('diff incomplete');
          } else {
            expect(metadata.workspaceDiff).toBe('');
          }
        } finally {
          for (const directory of directories) {
            fs.chmodSync(directory, 0o700);
          }
        }
      },
    );

    it.each(['abort', 'timeout'] as const)(
      'does not open another directory after access causes %s',
      async (kind) => {
        const source = path.join(root, 'repo');
        makeRepository(source);
        const controller = new AbortController();
        const workspace = await create(source, 'git', controller.signal);
        write(path.join(workspace.dir, 'README.md'), 'original\nvisible change\n');
        const start = performance.now();
        const now = vi.spyOn(performance, 'now').mockReturnValue(start);
        const original = fs.promises.access;
        const opendir = vi.spyOn(fs.promises, 'opendir');
        let openedBeforeStop: number | undefined;
        const access = vi.spyOn(fs.promises, 'access').mockImplementation(async (...args) => {
          await original(...args);
          if (path.resolve(String(args[0])) === workspace.dir) {
            openedBeforeStop = opendir.mock.calls.length;
            if (kind === 'abort') {
              controller.abort();
            } else {
              now.mockReturnValue(start + 30_001);
            }
          }
        });
        try {
          if (kind === 'abort') {
            await expect(workspace.metadata()).rejects.toMatchObject({ name: 'AbortError' });
          } else {
            const metadata = await workspace.metadata();
            expect(metadata.workspaceDiffError).toBeUndefined();
            expect(metadata.workspaceDiffIncomplete).toBe(true);
            expect(metadata.workspaceDiff).toContain('+visible change');
            expect(metadata.workspaceDiff).toContain('workspace traversal exceeded 30000 ms');
          }
          expect(openedBeforeStop).toBeDefined();
          expect(opendir).toHaveBeenCalledTimes(openedBeforeStop!);
          expect(fs.readdirSync(path.dirname(workspace.dir))).toEqual(['workspace']);
        } finally {
          opendir.mockRestore();
          access.mockRestore();
          now.mockRestore();
        }
      },
    );

    it('ends traversal at the Git deadline and closes open directory handles', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source, 'git');
      write(path.join(workspace.dir, 'README.md'), 'visible change\n');
      const slow = path.join(workspace.dir, 'over-budget');
      fs.mkdirSync(path.join(slow, 'child'), { recursive: true });
      const opened: fs.Dir[] = [];
      const original = fs.promises.opendir;
      const start = performance.now();
      const now = vi.spyOn(performance, 'now').mockReturnValue(start);
      const opendir = vi.spyOn(fs.promises, 'opendir').mockImplementation(async (...args) => {
        const directory = await original(...args);
        opened.push(directory);
        if (path.resolve(String(args[0])) === slow) {
          now.mockReturnValue(start + 30_001);
        }
        return directory;
      });
      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+visible change');
        expect(metadata.workspaceDiff).toContain('workspace traversal exceeded 30000 ms');
        expect(
          opendir.mock.calls.some(([dir]) =>
            path.resolve(String(dir)).startsWith(`${slow}${path.sep}`),
          ),
        ).toBe(false);
        expect(opened.length).toBeGreaterThan(0);
        for (const directory of opened) {
          await expect(directory.read()).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
        }
      } finally {
        opendir.mockRestore();
        now.mockRestore();
      }
    });

    it.for([
      'unchanged-file',
      'changed-file',
      'unchanged-parent',
      'changed-parent',
      'new-empty',
      'new-fifo',
      'new-reserved',
      'new-collision',
      'file-symlink',
      'parent-symlink',
      'file-fifo',
    ])('examines exact baseline raw-byte paths (%s)', async (scenario, context) => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      const rawName = Buffer.concat([Buffer.from('policy'), Buffer.from([0xff])]);
      const rawSource = Buffer.concat([Buffer.from(`${source}/`), rawName]);
      const directory = [
        'unchanged-parent',
        'changed-parent',
        'new-empty',
        'new-fifo',
        'new-reserved',
        'parent-symlink',
      ].includes(scenario);
      if (directory) {
        createRawDirectory(rawSource, context);
      }
      writeRawFile(
        directory ? Buffer.concat([rawSource, Buffer.from('/keep.txt')]) : rawSource,
        'original\n',
        context,
      );
      git(source, 'add', '--all');
      git(source, 'commit', '-qm', 'track raw-byte path');
      const workspace = await create(source, 'git');
      const raw = Buffer.concat([Buffer.from(`${workspace.dir}/`), rawName]);
      if (scenario.startsWith('changed')) {
        writeRawFile(
          directory ? Buffer.concat([raw, Buffer.from('/keep.txt')]) : raw,
          'visible change\n',
          context,
        );
      }
      if (scenario === 'new-empty') {
        createRawDirectory(Buffer.concat([raw, Buffer.from('/enabled.d')]), context);
      } else if (scenario === 'new-fifo') {
        const temporary = path.join(workspace.dir, 'pipe');
        execFileSync('mkfifo', [temporary]);
        const pipe = Buffer.concat([raw, Buffer.from('/pipe')]);
        createRawPath(pipe, context, () => fs.renameSync(temporary, pipe));
      } else if (scenario === 'new-reserved') {
        createRawDirectory(Buffer.concat([raw, Buffer.from('/.git')]), context);
        writeRawFile(Buffer.concat([raw, Buffer.from('/.git/payload')]), 'hidden\n', context);
      } else if (scenario === 'new-collision') {
        writeRawFile(
          Buffer.concat([Buffer.from(`${workspace.dir}/policy`), Buffer.from([0xfe])]),
          'hidden new file\n',
          context,
        );
      } else if (scenario.endsWith('symlink')) {
        fs.rmSync(raw, { recursive: directory });
        createRawPath(raw, context, () => fs.symlinkSync('README.md', raw));
      } else if (scenario === 'file-fifo') {
        fs.rmSync(raw);
        const temporary = path.join(workspace.dir, 'pipe');
        execFileSync('mkfifo', [temporary]);
        createRawPath(raw, context, () => fs.renameSync(temporary, raw));
      }
      const opendir = directory ? omitDirectoryEntryTypes() : undefined;
      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(
          scenario.startsWith('new-') || scenario === 'parent-symlink' || scenario === 'file-fifo'
            ? true
            : undefined,
        );
        if (scenario.startsWith('unchanged')) {
          expect(metadata.workspaceDiff).toBe('');
        } else if (scenario.startsWith('changed')) {
          expect(metadata.workspaceDiff).toContain('+visible change');
        } else if (scenario === 'file-symlink') {
          expect(metadata.workspaceDiff).toContain('+README.md');
        } else {
          expect(metadata.workspaceDiff).toContain('policy\\u{fffd}');
        }
      } finally {
        opendir?.mockRestore();
      }
    });

    it.each([false, true])(
      'preserves an ignored tracked file with a valid replacement character (changed: %s)',
      async (changed) => {
        const source = path.join(root, 'repo');
        const name = 'policy\uFFFD.txt';
        makeRepository(source, { '.gitignore': `${name}\n` });
        write(path.join(source, name), 'original\n');
        git(source, 'add', '--force', name);
        git(source, 'commit', '-qm', 'track ignored file');
        const workspace = await create(source, 'git');
        if (changed) {
          write(path.join(workspace.dir, name), 'visible change\n');
        }

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
        if (changed) {
          expect(metadata.workspaceDiff).toContain('+visible change');
        } else {
          expect(metadata.workspaceDiff).toBe('');
        }
      },
    );

    it('still reports a raw filename colliding with an ignored tracked UTF-8 name', async (context) => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      const name = 'policy\uFFFD.txt';
      makeRepository(source, { '.gitignore': `${name}\n` });
      write(path.join(source, name), 'original\n');
      git(source, 'add', '--force', name);
      git(source, 'commit', '-qm', 'track ignored file');
      const workspace = await create(source, 'git');
      write(path.join(workspace.dir, name), 'visible change\n');
      const raw = Buffer.concat([
        Buffer.from(`${workspace.dir}${path.sep}policy`),
        Buffer.from([0xff]),
        Buffer.from('.txt'),
      ]);
      writeRawFile(raw, 'hidden new file\n', context);

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiffError).toBeUndefined();
      expect(metadata.workspaceDiffIncomplete).toBe(true);
      expect(metadata.workspaceDiff).toContain('+visible change');
      expect(metadata.workspaceDiff).toContain('policy\\u{fffd}.txt');
      expect(fs.readFileSync(raw, 'utf8')).toBe('hidden new file\n');
    });

    it('includes a new file with a valid UTF-8 replacement character', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      write(path.join(workspace.dir, 'policy\uFFFD.txt'), 'new file\n');

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBeUndefined();
      expect(workspaceDiff).toContain('+new file');
    });

    it('marks the diff incomplete when a changed file is binary', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { 'old.bin': 'x\0y' });
      const workspace = await create(source);
      // One NUL byte makes Git treat a text file as binary and leave its content out.
      write(path.join(workspace.dir, 'README.md'), 'original\n\0hidden payload\n');
      write(path.join(workspace.dir, 'src', 'new.bin'), 'a\0b');
      write(path.join(workspace.dir, 'src', 'app.txt'), 'app\nvisible change\n');
      // A deleted binary file is shown in full by being deleted.
      fs.rmSync(path.join(workspace.dir, 'old.bin'));

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('+visible change');
      expect(workspaceDiff).not.toContain('hidden payload');
      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toContain('[diff incomplete: binary file contents are not included]');
    });

    it('does not mark the diff incomplete for a deleted binary file', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { 'old.bin': 'x\0y' });
      const workspace = await create(source);
      fs.rmSync(path.join(workspace.dir, 'old.bin'));

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('deleted file mode');
      expect(workspaceDiffIncomplete).toBeUndefined();
    });

    it('applies an ignore rule for a name that starts with a colon', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': ':cache\n' });
      const workspace = await create(source);
      // The rule names this file, even though the name reads like pathspec magic.
      write(path.join(workspace.dir, ':cache'), 'ignored\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toBe('');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
    });

    it('applies exact committed ignore rules to actual UTF-8 replacement-character files', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'policy\uFFFD.txt\npolicy???.bin\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'policy\uFFFD.txt'), 'new file\n');
      write(path.join(workspace.dir, 'policy\uFFFD.bin'), 'new file\n');

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBeUndefined();
      expect(workspaceDiff).toBe('');
    });

    it('still ignores such a name below a directory that the commit ignores', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'cache/\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'cache', 'entry\uFFFD.bin'), 'cached\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toBe('');
      expect(metadata.workspaceDiffIncomplete).toBeUndefined();
    });

    it.each([
      ['.git', false],
      ['.GIT', false],
      ['.git', true],
      ['.GIT', true],
    ] as const)(
      'keeps Unicode parent boundaries for %s (ignored parent: %s)',
      async (name, ignored) => {
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': ignored ? 'İİ/\n' : '.g\n' });
        const workspace = await create(source);
        write(path.join(workspace.dir, 'İİ', name, 'payload'), 'hidden\n');

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(ignored ? undefined : true);
        if (ignored) {
          expect(metadata.workspaceDiff).toBe('');
        } else {
          expect(metadata.workspaceDiff).toContain(`İİ/${name}`);
        }
      },
    );

    it('does not open ignored dependency subtrees or ignored empty directory trees', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'node_modules/\ncache/\n' });
      const workspace = await create(source);
      for (let i = 0; i < 24; i++) {
        write(
          path.join(workspace.dir, 'node_modules', `package-${i}`, 'lib', 'index.js'),
          'module.exports = 1;\n',
        );
      }
      fs.mkdirSync(path.join(workspace.dir, 'cache', 'empty', 'deep'), { recursive: true });
      const opendir = vi.spyOn(fs.promises, 'opendir');
      try {
        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiff).toBe('');
        expect(metadata.workspaceDiffIncomplete).toBeUndefined();
        expect(
          opendir.mock.calls.some(([dir]) =>
            ['node_modules', 'cache'].some((name) =>
              String(dir).startsWith(path.join(workspace.dir, name)),
            ),
          ),
        ).toBe(false);
      } finally {
        opendir.mockRestore();
      }
    });

    it('preserves untracked descendants re-included by committed ignore rules', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'vendor/*\n!vendor/keep/\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'vendor', 'ignored', 'file.txt'), 'ignored\n');
      write(path.join(workspace.dir, 'vendor', 'keep', 'file.txt'), 'visible\n');
      write(path.join(workspace.dir, 'vendor', 'keep', '.git', 'payload'), 'hidden\n');

      const metadata = await workspace.metadata();

      expect(metadata.workspaceDiff).toContain('+visible');
      expect(metadata.workspaceDiff).not.toContain('vendor/ignored');
      expect(metadata.workspaceDiff).toContain('vendor/keep/.git');
      expect(metadata.workspaceDiffIncomplete).toBe(true);
    });

    it.each(['baseline', 'staged'] as const)(
      'does not prune an ignored subtree with a %s file replaced by a FIFO',
      async (kind) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source, { '.gitignore': 'vendor/\n' });
        if (kind === 'baseline') {
          write(path.join(source, 'vendor', 'policy.txt'), 'tracked\n');
          git(source, 'add', '--force', 'vendor/policy.txt');
          git(source, 'commit', '-qm', 'track ignored file');
        }
        const workspace = await create(source);
        const file = path.join(workspace.dir, 'vendor', 'policy.txt');
        if (kind === 'staged') {
          write(file, 'staged\n');
          git(workspace.dir, 'add', '--force', 'vendor/policy.txt');
        }
        fs.rmSync(file);
        execFileSync('mkfifo', [file]);

        const metadata = await workspace.metadata();

        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('vendor/policy.txt');
      },
    );

    it('names a new directory without files, which a diff cannot show', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'tmp/\n' });
      const workspace = await create(source);
      write(path.join(workspace.dir, 'notes', 'new.txt'), 'new file\n');
      fs.mkdirSync(path.join(workspace.dir, 'enabled.d'));
      fs.mkdirSync(path.join(workspace.dir, 'notes', 'deep', 'er'), { recursive: true });
      // Neither an ignored directory nor one whose files were deleted is a new directory.
      fs.mkdirSync(path.join(workspace.dir, 'tmp', 'work'), { recursive: true });
      fs.rmSync(path.join(workspace.dir, 'src', 'app.txt'));

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('+++ b/notes/new.txt');
      expect(workspaceDiff).toContain('--- a/src/app.txt');
      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toMatch(
        /\[diff incomplete: 2 changed path\(s\) could not be included: (enabled\.d\/, notes\/deep\/|notes\/deep\/, enabled\.d\/)\]$/,
      );
    });

    it('reports a top-level directory whose name differs from .git only by case', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      const variant = path.join(workspace.dir, '.GIT');
      try {
        fs.mkdirSync(variant);
      } catch {
        // The file system does not tell the two names apart, so there is nothing to hide in.
        return;
      }
      if (fs.existsSync(path.join(variant, 'HEAD'))) {
        return;
      }
      write(path.join(variant, 'policy.txt'), 'hidden\n');

      const metadata = await workspace.metadata();

      // Git may show the file, refuse the path, or leave it out. What must not happen is a
      // diff that looks complete without it.
      expect(
        metadata.workspaceDiff?.includes('policy.txt') ||
          metadata.workspaceDiffIncomplete === true ||
          metadata.workspaceDiffError !== undefined,
      ).toBe(true);
    });

    it('names an ignored directory the agent replaced with a fifo after adding a file in it', async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { '.gitignore': 'tmp\n' });
      const workspace = await create(source);
      const hidden = path.join(workspace.dir, 'tmp');
      write(path.join(hidden, 'policy.txt'), 'added by the agent\n');
      git(workspace.dir, 'add', '--force', 'tmp/policy.txt');
      fs.rmSync(hidden, { recursive: true });
      execFileSync('mkfifo', [hidden]);

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toBe('[diff incomplete: 1 changed path(s) could not be included: tmp]');
    });

    it('stops listing the workspace when the call is cancelled', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const controller = new AbortController();
      const workspace = await create(source, undefined, controller.signal);
      controller.abort(new Error('cancelled'));

      await expect(workspace.metadata()).rejects.toThrow('cancelled');
    });

    it('marks the diff incomplete when the agent commits to a repository it created', async () => {
      const source = path.join(root, 'repo');
      makeRepository(source);
      const workspace = await create(source);
      // Git records the repository as a link to its commit, so the diff shows that it exists
      // and none of its files.
      const nested = path.join(workspace.dir, 'newproj');
      write(path.join(nested, 'policy.txt'), 'hidden from the diff\n');
      git(nested, 'init', '-q');
      git(nested, 'add', '-A');
      git(nested, 'commit', '-q', '-m', 'nested');

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiff).toContain('Subproject commit');
      expect(workspaceDiff).not.toContain('hidden from the diff');
      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toMatch(
        /\[diff incomplete: the files of 1 nested repository are not included: newproj\]$/,
      );
    });

    it.each(['filter', 'hook'] as const)(
      'does not run a nested repository %s when recovering skipped paths',
      async (kind) => {
        if (kind === 'hook' && process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        const workspace = await create(source);
        const nested = path.join(workspace.dir, 'nested');
        makeRepository(nested);
        const marker = path.join(root, `${kind}-ran`);
        const script = path.join(root, `${kind}.cjs`);
        write(
          script,
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n` +
            (kind === 'filter' ? 'process.stdin.pipe(process.stdout);\n' : ''),
        );
        const command = `"${process.execPath.split(path.sep).join('/')}" "${script.split(path.sep).join('/')}"`;
        if (kind === 'filter') {
          git(nested, 'config', 'filter.agent.clean', command);
          write(path.join(nested, '.git', 'info', 'attributes'), '*.txt filter=agent\n');
          write(path.join(nested, 'src', 'app.txt'), 'APP\n');
        } else {
          const hook = path.join(nested, '.git', 'hooks', 'post-index-change');
          write(hook, `#!/bin/sh\n${command}\n`);
          fs.chmodSync(hook, 0o755);
          // Git status refreshes a stale stat entry even when the bytes did not change.
          fs.utimesSync(path.join(nested, 'README.md'), 1, 1);
        }
        const unaddable = path.join(workspace.dir, 'unborn');
        fs.mkdirSync(unaddable);
        git(unaddable, 'init', '-q');
        write(path.join(workspace.dir, 'README.md'), 'original\nvisible change\n');

        const metadata = await workspace.metadata();

        expect(fs.existsSync(marker)).toBe(false);
        expect(metadata.workspaceDiffError).toBeUndefined();
        expect(metadata.workspaceDiffIncomplete).toBe(true);
        expect(metadata.workspaceDiff).toContain('+visible change');
        expect(metadata.workspaceDiff).toContain('unborn/');
        expect(metadata.workspaceDiff).toContain('nested repository are not included: nested');
        expect(fs.readFileSync(path.join(source, 'README.md'), 'utf8')).toBe('original\n');
      },
    );

    it('does not report an unchanged ignored file the repository already tracks', async () => {
      const source = path.join(root, 'repo');
      // The cloned commit tracks a file that its own ignore rules match.
      write(path.join(source, '.gitignore'), 'vendored.txt\n');
      write(path.join(source, 'vendored.txt'), 'vendored\n');
      makeRepository(source);
      git(source, 'add', '--force', 'vendored.txt');
      git(source, 'commit', '-q', '-m', 'track an ignored file');
      const workspace = await create(source);
      // Something unrelated cannot be added, so the skipped paths are listed.
      write(path.join(workspace.dir, 'newproj', 'main.py'), 'print(1)\n');
      git(path.join(workspace.dir, 'newproj'), 'init', '-q');

      const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

      expect(workspaceDiffIncomplete).toBe(true);
      expect(workspaceDiff).toBe(
        '[diff incomplete: 1 changed path(s) could not be included: newproj/]',
      );
    });

    it('lists changes to existing files before new paths when more are skipped than it names', async () => {
      if (!canMakeUnreadable) {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source, { 'policy.txt': 'policy: ok\n' });
      const workspace = await create(source);
      // More new paths than the note names, each of them impossible to add.
      const unreadable: string[] = [];
      for (let index = 0; index < 60; index++) {
        const file = path.join(workspace.dir, `a-new-${String(index).padStart(2, '0')}.bin`);
        write(file, 'x');
        fs.chmodSync(file, 0o000);
        unreadable.push(file);
      }
      const policy = path.join(workspace.dir, 'policy.txt');
      write(policy, 'policy: TAMPERED\n');
      fs.chmodSync(policy, 0o000);
      unreadable.push(policy);

      try {
        const { workspaceDiff, workspaceDiffIncomplete } = await workspace.metadata();

        // The flag is what an assertion should rely on; the names are a best effort.
        expect(workspaceDiffIncomplete).toBe(true);
        expect(workspaceDiff).toMatch(
          /^\[diff incomplete: 61 changed path\(s\) could not be included: policy\.txt, a-new-00\.bin, /,
        );
        expect(workspaceDiff).toMatch(/, and 11 more\]$/);
      } finally {
        for (const file of unreadable) {
          fs.chmodSync(file, 0o600);
        }
      }
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

    it("copies a repository whose .git directory holds one of git's runtime sockets", async () => {
      if (process.platform === 'win32') {
        return;
      }
      const source = path.join(root, 'repo');
      makeRepository(source);
      // An untracked file makes automatic mode copy instead of clone.
      write(path.join(source, 'untracked.txt'), 'local\n');
      // The built-in fsmonitor daemon keeps this socket here while it runs.
      const close = await listenIn(path.join(source, '.git'), 'fsmonitor--daemon.ipc');
      try {
        const workspace = await create(source);

        expect(workspace.strategy).toBe('copy');
        expect(fs.existsSync(path.join(workspace.dir, 'untracked.txt'))).toBe(true);
        expect(fs.existsSync(path.join(workspace.dir, '.git', 'HEAD'))).toBe(true);
        expect(fs.existsSync(path.join(workspace.dir, '.git', 'fsmonitor--daemon.ipc'))).toBe(
          false,
        );
      } finally {
        await close();
      }
    });

    it.each([
      ['.git', 'other.sock'],
      ['.git/info', 'fsmonitor--daemon.ipc'],
    ])(
      'still rejects any other socket inside the repository metadata: %s/%s',
      async (directory, name) => {
        if (process.platform === 'win32') {
          return;
        }
        const source = path.join(root, 'repo');
        makeRepository(source);
        write(path.join(source, 'untracked.txt'), 'local\n');
        const close = await listenIn(path.join(source, directory), name);
        try {
          await expect(create(source)).rejects.toThrow('it is not a regular file or directory');
        } finally {
          await close();
        }
      },
    );

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
