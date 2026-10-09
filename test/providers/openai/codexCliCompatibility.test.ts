import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCodexCliCompatibility } from '../../../src/providers/openai/codexCliCompatibility';

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ spawn: mockSpawn, execFile: vi.fn() }));

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
