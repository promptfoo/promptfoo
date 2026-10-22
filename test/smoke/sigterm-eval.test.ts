/**
 * Smoke test: SIGTERM ends `promptfoo eval` even while a provider call never returns, after the
 * provider registry's bounded cleanup, and the process ends on the signal as it would by default.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { SIGTERM_CLEANUP_TIMEOUT_MS } from '../../src/providers/providerRegistry';

const CLI_PATH = path.resolve(__dirname, '../../dist/src/main.js');
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/sigterm-eval');

describe('SIGTERM during an eval', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sigterm-'));
  let child: ChildProcess | undefined;

  afterAll(() => {
    // A regression leaves the eval running; never leak it past the suite.
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('terminates on the signal while a provider call never returns', async () => {
    expect(fs.existsSync(CLI_PATH), `Built CLI not found at ${CLI_PATH}`).toBe(true);
    const startedPath = path.join(workDir, 'started');
    const proc = spawn(
      process.execPath,
      [CLI_PATH, 'eval', '-c', 'promptfooconfig.yaml', '--no-cache', '--no-table'],
      {
        cwd: FIXTURE_DIR,
        env: {
          ...process.env,
          NO_COLOR: '1',
          PROMPTFOO_CONFIG_DIR: workDir,
          PROMPTFOO_DISABLE_TELEMETRY: '1',
          PROMPTFOO_DISABLE_UPDATE: '1',
          SIGTERM_SMOKE_STARTED_PATH: startedPath,
        },
        stdio: 'ignore',
      },
    );
    child = proc;
    const exited = once(proc, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;

    // The provider runs in a separate CLI process; its marker file is the only signal that the
    // call has started, so poll for it in real time.
    while (!fs.existsSync(startedPath)) {
      if (proc.exitCode !== null) {
        throw new Error(`eval exited with ${proc.exitCode} before calling the provider`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const signalledAt = Date.now();
    proc.kill('SIGTERM');
    const [code, signal] = await exited;

    expect({ code, signal }).toEqual({ code: null, signal: 'SIGTERM' });
    expect(Date.now() - signalledAt).toBeLessThan(SIGTERM_CLEANUP_TIMEOUT_MS + 2_000);
  });
});
