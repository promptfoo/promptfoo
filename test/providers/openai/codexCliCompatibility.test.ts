import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCodexCliCompatibility } from '../../../src/providers/openai/codexCliCompatibility';
import { mockProcessEnv } from '../../util/utils';

const mockSpawn = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: mockSpawn, execFile: mockExecFile }));

describe('checkCodexCliCompatibility', () => {
  let sdkRoot: string;
  let sdkEntryPoint: string;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const initialization: string[] = [];

  beforeEach(() => {
    initialization.length = 0;
    sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-sdk-'));
    sdkEntryPoint = path.join(sdkRoot, 'dist', 'index.js');
    fs.mkdirSync(path.dirname(sdkEntryPoint));
    fs.writeFileSync(sdkEntryPoint, '');
    fs.writeFileSync(
      path.join(sdkRoot, 'package.json'),
      JSON.stringify({
        name: '@openai/codex-sdk',
        dependencies: { '@openai/codex': '0.130.0' },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', originalPlatform);
    vi.resetAllMocks();
    fs.rmSync(sdkRoot, { recursive: true, force: true });
  });

  describe('POSIX guardian capture deadline', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      vi.useFakeTimers();
    });

    function startPendingGuardian(signal?: AbortSignal) {
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const status = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout,
        stderr,
        stdio: [stdin, stdout, stderr, status],
        pid: undefined,
        kill: vi.fn(),
      });
      mockSpawn.mockReturnValue(child);
      const result = checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
        signal,
      }).then(
        () => ({ success: true as const }),
        (error: unknown) => ({ error }),
      );
      return {
        child,
        stdout,
        stderr,
        result,
        async close(frame: string) {
          stdout.end();
          stderr.end();
          status.end(frame);
          await vi.advanceTimersByTimeAsync(0);
          child.emit('close', null, 'SIGKILL');
        },
      };
    }

    it('requests deadline cleanup without replacing a completed command with a timeout', async () => {
      const probe = startPendingGuardian();
      probe.stdout.write('codex-cli 0.130.0');
      await vi.advanceTimersByTimeAsync(9_999);
      expect(probe.child.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(probe.child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
      await probe.close('{"code":0,"signal":null}');
      await expect(probe.result).resolves.toEqual({ success: true });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      { name: 'nonzero exit', frame: '{"code":7,"signal":null}', reason: 'exited with 7' },
      {
        name: 'signaled exit',
        frame: '{"code":null,"signal":"SIGTERM"}',
        reason: 'exited with SIGTERM',
      },
      {
        name: 'guardian timeout',
        frame: '{"error":"Codex CLI version check timed out after 10000ms"}',
        reason: 'timed out after 10000ms',
      },
      { name: 'missing status', frame: '', reason: 'timed out after 10000ms' },
    ])('preserves $name at the capture deadline', async ({ frame, reason }) => {
      const probe = startPendingGuardian();
      probe.stdout.write('codex-cli 0.130.0');
      await vi.advanceTimersByTimeAsync(10_000);
      await probe.close(frame);
      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({ message: expect.stringContaining(reason) }),
      });
    });

    it('does not let a deadline result replace a caller abort', async () => {
      const controller = new AbortController();
      const probe = startPendingGuardian(controller.signal);
      probe.stdout.write('codex-cli 0.130.0');
      await vi.advanceTimersByTimeAsync(10_000);
      controller.abort();
      await probe.close('{"code":0,"signal":null}');
      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({ name: 'AbortError' }),
      });
    });

    it.each(['stdout', 'stderr'] as const)(
      'does not let a deadline result replace %s overflow',
      async (stream) => {
        const probe = startPendingGuardian();
        await vi.advanceTimersByTimeAsync(10_000);
        probe[stream].write('x'.repeat(1024 * 1024 + 1));
        await probe.close('{"code":0,"signal":null}');
        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({
            message: expect.stringContaining(`${stream} exceeded`),
          }),
        });
      },
    );
  });

  describe('Windows command exit with inherited capture pipes', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.useFakeTimers();
    });

    // Model Node's separate exit and close events. These streams deliberately
    // remain open after the direct process exits. This does not model native
    // Windows job ownership or claim physical Windows execution.
    function startHeldPipeProbe(signal?: AbortSignal) {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdin: null,
        stdout,
        stderr,
        pid: undefined,
        exitCode: null as number | null,
        signalCode: null as NodeJS.Signals | null,
      });
      let exited = false;
      let closed = false;
      let closedPipes = 0;
      const closeWhenReady = () => {
        if (exited && closedPipes === 2 && !closed) {
          closed = true;
          child.emit('close', child.exitCode, child.signalCode);
        }
      };
      for (const stream of [stdout, stderr]) {
        stream.once('close', () => {
          closedPipes++;
          closeWhenReady();
        });
      }
      mockSpawn.mockReturnValue(child);
      const result = checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/native-wrapper',
        env: {},
        signal,
      }).then(
        () => ({ success: true as const }),
        (error: unknown) => ({ error }),
      );
      return {
        child,
        stdout,
        stderr,
        result,
        exit(code: number | null, exitSignal: NodeJS.Signals | null = null) {
          child.exitCode = code;
          child.signalCode = exitSignal;
          exited = true;
          child.emit('exit', code, exitSignal);
          closeWhenReady();
        },
      };
    }

    it.each(['stdout', 'stderr'] as const)(
      'retains zero exit and late %s until the original capture deadline',
      async (stream) => {
        const probe = startHeldPipeProbe();
        const settled = vi.fn();
        void probe.result.then(settled);
        probe.exit(0);
        setTimeout(() => probe[stream].write('codex-cli 0.130.0'), 5_000);

        await vi.advanceTimersByTimeAsync(9_999);
        expect(settled).not.toHaveBeenCalled();
        expect(probe[stream].destroyed).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        await expect(probe.result).resolves.toEqual({ success: true });
      },
    );

    it('finishes when delayed captured output closes before the deadline', async () => {
      const probe = startHeldPipeProbe();
      probe.exit(0);
      await vi.advanceTimersByTimeAsync(50);
      probe.stdout.end('codex-cli 0.130.0');
      probe.stderr.end();

      await expect(probe.result).resolves.toEqual({ success: true });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      { code: 7, signal: null, reason: '7' },
      { code: null, signal: 'SIGTERM' as const, reason: 'SIGTERM' },
    ])(
      'preserves unsuccessful exit $reason with inherited pipes',
      async ({ code, signal, reason }) => {
        const probe = startHeldPipeProbe();
        probe.stdout.write('codex-cli 0.130.0');
        probe.exit(code, signal);
        await vi.advanceTimersByTimeAsync(10_000);

        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({
            message: expect.stringContaining(`exited with ${reason}`),
          }),
        });
      },
    );

    it('still validates the captured version after a zero exit', async () => {
      const probe = startHeldPipeProbe();
      probe.stdout.write('codex-cli 0.131.0');
      probe.exit(0);
      await vi.advanceTimersByTimeAsync(10_000);

      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({ message: expect.stringContaining('reports 0.131.0') }),
      });
    });

    it('keeps an abort after zero exit authoritative', async () => {
      const controller = new AbortController();
      const probe = startHeldPipeProbe(controller.signal);
      probe.stdout.write('codex-cli 0.130.0');
      probe.exit(0);
      controller.abort();

      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({ name: 'AbortError' }),
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['stdout', 'stderr'] as const)(
      'keeps %s overflow after zero exit authoritative',
      async (stream) => {
        const probe = startHeldPipeProbe();
        probe.stdout.write('codex-cli 0.130.0');
        probe.exit(0);
        probe[stream].write('x'.repeat(1024 * 1024 + 1));

        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({
            message: expect.stringContaining(`${stream} exceeded`),
          }),
        });
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it('keeps a process error after zero exit authoritative', async () => {
      const probe = startHeldPipeProbe();
      probe.stdout.write('codex-cli 0.130.0');
      probe.exit(0);
      probe.child.emit('error', new Error('version transport failed'));

      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({
          message: expect.stringContaining('version transport failed'),
        }),
      });
    });

    it('still rejects a command that has not exited at the deadline', async () => {
      const probe = startHeldPipeProbe();
      probe.stdout.write('codex-cli 0.130.0');
      await vi.advanceTimersByTimeAsync(10_000);
      probe.exit(null, 'SIGKILL');

      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({
          message: expect.stringContaining('timed out after 10000ms'),
        }),
      });
    });
  });

  describe('POSIX guardian direct-child reaping', () => {
    let program: string;
    const streams: PassThrough[] = [];

    beforeEach(async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockVersion('codex-cli 0.130.0');
      await checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      });
      program = mockSpawn.mock.calls[0][1][2];
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.clearAllTimers();
      for (const stream of streams.splice(0)) {
        stream.destroy();
      }
    });

    function createGuardian(
      options: { noPid?: boolean; brokenStatus?: boolean; deferInit?: boolean } = {},
    ) {
      const pipe = () => {
        const stream = new PassThrough();
        streams.push(stream);
        return stream;
      };
      const child = Object.assign(new EventEmitter(), {
        pid: options.noPid ? undefined : 1234,
        stdout: pipe(),
        stderr: pipe(),
        kill: vi.fn(() => true),
      });
      const guardian = Object.assign(new EventEmitter(), {
        pid: 5678,
        stdin: pipe(),
        stdout: pipe(),
        stderr: pipe(),
        kill: vi.fn(),
      });
      guardian.stdout.resume();
      guardian.stderr.resume();
      const input = new EventEmitter();
      const frames: unknown[] = [];
      const writeStatus = vi.fn((fd: number, value: string) => {
        expect(fd).toBe(3);
        if (options.brokenStatus) {
          throw new Error('SYNTHETIC_CLOSED_STATUS');
        }
        frames.push(JSON.parse(value));
      });
      const spawn = vi.fn(() => child);
      runInNewContext(program, {
        process: guardian,
        Date,
        setTimeout,
        clearTimeout,
        require(name: string) {
          if (name === 'node:fs') {
            return { writeSync: writeStatus };
          }
          if (name === 'node:child_process') {
            return { spawn };
          }
          if (name === 'node:readline') {
            return { createInterface: () => input };
          }
          throw new Error('Unexpected guardian dependency');
        },
      });
      const initialize = () =>
        input.emit(
          'line',
          JSON.stringify({
            command: '/synthetic/codex',
            env: {},
            ownerPid: 42,
            deadlineAt: Date.now() + 10_000,
          }),
        );
      if (!options.deferInit) {
        initialize();
      }
      return {
        child,
        guardian,
        spawn,
        initialize,
        frames,
        writeStatus,
        groupKills: () => guardian.kill.mock.calls.filter(([, signal]) => signal === 'SIGKILL'),
      };
    }

    it.each([
      { event: 'deadline', reason: 'timed out after 10000ms' },
      { event: 'parent deadline signal', reason: 'timed out after 10000ms' },
      { event: 'owner EOF', reason: 'owner disconnected' },
      { event: 'owner pipe error', reason: 'owner channel failed' },
      { event: 'stdout error', reason: 'Could not capture Codex CLI version output' },
      { event: 'stderr error', reason: 'Could not capture Codex CLI version output' },
    ])('keeps the direct child reaper alive after $event', async ({ event, reason }) => {
      const probe = createGuardian();
      if (event === 'deadline') {
        await vi.advanceTimersByTimeAsync(10_000);
      } else if (event === 'parent deadline signal') {
        probe.guardian.emit('SIGTERM');
      } else if (event === 'owner EOF') {
        probe.guardian.stdin.emit('end');
      } else if (event === 'owner pipe error') {
        probe.guardian.stdin.emit('error', new Error('SYNTHETIC_PIPE_ERROR'));
      } else {
        probe.guardian[event === 'stdout error' ? 'stdout' : 'stderr'].emit(
          'error',
          new Error('SYNTHETIC_OUTPUT_ERROR'),
        );
      }

      expect(probe.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
      expect(probe.frames).toEqual([]);
      expect(probe.groupKills()).toEqual([]);
      // Direct exit means waitpid has completed. Captured pipes deliberately
      // stay open; their close event is not a condition for forced cleanup.
      probe.child.emit('exit', null, 'SIGKILL');
      expect(probe.frames).toEqual([{ error: expect.stringContaining(reason) }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it.each(['returned false', 'ESRCH event', 'ESRCH throw'] as const)(
      'waits for actual exit when termination %s reports an already-exiting process',
      async (mode) => {
        const probe = createGuardian();
        probe.child.kill.mockImplementation(() => {
          if (mode === 'ESRCH throw') {
            throw Object.assign(new Error('already exiting'), { code: 'ESRCH' });
          }
          if (mode === 'ESRCH event') {
            probe.child.emit(
              'error',
              Object.assign(new Error('already exiting'), { code: 'ESRCH' }),
            );
          }
          return false;
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(probe.frames).toEqual([]);
        expect(probe.groupKills()).toEqual([]);
        probe.child.emit('exit', null, 'SIGKILL');
        expect(probe.frames).toEqual([
          { error: 'Codex CLI version check timed out after 10000ms' },
        ]);
        expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
      },
    );

    it.each(['throws', 'emits error'] as const)(
      'reports bounded cleanup failure if the termination signal %s',
      async (mode) => {
        const probe = createGuardian();
        probe.child.kill.mockImplementation(() => {
          const error = Object.assign(new Error('SYNTHETIC_PRIVATE_KILL_ERROR'), { code: 'EPERM' });
          if (mode === 'throws') {
            throw error;
          }
          probe.child.emit('error', error);
          return false;
        });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(probe.frames).toEqual([
          {
            error:
              'Codex CLI version check timed out after 10000ms; could not terminate the direct CLI process',
          },
        ]);
        expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
        expect(JSON.stringify(probe.frames)).not.toContain('SYNTHETIC_PRIVATE_KILL_ERROR');
      },
    );

    it('observes a direct exit delivered synchronously by kill', () => {
      const probe = createGuardian();
      probe.child.kill.mockImplementation(() => {
        probe.child.emit('exit', null, 'SIGKILL');
        return true;
      });
      probe.guardian.stdin.emit('end');
      expect(probe.frames).toEqual([{ error: 'Codex CLI version check owner disconnected' }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('does not start queued initialization after owner EOF', () => {
      const probe = createGuardian({ deferInit: true });
      probe.guardian.stdin.emit('end');
      probe.initialize();
      expect(probe.spawn).not.toHaveBeenCalled();
      expect(probe.frames).toEqual([{ error: 'Codex CLI version check owner disconnected' }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('preserves the first terminal reason while direct reaping is pending', async () => {
      const probe = createGuardian();
      await vi.advanceTimersByTimeAsync(10_000);
      probe.guardian.stdin.emit('end');
      probe.guardian.emit('SIGTERM');
      probe.guardian.stdout.emit('error', new Error('later failure'));
      expect(probe.child.kill).toHaveBeenCalledTimes(1);
      probe.child.emit('exit', null, 'SIGKILL');
      probe.child.emit('close', null, 'SIGKILL');
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.frames).toEqual([{ error: 'Codex CLI version check timed out after 10000ms' }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('still reaps before group cleanup when the parent status pipe is closed', () => {
      const probe = createGuardian({ brokenStatus: true });
      probe.guardian.stdin.emit('end');
      expect(probe.writeStatus).not.toHaveBeenCalled();
      expect(probe.groupKills()).toEqual([]);
      probe.child.emit('exit', null, 'SIGKILL');
      expect(probe.writeStatus).toHaveBeenCalledTimes(1);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('does not wait for a nonexistent process after spawn failure', () => {
      const probe = createGuardian({ noPid: true });
      probe.child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
      expect(probe.child.kill).not.toHaveBeenCalled();
      expect(probe.frames).toEqual([{ error: 'Could not start Codex CLI version command' }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('retains a reaped successful exit while inherited pipes wait for the deadline', async () => {
      const probe = createGuardian();
      probe.child.emit('exit', 0, null);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(probe.frames).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(probe.child.kill).not.toHaveBeenCalled();
      expect(probe.frames).toEqual([{ code: 0, signal: null }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });

    it('publishes a reaped exit promptly after ordinary pipe drain', async () => {
      const probe = createGuardian();
      probe.child.emit('exit', 0, null);
      probe.child.stdout.end('codex-cli 0.130.0\n');
      probe.child.stderr.end();
      probe.child.emit('close', 0, null);
      await vi.advanceTimersByTimeAsync(0);
      expect(probe.child.kill).not.toHaveBeenCalled();
      expect(probe.frames).toEqual([{ code: 0, signal: null }]);
      expect(probe.groupKills()).toEqual([[-5678, 'SIGKILL']]);
    });
  });

  describe('Windows system cleanup utility', () => {
    let restoreEnv: () => void;
    const cleanupCallbacks: Array<(error: Error | null) => void> = [];
    const probes: Array<{ dispose: () => void; result: Promise<unknown> }> = [];

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.useFakeTimers();
      cleanupCallbacks.length = 0;
      probes.length = 0;
      restoreEnv = mockProcessEnv({
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\checkout',
        PATH: 'C:\\checkout',
        OPENAI_API_KEY: 'SYNTHETIC_HOST_TOKEN',
        NODE_OPTIONS: '--require synthetic-preload',
      });
      mockExecFile.mockImplementation((_command, _args, _options, callback) => {
        cleanupCallbacks.push(callback);
      });
    });

    afterEach(async () => {
      for (const callback of cleanupCallbacks) {
        callback(null);
      }
      for (const probe of probes) {
        probe.dispose();
      }
      await Promise.all(probes.map(({ result }) => result));
      restoreEnv();
    });

    // Inspect the launch contract without running a counterfeit Windows binary
    // or making claims about native Windows descendant ownership.
    function startProbe(signal?: AbortSignal, pid = 1234) {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      let exited = false;
      let closedPipes = 0;
      const child = Object.assign(new EventEmitter(), {
        stdin: null,
        stdout,
        stderr,
        pid,
        exitCode: null as number | null,
        signalCode: null as NodeJS.Signals | null,
        kill: vi.fn((signal: NodeJS.Signals) => {
          exit(null, signal);
          return true;
        }),
      });
      const closeWhenReady = () => {
        if (exited && closedPipes === 2) {
          child.emit('close', child.exitCode, child.signalCode);
        }
      };
      function exit(code: number | null, signal: NodeJS.Signals | null = null) {
        if (exited) {
          return;
        }
        exited = true;
        child.exitCode = code;
        child.signalCode = signal;
        child.emit('exit', code, signal);
        closeWhenReady();
      }
      for (const stream of [stdout, stderr]) {
        stream.once('close', () => {
          closedPipes++;
          closeWhenReady();
        });
      }
      mockSpawn.mockReturnValueOnce(child);
      const result = checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: 'C:\\custom\\codex.exe',
        env: {
          SystemRoot: 'C:\\caller-selected',
          PATH: 'C:\\caller-bin',
          OPENAI_API_KEY: 'SYNTHETIC_CLI_TOKEN',
        },
        signal,
      }).then(
        () => ({ success: true as const }),
        (error: unknown) => ({ error }),
      );
      probes.push({
        result,
        dispose: () => {
          exit(null, 'SIGKILL');
          stdout.destroy();
          stderr.destroy();
        },
      });
      return { child, stdout, stderr, result, exit };
    }

    it.each(['abort', 'timeout', 'stdout', 'stderr'] as const)(
      'uses only the host system utility and restricted environment for %s',
      async (trigger) => {
        const controller = new AbortController();
        const probe = startProbe(controller.signal);
        if (trigger === 'abort') {
          controller.abort();
        } else if (trigger === 'timeout') {
          await vi.advanceTimersByTimeAsync(10_000);
        } else {
          probe[trigger].write('x'.repeat(1024 * 1024 + 1));
        }

        expect(mockExecFile).toHaveBeenCalledExactlyOnceWith(
          'C:\\Windows\\System32\\taskkill.exe',
          ['/pid', '1234', '/t', '/f'],
          {
            windowsHide: true,
            timeout: 1_000,
            killSignal: 'SIGKILL',
            cwd: 'C:\\Windows\\System32',
            env: {
              SystemRoot: 'C:\\Windows',
              WINDIR: 'C:\\Windows',
              PATH: 'C:\\Windows\\System32',
            },
          },
          expect.any(Function),
        );
        probe.exit(null, 'SIGKILL');
        cleanupCallbacks[0](null);
        await expect(probe.result).resolves.toMatchObject({
          error:
            trigger === 'abort'
              ? expect.objectContaining({ name: 'AbortError' })
              : expect.objectContaining({
                  message: expect.stringContaining(
                    trigger === 'timeout' ? 'timed out after 10000ms' : `${trigger} exceeded`,
                  ),
                }),
        });
        expect(probe.child.kill).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      },
    );

    it.each([
      { name: 'missing', value: undefined },
      { name: 'empty', value: '' },
      { name: 'relative', value: 'checkout' },
      { name: 'drive-relative', value: 'C:checkout' },
      { name: 'root-relative', value: '\\Windows' },
      { name: 'UNC', value: '\\\\server\\share' },
      { name: 'device', value: '\\\\?\\C:\\Windows' },
      { name: 'quoted', value: '"C:\\Windows\\SYNTHETIC_ROOT"' },
    ])('rejects a $name system root without a utility search', async ({ value }) => {
      const restoreRoot = mockProcessEnv({ SystemRoot: value });
      try {
        const probe = startProbe();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mockExecFile).not.toHaveBeenCalled();
        expect(probe.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({
            message: expect.stringContaining(
              'Cannot locate the Windows system directory for Codex version cleanup',
            ),
          }),
        });
        const outcome = await probe.result;
        expect(outcome).toHaveProperty(
          'error.message',
          expect.not.stringContaining('SYNTHETIC_ROOT'),
        );
      } finally {
        restoreRoot();
      }
    });

    it('preserves caller abort when the system root is invalid', async () => {
      const restoreRoot = mockProcessEnv({ SystemRoot: 'relative' });
      try {
        const controller = new AbortController();
        const probe = startProbe(controller.signal);
        controller.abort();
        expect(mockExecFile).not.toHaveBeenCalled();
        expect(probe.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({ name: 'AbortError' }),
        });
      } finally {
        restoreRoot();
      }
    });

    it('accepts a fully qualified host system directory with spaces and a trailing separator', async () => {
      const restoreRoot = mockProcessEnv({ SystemRoot: 'D:\\Windows NT\\' });
      try {
        const probe = startProbe();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(mockExecFile).toHaveBeenCalledWith(
          'D:\\Windows NT\\System32\\taskkill.exe',
          ['/pid', '1234', '/t', '/f'],
          expect.objectContaining({
            cwd: 'D:\\Windows NT\\System32',
            env: {
              SystemRoot: 'D:\\Windows NT\\',
              WINDIR: 'D:\\Windows NT\\',
              PATH: 'D:\\Windows NT\\System32',
            },
          }),
          expect.any(Function),
        );
        probe.exit(null, 'SIGKILL');
        cleanupCallbacks[0](null);
        await expect(probe.result).resolves.toHaveProperty('error');
      } finally {
        restoreRoot();
      }
    });

    it.each(['callback', 'synchronous'] as const)(
      'falls back only to the owned child after a %s utility startup error',
      async (mode) => {
        const error = new Error('taskkill ENOENT');
        if (mode === 'synchronous') {
          mockExecFile.mockImplementation(() => {
            throw error;
          });
        }
        const probe = startProbe();
        await vi.advanceTimersByTimeAsync(10_000);
        if (mode === 'callback') {
          cleanupCallbacks[0](error);
        }
        await vi.advanceTimersByTimeAsync(0);

        expect(mockExecFile).toHaveBeenCalledTimes(1);
        expect(mockExecFile.mock.calls[0][0]).toBe('C:\\Windows\\System32\\taskkill.exe');
        expect(probe.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
        await expect(probe.result).resolves.toMatchObject({
          error: expect.objectContaining({ message: expect.stringContaining('taskkill ENOENT') }),
        });
      },
    );

    it('waits for cleanup completion if the process exits before the utility callback', async () => {
      const controller = new AbortController();
      const probe = startProbe(controller.signal);
      const settled = vi.fn();
      void probe.result.then(settled);
      controller.abort();
      probe.exit(null, 'SIGKILL');
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      cleanupCallbacks[0](new Error('process already exited'));

      await expect(probe.result).resolves.toMatchObject({
        error: expect.objectContaining({ name: 'AbortError' }),
      });
      expect(probe.child.kill).not.toHaveBeenCalled();
    });

    it('targets only the cancelled probe while a concurrent probe succeeds', async () => {
      const controller = new AbortController();
      const cancelled = startProbe(controller.signal, 1234);
      const survivor = startProbe(undefined, 5678);
      controller.abort();
      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(mockExecFile.mock.calls[0][1]).toEqual(['/pid', '1234', '/t', '/f']);
      cancelled.exit(null, 'SIGKILL');
      cleanupCallbacks[0](null);
      await expect(cancelled.result).resolves.toMatchObject({
        error: expect.objectContaining({ name: 'AbortError' }),
      });
      survivor.stdout.end('codex-cli 0.130.0');
      survivor.stderr.end();
      survivor.exit(0);

      await expect(survivor.result).resolves.toEqual({ success: true });
      expect(survivor.child.kill).not.toHaveBeenCalled();
      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  function mockVersion(
    stdout: string,
    error: Error | null = null,
    stderr = '',
    exitCode = 0,
    statusOverride?: string,
  ) {
    mockSpawn.mockImplementation(() => {
      const stdin = new PassThrough();
      const output = new PassThrough();
      const errors = new PassThrough();
      const status = new PassThrough();
      stdin.on('data', (chunk) => initialization.push(chunk.toString()));
      const child = Object.assign(new EventEmitter(), {
        stdin,
        stdout: output,
        stderr: errors,
        stdio: [stdin, output, errors, status],
        pid: undefined,
      });
      queueMicrotask(() => {
        const supervised = process.platform !== 'win32';
        if (error && !supervised) {
          child.emit('error', error);
        } else {
          child.stdout.end(stdout);
          child.stderr.end(stderr);
        }
        if (supervised) {
          status.end(
            statusOverride ??
              JSON.stringify(error ? { error: error.message } : { code: exitCode, signal: null }),
          );
        }
        // Actual ChildProcess close follows the captured/status pipes ending.
        setImmediate(() =>
          child.emit('close', supervised ? null : exitCode, supervised ? 'SIGKILL' : null),
        );
      });
      return child;
    });
  }

  it('accepts the CLI version declared by the SDK', async () => {
    mockVersion('codex-cli 0.130.0');
    const env = { PATH: '/bin' };

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env,
      }),
    ).resolves.toBeUndefined();

    if (process.platform === 'win32') {
      expect(mockSpawn).toHaveBeenCalledWith(
        '/custom/codex',
        ['exec', '--experimental-json', '--version'],
        expect.objectContaining({ env, windowsHide: true }),
      );
    } else {
      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        ['--input-type=commonjs', '--eval', expect.any(String)],
        expect.objectContaining({
          env: {},
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        }),
      );
      expect(JSON.parse(initialization.join(''))).toEqual({
        command: '/custom/codex',
        env,
        ownerPid: process.pid,
        deadlineAt: expect.any(Number),
      });
    }
  });

  it.each([
    '',
    '{"code":0',
    '{}',
    '{"code":"0","signal":null}',
    '{"code":0,"signal":1}',
    '{"code":0,"signal":null,"error":""}',
  ])('fails closed on a missing or invalid private status frame (%s)', async (status) => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockVersion('codex-cli 0.130.0', null, '', 0, status);
    await expect(
      checkCodexCliCompatibility({ sdkEntryPoint, codexPathOverride: '/custom/codex', env: {} }),
    ).rejects.toThrow('supervisor exited without a valid command status');
  });

  it('bounds the private status frame independently of command output', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockVersion('codex-cli 0.130.0', null, '', 0, 'x'.repeat(8193));
    await expect(
      checkCodexCliCompatibility({ sdkEntryPoint, codexPathOverride: '/custom/codex', env: {} }),
    ).rejects.toThrow('status exceeded the maximum buffer length');
  });

  it('does not include a malformed private frame in an error', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockVersion('codex-cli 0.130.0', null, '', 0, '{"error":"SYNTHETIC_PRIVATE_VALUE');
    const error = await checkCodexCliCompatibility({
      sdkEntryPoint,
      codexPathOverride: '/custom/codex',
      env: {},
    }).catch((value) => value as Error);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', expect.not.stringContaining('SYNTHETIC_PRIVATE_VALUE'));
  });

  it('accepts a matching version reported on stderr', async () => {
    mockVersion('', null, 'codex-cli 0.130.0');
    await expect(
      checkCodexCliCompatibility({ sdkEntryPoint, codexPathOverride: '/custom/codex', env: {} }),
    ).resolves.toBeUndefined();
  });

  it('rejects a matching version when the process exits unsuccessfully', async () => {
    mockVersion('codex-cli 0.130.0', null, 'version command failed', 2);
    await expect(
      checkCodexCliCompatibility({ sdkEntryPoint, codexPathOverride: '/custom/codex', env: {} }),
    ).rejects.toThrow('Codex CLI version check exited with 2: version command failed');
  });

  it('does not spawn a pre-aborted probe', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('bounds stderr capture as well as stdout', async () => {
    mockVersion('', null, 'x'.repeat(1024 * 1024 + 1));
    await expect(
      checkCodexCliCompatibility({ sdkEntryPoint, codexPathOverride: '/custom/codex', env: {} }),
    ).rejects.toThrow('stderr exceeded the maximum buffer length');
  });

  it('rechecks successful probes on each call', async () => {
    mockVersion('codex-cli 0.130.0');
    const options = {
      sdkEntryPoint,
      codexPathOverride: '/custom/codex',
      env: { PATH: '/bin' },
    };

    await checkCodexCliCompatibility(options);
    await checkCodexCliCompatibility({
      ...options,
      env: { ...options.env },
    });

    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('rechecks when the probe environment changes', async () => {
    mockVersion('codex-cli 0.130.0');

    await checkCodexCliCompatibility({
      sdkEntryPoint,
      codexPathOverride: '/custom/codex',
      env: { PATH: '/bin', WRAPPER_MODE: 'first' },
    });
    await checkCodexCliCompatibility({
      sdkEntryPoint,
      codexPathOverride: '/custom/codex',
      env: { PATH: '/bin', WRAPPER_MODE: 'second' },
    });

    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('rechecks when the custom binary changes in place', async () => {
    mockVersion('codex-cli 0.130.0');
    const codexPathOverride = path.join(sdkRoot, 'codex');
    fs.writeFileSync(codexPathOverride, 'first');
    const options = { sdkEntryPoint, codexPathOverride, env: { PATH: '/bin' } };

    await checkCodexCliCompatibility(options);
    fs.appendFileSync(codexPathOverride, '-replacement');
    await checkCodexCliCompatibility(options);

    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('rechecks a PATH-resolved command after replacement', async () => {
    const options = {
      sdkEntryPoint,
      codexPathOverride: 'codex-custom',
      env: { PATH: '/custom/bin' },
    };
    mockVersion('codex-cli 0.130.0');
    await checkCodexCliCompatibility(options);

    mockVersion('codex-cli 0.131.0');
    await expect(checkCodexCliCompatibility(options)).rejects.toThrow(
      'codex-custom reports 0.131.0',
    );
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('rejects the r7 SDK and CLI mismatch', async () => {
    mockVersion('codex-cli 0.142.3');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      '@openai/codex-sdk supports Codex CLI/event schema 0.130.0, but /custom/codex reports 0.142.3',
    );
  });

  it('rejects a matching precedence version with different build metadata', async () => {
    mockVersion('codex-cli 0.130.0+fork');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow(
      '@openai/codex-sdk supports Codex CLI/event schema 0.130.0, but /custom/codex reports 0.130.0+fork',
    );
  });

  it('fails closed when JSON event mode is unavailable', async () => {
    mockVersion('', new Error('unknown option --experimental-json'));

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('Could not verify Codex CLI compatibility');

    mockVersion('codex-cli 0.130.0');
    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).resolves.toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('fails closed on unrecognized version output', async () => {
    mockVersion('codex-cli unknown');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('reports an unknown version');
  });

  it('fails with compatibility context on an invalid captured version', async () => {
    mockVersion('codex-cli 0.130.0-rc. built today');

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('reports 0.130.0-rc.');
  });

  it('fails closed when the SDK manifest does not pin an exact CLI version', async () => {
    fs.writeFileSync(
      path.join(sdkRoot, 'package.json'),
      JSON.stringify({
        name: '@openai/codex-sdk',
        dependencies: { '@openai/codex': '^0.130.0' },
      }),
    );

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('does not declare an exact @openai/codex version');
  });

  it('fails with compatibility context when the SDK manifest is missing', async () => {
    fs.rmSync(path.join(sdkRoot, 'package.json'));

    await expect(
      checkCodexCliCompatibility({
        sdkEntryPoint,
        codexPathOverride: '/custom/codex',
        env: {},
      }),
    ).rejects.toThrow('Could not find @openai/codex-sdk/package.json');
  });
});
