/**
 * Smoke test: SIGTERM policy for evals.
 *
 * The CLI ends on SIGTERM after bounded cleanup, even while a provider call never returns, and
 * flushes buffered spans first.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SIGTERM_CLEANUP_TIMEOUT_MS } from '../../src/node/doEval';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/sigterm-eval');

type Exit = { code: number | null; signal: NodeJS.Signals | null };

// Windows has no POSIX signals: `kill('SIGTERM')` terminates the child without running handlers.
describe.skipIf(process.platform === 'win32')('SIGTERM during an eval', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sigterm-'));
  let child: ChildProcess | undefined;
  let receiver: http.Server | undefined;
  let run = 0;

  afterEach(async () => {
    // A regression leaves the eval running; never leak it past the test.
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    child = undefined;
    if (receiver) {
      receiver.closeAllConnections();
      await new Promise((resolve) => receiver?.close(resolve));
      receiver = undefined;
    }
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  /**
   * Starts `args` under Node and resolves once the provider has written its "started" marker. The
   * provider runs in the child process, so the marker file is the only sign that its call began.
   */
  async function startUntilProviderCalled(args: string[], env: NodeJS.ProcessEnv = {}) {
    run += 1;
    const runDir = path.join(workDir, String(run));
    fs.mkdirSync(runDir);
    const startedPath = path.join(runDir, 'started');
    const proc = spawn(process.execPath, args, {
      cwd: FIXTURE_DIR,
      env: {
        ...process.env,
        NO_COLOR: '1',
        PROMPTFOO_CONFIG_DIR: runDir,
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: '1',
        SIGTERM_SMOKE_STARTED_PATH: startedPath,
        ...env,
      },
      stdio: 'ignore',
    });
    child = proc;
    const exited = once(proc, 'exit').then(([code, signal]) => ({ code, signal }) as Exit);
    const watcher = fs.watch(runDir);
    try {
      const started = new Promise<void>((resolve) => {
        const check = () => fs.existsSync(startedPath) && resolve();
        watcher.on('change', check);
        check();
      });
      await Promise.race([
        started,
        exited.then(({ code, signal }) => {
          throw new Error(`process ended (${code ?? signal}) before the provider was called`);
        }),
      ]);
    } finally {
      watcher.close();
    }
    return { proc, exited };
  }

  async function signalAndWait(proc: ChildProcess, exited: Promise<Exit>) {
    const signalledAt = Date.now();
    proc.kill('SIGTERM');
    const exit = await exited;
    return { exit, elapsedMs: Date.now() - signalledAt };
  }

  it('ends the CLI on the signal while a provider call never returns', async () => {
    expect(fs.existsSync(CLI_PATH), `Built CLI not found at ${CLI_PATH}`).toBe(true);
    const { proc, exited } = await startUntilProviderCalled([
      CLI_PATH,
      'eval',
      '-c',
      'promptfooconfig.yaml',
      '--no-cache',
      '--no-table',
    ]);

    const { exit, elapsedMs } = await signalAndWait(proc, exited);

    expect(exit).toEqual({ code: null, signal: 'SIGTERM' });
    expect(elapsedMs).toBeLessThan(SIGTERM_CLEANUP_TIMEOUT_MS + 2_000);
  });

  /** Starts an OTLP/HTTP stand-in that records every request body, for the CLI's exporter. */
  async function startTraceReceiver() {
    const bodies: Buffer[] = [];
    receiver = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        bodies.push(Buffer.concat(chunks));
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    receiver.listen(0, '127.0.0.1');
    await once(receiver, 'listening');
    const { port } = receiver.address() as AddressInfo;
    return {
      env: { PROMPTFOO_OTEL_ENDPOINT: `http://127.0.0.1:${port}/v1/traces` },
      received: (spanName: string) => bodies.some((body) => body.includes(spanName)),
    };
  }

  it('flushes buffered spans before the CLI ends on the signal', async () => {
    const traces = await startTraceReceiver();
    const { proc, exited } = await startUntilProviderCalled(
      [CLI_PATH, 'eval', '-c', 'promptfooconfig.tracing.yaml', '--no-cache', '--no-table'],
      traces.env,
    );

    const { exit, elapsedMs } = await signalAndWait(proc, exited);

    expect(exit).toEqual({ code: null, signal: 'SIGTERM' });
    expect(elapsedMs).toBeLessThan(SIGTERM_CLEANUP_TIMEOUT_MS + 2_000);
    // The provider ended this span just before hanging; only the shutdown flush can deliver it.
    expect(traces.received('sigterm-smoke-before-hang')).toBe(true);
  });

  it('exports a span that ends when an in-flight call settles during the drain', async () => {
    const traces = await startTraceReceiver();
    const { proc, exited } = await startUntilProviderCalled(
      [CLI_PATH, 'eval', '-c', 'promptfooconfig.tracing.yaml', '--no-cache', '--no-table'],
      { ...traces.env, SIGTERM_SMOKE_SETTLE_AFTER_MS: '500' },
    );

    // Once the call settles the eval may finish on its own, so how it exits is not the point.
    const { elapsedMs } = await signalAndWait(proc, exited);

    expect(elapsedMs).toBeLessThan(SIGTERM_CLEANUP_TIMEOUT_MS + 2_000);
    // The call ends this span half a second after SIGTERM, while the drain still waits for it.
    expect(traces.received('sigterm-smoke-settled-after-signal')).toBe(true);
  });
});
