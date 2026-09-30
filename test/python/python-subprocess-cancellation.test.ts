import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPython, state } from '../../src/python/pythonUtils';
import type { PythonShell } from 'python-shell';

const observed = vi.hoisted(() => ({
  children: [] as { shell: PythonShell; closed: Promise<void> }[],
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
        const closed = new Promise<void>((resolve) =>
          this.childProcess.once('close', () => resolve()),
        );
        observed.children.push({ shell: this, closed });
      }
    },
  };
});

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('runPython real invocation cancellation', () => {
  beforeEach(() => {
    observed.children.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes only the canceled loader child and its streams before removing its files', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-python-child-'));
    const marker = path.join(directory, 'started');
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
        'def complete():',
        '    return {"output": "independent caller completed"}',
        '',
      ].join('\n'),
    );
    const caller = new AbortController();
    const reason = new Error('cancel only this loader');
    const previousState = {
      cachedPythonPath: state.cachedPythonPath,
      validationPromise: state.validationPromise,
    };
    let rejectEntry!: (error: Error) => void;
    let resolveEntry!: () => void;
    const entered = new Promise<void>((resolve, reject) => {
      resolveEntry = resolve;
      rejectEntry = reject;
    });
    const watcher = fs.watch(directory, (_event, filename) => {
      if (String(filename) === 'started' && fs.existsSync(marker)) {
        resolveEntry();
      }
    });
    const watchdog = setTimeout(() => rejectEntry(new Error('Python loader did not enter')), 4000);
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const calls: Promise<unknown>[] = [];
    try {
      const pending = runPython(script, 'hold', [marker], { abortSignal: caller.signal }).catch(
        (error: unknown) => error,
      );
      calls.push(pending);
      await Promise.race([
        entered,
        pending.then(() => {
          throw new Error('Loader exited before its entry marker');
        }),
      ]);
      clearTimeout(watchdog);
      watcher.close();
      expect(observed.children).toHaveLength(1);
      const owned = observed.children[0];
      const ownFiles = path.dirname(owned.shell.command[owned.shell.command.length - 1]);
      expect(fs.existsSync(ownFiles)).toBe(true);
      const independent = runPython(script, 'complete', []);
      calls.push(independent);
      expect(await independent).toEqual({ output: 'independent caller completed' });
      expect(observed.children).toHaveLength(2);
      await observed.children[1].closed;
      const failed = runPython(script, 'fail', []);
      calls.push(failed);
      await expect(failed).rejects.toThrow('independent loader failure');
      expect(observed.children).toHaveLength(3);
      await observed.children[2].closed;
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
      expect(fs.existsSync(ownFiles)).toBe(false);
    } finally {
      caller.abort(reason);
      watcher.close();
      clearTimeout(watchdog);
      clearTimeout(abortTimer);
      for (const { shell } of observed.children) {
        if (shell.childProcess.exitCode === null && shell.childProcess.signalCode === null) {
          shell.childProcess.kill('SIGKILL');
        }
      }
      await Promise.allSettled(calls);
      await Promise.all(observed.children.map((child) => child.closed));
      Object.assign(state, previousState);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
