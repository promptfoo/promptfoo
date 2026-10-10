import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCodexCliCompatibility } from '../../../src/providers/openai/codexCliCompatibility';

const childScript = `
  import fs from 'node:fs';
  import path from 'node:path';
  const directory = process.env.CODEX_PREFLIGHT_TEST_DIR;
  const mode = process.env.CODEX_PREFLIGHT_TEST_MODE;
  const timer = setInterval(() => {
    fs.writeFileSync(path.join(directory, 'heartbeat'), String(Date.now()));
    if (fs.existsSync(path.join(directory, 'release'))) {
      if (mode.startsWith('drain-')) {
        clearInterval(timer);
        const output = Buffer.concat([
          Buffer.alloc(256 * 1024, 'x'),
          Buffer.from(String.fromCharCode(10) + 'codex-cli 0.130.0' + String.fromCharCode(10)),
        ]);
        process[mode.slice('drain-'.length)].write(output, () => {
          fs.writeFileSync(path.join(directory, 'write-done'), String(output.length));
          process.exit(0);
        });
        return;
      }
      process.stdout.write('codex-cli 0.130.0' + String.fromCharCode(10));
      process.exit(0);
    }
  }, 20);
`;
const preload = `
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const directory = process.env.CODEX_PREFLIGHT_TEST_DIR;
const mode = process.env.CODEX_PREFLIGHT_TEST_MODE;
const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(childScript)}],
  { env: { ...process.env, NODE_OPTIONS: '' }, stdio: 'inherit' });
fs.writeFileSync(path.join(directory, 'pids.json'), JSON.stringify({ wrapper: process.pid, child: child.pid, supervisor: process.ppid }));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 1));
if (mode === 'overflow') {
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(directory, 'heartbeat'))) {
      clearInterval(timer);
      process.stdout.write('x'.repeat(2 * 1024 * 1024));
    }
  }, 10);
}
if (mode === 'early-exit') {
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(directory, 'heartbeat'))) {
      clearInterval(timer);
      process.stdout.write('codex-cli 0.130.0' + String.fromCharCode(10));
      process.exit(0);
    }
  }, 10);
}
if (mode.startsWith('drain-') && process.platform !== 'win32') {
  setInterval(() => {
    if (fs.existsSync(path.join(directory, 'exit-release'))) process.exit(0);
  }, 10);
}
await new Promise(() => {});
`;

const directPreload = `
import fs from 'node:fs';
import path from 'node:path';
const directory = process.env.CODEX_PREFLIGHT_TEST_DIR;
const mode = process.env.CODEX_PREFLIGHT_TEST_MODE;
fs.writeFileSync(path.join(directory, 'pids.json'), JSON.stringify({ wrapper: process.pid, supervisor: process.ppid }));
const timer = setInterval(() => {
  fs.writeFileSync(path.join(directory, 'heartbeat'), String(Date.now()));
  if (!fs.existsSync(path.join(directory, 'release'))) return;
  clearInterval(timer);
  if (mode.startsWith('direct-overflow-')) {
    process[mode.slice('direct-overflow-'.length)].write('x'.repeat(2 * 1024 * 1024));
    setInterval(() => {}, 1000);
  } else {
    process.stdout.write('codex-cli 0.130.0' + String.fromCharCode(10), () => process.exit(0));
  }
}, 20);
await new Promise(() => {});
`;

type OwnedPids = { wrapper: number; child?: number; supervisor: number };

describe('Codex compatibility probe process ownership', () => {
  let directory: string;
  let sdkEntryPoint: string;
  let preloadPath: string;
  let directPreloadPath: string;
  const calls: Promise<unknown>[] = [];
  const cases: string[] = [];
  const owners: ChildProcess[] = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-preflight-'));
    fs.mkdirSync(path.join(directory, 'sdk', 'dist'), { recursive: true });
    sdkEntryPoint = path.join(directory, 'sdk', 'dist', 'index.js');
    fs.writeFileSync(sdkEntryPoint, '');
    fs.writeFileSync(
      path.join(directory, 'sdk', 'package.json'),
      JSON.stringify({ name: '@openai/codex-sdk', dependencies: { '@openai/codex': '0.130.0' } }),
    );
    preloadPath = path.join(directory, 'preload.mjs');
    fs.writeFileSync(preloadPath, preload);
    directPreloadPath = path.join(directory, 'direct-preload.mjs');
    fs.writeFileSync(directPreloadPath, directPreload);
  });

  function isPresent(pid: number | undefined) {
    if (pid === undefined) {
      return false;
    }
    try {
      process.kill(pid, 0);
      // A zombie still has a PID. Only absence proves that it was reaped.
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return false;
      }
      throw error;
    }
  }

  async function waitUntil(condition: () => boolean) {
    const end = Date.now() + 5_000;
    while (!condition()) {
      if (Date.now() >= end) {
        throw new Error('Owned process fixture did not reach its expected state');
      }
      await sleep(20);
    }
  }

  function pids(caseDirectory: string): OwnedPids {
    return JSON.parse(fs.readFileSync(path.join(caseDirectory, 'pids.json'), 'utf8'));
  }

  function createCase(name: string, mode: string) {
    const caseDirectory = path.join(directory, name);
    fs.mkdirSync(caseDirectory);
    cases.push(caseDirectory);
    const env = Object.fromEntries(
      Object.entries({
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        NODE_OPTIONS: `--import=${pathToFileURL(mode.startsWith('direct-') ? directPreloadPath : preloadPath).href}`,
        CODEX_PREFLIGHT_TEST_DIR: caseDirectory,
        CODEX_PREFLIGHT_TEST_MODE: mode,
      }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    return { caseDirectory, env };
  }

  function start(name: string, mode = 'stall', signal?: AbortSignal) {
    const { caseDirectory, env } = createCase(name, mode);
    const result = checkCodexCliCompatibility({
      sdkEntryPoint,
      codexPathOverride: process.execPath,
      env,
      signal,
    }).then(
      () => ({ success: true as const }),
      (error: unknown) => ({ error }),
    );
    calls.push(result);
    return { caseDirectory, result };
  }

  async function ready(caseDirectory: string) {
    await waitUntil(
      () =>
        fs.existsSync(path.join(caseDirectory, 'pids.json')) &&
        fs.existsSync(path.join(caseDirectory, 'heartbeat')),
    );
    return pids(caseDirectory);
  }

  afterEach(async () => {
    // Only PIDs emitted by this test's owned launchers are eligible for cleanup.
    for (const caseDirectory of cases.splice(0)) {
      if (!fs.existsSync(path.join(caseDirectory, 'pids.json'))) {
        continue;
      }
      const owned = pids(caseDirectory);
      const processes = [owned.wrapper];
      if (owned.child !== undefined) {
        processes.push(owned.child);
      }
      if (
        owned.supervisor !== process.pid &&
        !owners.some((owner) => owner.pid === owned.supervisor)
      ) {
        processes.push(owned.supervisor);
      }
      for (const pid of processes) {
        if (isPresent(pid)) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // The process may exit between inspection and the owned-PID kill.
          }
        }
      }
    }
    for (const owner of owners.splice(0)) {
      if (owner.exitCode === null && owner.signalCode === null) {
        const exited = once(owner, 'exit');
        owner.kill('SIGKILL');
        await exited;
      }
      owner.stdout?.destroy();
      owner.stderr?.destroy();
    }
    await Promise.allSettled(calls.splice(0));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reaps a successful direct CLI with no descendants', async () => {
    const probe = start('direct-success', 'direct-success');
    const owned = await ready(probe.caseDirectory);
    expect(owned.child).toBeUndefined();
    fs.writeFileSync(path.join(probe.caseDirectory, 'release'), 'release');
    await expect(probe.result).resolves.toEqual({ success: true });
    expect(isPresent(owned.wrapper)).toBe(false);
  });

  it('reaps a direct CLI before an aborted call settles without stopping another probe', async () => {
    const controller = new AbortController();
    const aborted = start('direct-abort', 'direct-stall', controller.signal);
    const survivor = start('direct-survivor', 'direct-success');
    const [abortedPids, survivorPids] = await Promise.all([
      ready(aborted.caseDirectory),
      ready(survivor.caseDirectory),
    ]);
    controller.abort();
    expect(await aborted.result).toMatchObject({
      error: expect.objectContaining({ name: 'AbortError' }),
    });
    expect(isPresent(abortedPids.wrapper)).toBe(false);
    expect(isPresent(survivorPids.wrapper)).toBe(true);
    fs.writeFileSync(path.join(survivor.caseDirectory, 'release'), 'release');
    await expect(survivor.result).resolves.toEqual({ success: true });
    expect(isPresent(survivorPids.wrapper)).toBe(false);
  });

  it('reaps a direct CLI before the ten-second deadline error settles', async () => {
    const probe = start('direct-timeout', 'direct-stall');
    const owned = await ready(probe.caseDirectory);
    expect(await probe.result).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining('timed out after 10000ms'),
      }),
    });
    expect(isPresent(owned.wrapper)).toBe(false);
  });

  it.each(['stdout', 'stderr'] as const)(
    'reaps a direct CLI before the %s limit error settles',
    async (stream) => {
      const probe = start(`direct-overflow-${stream}`, `direct-overflow-${stream}`);
      const owned = await ready(probe.caseDirectory);
      fs.writeFileSync(path.join(probe.caseDirectory, 'release'), 'overflow');
      expect(await probe.result).toMatchObject({
        error: expect.objectContaining({ message: expect.stringContaining(`${stream} exceeded`) }),
      });
      expect(isPresent(owned.wrapper)).toBe(false);
    },
  );

  it('accepts a successful owned wrapper and descendant', async () => {
    const probe = start('successful');
    const owned = await ready(probe.caseDirectory);
    fs.writeFileSync(path.join(probe.caseDirectory, 'release'), 'release');
    await expect(probe.result).resolves.toEqual({ success: true });
    await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
  });

  it('closes inherited pipes when a successful Node wrapper exits before its child', async () => {
    const probe = start('early-exit', 'early-exit');
    const owned = await ready(probe.caseDirectory);
    await expect(probe.result).resolves.toEqual({ success: true });
    await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
  });

  it.each(['stdout', 'stderr'] as const)(
    "drains the child's complete %s and accepts its trailing version at EOF",
    async (stream) => {
      const probe = start(`drain-${stream}`, `drain-${stream}`);
      const owned = await ready(probe.caseDirectory);
      if (process.platform === 'win32') {
        // A Windows Node wrapper owns its child through a kill-on-close job.
        // Keep it alive while exercising the same complete-output EOF contract.
        expect(isPresent(owned.wrapper)).toBe(true);
      } else {
        // The only version writer is released after the POSIX launcher exits.
        fs.writeFileSync(path.join(probe.caseDirectory, 'exit-release'), 'exit');
        await waitUntil(() => !isPresent(owned.wrapper));
      }
      expect(isPresent(owned.child)).toBe(true);
      fs.writeFileSync(path.join(probe.caseDirectory, 'release'), 'write');
      let settled = false;
      void probe.result.then(() => {
        settled = true;
      });
      // Natural EOF must complete promptly, rather than waiting the full 10s.
      await waitUntil(() => settled);
      await expect(probe.result).resolves.toEqual({ success: true });
      expect(Number(fs.readFileSync(path.join(probe.caseDirectory, 'write-done'), 'utf8'))).toBe(
        256 * 1024 + Buffer.byteLength('\ncodex-cli 0.130.0\n'),
      );
      await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
    },
  );

  it('stops the probe when its owning process is terminated', async () => {
    const { caseDirectory, env } = createCase('owner-exit', 'stall');
    const helper = new URL(
      '../../../src/providers/openai/codexCliCompatibility.ts',
      import.meta.url,
    );
    const ownerScript = `
      const { checkCodexCliCompatibility } = await import(${JSON.stringify(helper.href)});
      await checkCodexCliCompatibility(${JSON.stringify({
        sdkEntryPoint,
        codexPathOverride: process.execPath,
        env,
      })});
    `;
    const owner = spawn(process.execPath, ['--input-type=module', '-e', ownerScript], {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    owners.push(owner);
    owner.stdout?.resume();
    owner.stderr?.resume();
    const owned = await ready(caseDirectory);
    const exited = once(owner, 'exit');
    if (process.platform === 'win32') {
      owner.kill('SIGKILL');
    } else {
      process.kill(-owner.pid!, 'SIGKILL');
    }
    await exited;
    await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
    const stoppedAt = fs.readFileSync(path.join(caseDirectory, 'heartbeat'), 'utf8');
    await sleep(50);
    expect(fs.readFileSync(path.join(caseDirectory, 'heartbeat'), 'utf8')).toBe(stoppedAt);
  });

  it('terminates the wrapper and its descendant at the ten-second deadline', async () => {
    const probe = start('timeout');
    const owned = await ready(probe.caseDirectory);
    const result = await probe.result;
    expect(result).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining('timed out after 10000ms'),
      }),
    });
    await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
  });

  it('aborts one probe without stopping a concurrent successful probe', async () => {
    const controller = new AbortController();
    const aborted = start('aborted', 'stall', controller.signal);
    const successful = start('successful');
    const [abortedPids, successfulPids] = await Promise.all([
      ready(aborted.caseDirectory),
      ready(successful.caseDirectory),
    ]);
    controller.abort();
    let settled = false;
    void aborted.result.then(() => {
      settled = true;
    });
    await waitUntil(() => settled);
    expect(await aborted.result).toMatchObject({
      error: expect.objectContaining({ name: 'AbortError' }),
    });
    await waitUntil(() => !isPresent(abortedPids.wrapper) && !isPresent(abortedPids.child));
    expect(isPresent(successfulPids.wrapper)).toBe(true);
    expect(isPresent(successfulPids.child)).toBe(true);
    fs.writeFileSync(path.join(successful.caseDirectory, 'release'), 'release');
    await expect(successful.result).resolves.toEqual({ success: true });
    await waitUntil(() => !isPresent(successfulPids.wrapper) && !isPresent(successfulPids.child));
  });

  it('terminates the owned tree when captured output exceeds the limit', async () => {
    const probe = start('overflow', 'overflow');
    const owned = await ready(probe.caseDirectory);
    expect(await probe.result).toMatchObject({
      error: expect.objectContaining({ message: expect.stringContaining('stdout exceeded') }),
    });
    await waitUntil(() => !isPresent(owned.wrapper) && !isPresent(owned.child));
  });
});
