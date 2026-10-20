import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPython } from '../../src/python/pythonUtils';
import * as secureTempFiles from '../../src/util/secureTempFiles';
import type { PythonShell } from 'python-shell';

const observed = vi.hoisted(() => ({
  startedAt: 0,
  children: [] as {
    shell: PythonShell;
    closed: Promise<void>;
    lifecycle: {
      constructedAtMs: number;
      spawnedAtMs?: number;
      exitedAtMs?: number;
      closedAtMs?: number;
      stdoutBytes: number;
      stderrBytes: number;
    };
  }[],
}));

// Keep the installed constructor, script wrapper, child, streams and result files real.
// This transparent subclass records actual close events for the fixture's cleanup oracle.
vi.mock('python-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('python-shell')>();
  return {
    ...actual,
    PythonShell: class extends actual.PythonShell {
      constructor(...args: ConstructorParameters<typeof actual.PythonShell>) {
        super(...args);
        const elapsed = () => Date.now() - observed.startedAt;
        const lifecycle = {
          constructedAtMs: elapsed(),
          stdoutBytes: 0,
          stderrBytes: 0,
        } as (typeof observed.children)[number]['lifecycle'];
        this.childProcess.once('spawn', () => {
          lifecycle.spawnedAtMs = elapsed();
        });
        this.childProcess.once('exit', () => {
          lifecycle.exitedAtMs = elapsed();
        });
        this.childProcess.stdout?.on('data', (chunk: Buffer) => {
          lifecycle.stdoutBytes += chunk.byteLength;
        });
        this.childProcess.stderr?.on('data', (chunk: Buffer) => {
          lifecycle.stderrBytes += chunk.byteLength;
        });
        const closed = new Promise<void>((resolve) =>
          this.childProcess.once('close', () => {
            lifecycle.closedAtMs = elapsed();
            resolve();
          }),
        );
        observed.children.push({ shell: this, closed, lifecycle });
      }
    },
  };
});

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('runPython real invocation cancellation', () => {
  beforeEach(() => {
    observed.startedAt = Date.now();
    observed.children.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes only the canceled loader child and its streams before removing its files', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-python-child-'));
    const marker = path.join(directory, 'started');
    const independentMarker = path.join(directory, 'independent-started');
    const release = path.join(directory, 'release');
    const script = path.join(directory, 'loader.py');
    fs.writeFileSync(
      script,
      [
        'import pathlib, time',
        'def hold(marker):',
        '    pathlib.Path(marker).write_text("entered")',
        '    time.sleep(60)',
        '    return {"output": "late result"}',
        'def fail():',
        '    raise ValueError("independent loader failure")',
        'def complete(marker, release):',
        '    pathlib.Path(marker).write_text("entered")',
        '    while not pathlib.Path(release).exists():',
        '        time.sleep(0.02)',
        '    return {"output": "independent caller completed"}',
        '',
      ].join('\n'),
    );
    const caller = new AbortController();
    const independentCaller = new AbortController();
    const reason = new Error('cancel only this loader');
    let rejectEntry!: (error: Error) => void;
    let resolveEntry!: () => void;
    const entered = new Promise<void>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const bothEntered = () => fs.existsSync(marker) && fs.existsSync(independentMarker);
    // Observe the markers themselves: filesystem notifications can be dropped or omit the filename.
    const entryPoll = setInterval(() => {
      if (bothEntered()) {
        resolveEntry();
      }
    }, 20);
    const watchdog = setTimeout(() => {
      if (bothEntered()) {
        resolveEntry();
      } else {
        // Snapshot before cleanup changes the child's state. No shell means preparation
        // has not reached PythonShell; it does not distinguish validation from file I/O.
        const startup = {
          elapsedMs: Date.now() - observed.startedAt,
          phase: observed.children.length ? 'child-created' : 'before-child-creation',
          children: observed.children.map(({ shell, lifecycle }) => ({
            ...lifecycle,
            pid: shell.childProcess.pid,
            exitCode: shell.childProcess.exitCode,
            signalCode: shell.childProcess.signalCode,
          })),
        };
        rejectEntry(new Error(`Python loader did not enter: ${JSON.stringify(startup)}`));
      }
    }, 4000);
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const calls: Promise<unknown>[] = [];
    try {
      const pending = runPython(script, 'hold', [marker], { abortSignal: caller.signal }).catch(
        (error: unknown) => error,
      );
      calls.push(pending);
      const independent = runPython(script, 'complete', [independentMarker, release], {
        abortSignal: independentCaller.signal,
      }).catch((error: unknown) => error);
      calls.push(independent);
      await Promise.race([
        entered,
        pending.then((result) => {
          throw new Error('Loader exited before its entry marker', { cause: result });
        }),
        independent.then((result) => {
          throw new Error('Independent loader exited before release', { cause: result });
        }),
      ]);
      clearTimeout(watchdog);
      clearInterval(entryPoll);
      expect(observed.children).toHaveLength(2);
      const owned = observed.children.find(({ shell }) => shell.command.includes('hold'))!;
      const other = observed.children.find(({ shell }) => shell.command.includes('complete'))!;
      const ownFiles = path.dirname(owned.shell.command[owned.shell.command.length - 1]);
      expect(fs.existsSync(ownFiles)).toBe(true);
      for (const child of [owned, other]) {
        expect(child.lifecycle.closedAtMs).toBeUndefined();
        expect(child.shell.childProcess.exitCode).toBeNull();
        expect(child.shell.childProcess.signalCode).toBeNull();
      }
      const cleanupOrder: string[] = [];
      owned.shell.childProcess.once('close', () => cleanupOrder.push('close'));
      const removeDirectory = secureTempFiles.removeSecureTempDirectory;
      vi.spyOn(secureTempFiles, 'removeSecureTempDirectory').mockImplementation(
        async (directory) => {
          if (directory === ownFiles) {
            cleanupOrder.push('remove');
          }
          await removeDirectory(directory);
        },
      );
      const didNotClose = Symbol('loader still pending after abort');
      caller.abort(reason);
      const result = await Promise.race([
        pending,
        new Promise<typeof didNotClose>((resolve) => {
          abortTimer = setTimeout(() => resolve(didNotClose), 1500);
        }),
      ]);
      expect(result, 'Aborted Python invocation must settle after actual child closure').toBe(
        reason,
      );
      await owned.closed;
      expect(owned.shell.childProcess.stdout?.destroyed).toBe(true);
      expect(owned.shell.childProcess.stderr?.destroyed).toBe(true);
      expect(cleanupOrder).toEqual(['close', 'remove']);
      expect(fs.existsSync(ownFiles)).toBe(false);
      expect(other.lifecycle.closedAtMs).toBeUndefined();
      expect(other.shell.childProcess.exitCode).toBeNull();
      expect(other.shell.childProcess.signalCode).toBeNull();
      fs.writeFileSync(release, 'complete');
      expect(await independent).toEqual({ output: 'independent caller completed' });
      await other.closed;
      const failed = runPython(script, 'fail', []);
      calls.push(failed);
      await expect(failed).rejects.toThrow('independent loader failure');
      expect(observed.children).toHaveLength(3);
      await observed.children[2].closed;
    } finally {
      caller.abort(reason);
      independentCaller.abort();
      clearInterval(entryPoll);
      clearTimeout(watchdog);
      clearTimeout(abortTimer);
      for (const { shell } of observed.children) {
        if (shell.childProcess.exitCode === null && shell.childProcess.signalCode === null) {
          shell.childProcess.kill('SIGKILL');
        }
      }
      await Promise.allSettled(calls);
      await Promise.all(observed.children.map((child) => child.closed));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
