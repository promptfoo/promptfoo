/**
 * Contract test for the environment promptfoo hands to the spawned `opencode serve` process.
 *
 * The rest of the OpenCode suite mocks `createOpencode`, so it cannot see this contract break --
 * and it can break with no change to our code at all. `@opencode-ai/sdk` ignores the `env` option
 * it is handed (its `ServerOptions` type has no `env` field) and spawns with `{ ...process.env }`,
 * so promptfoo applies the computed env to `process.env` around the spawn and depends on
 * `createOpencode()` reaching `cross-spawn` synchronously.
 *
 * This runs against the REAL SDK with a stub `opencode` on PATH and asserts the *outcome* rather
 * than the mechanism:
 * - if an upgrade inserts an `await` before the spawn, our restore runs too early and this fails,
 *   which is exactly the signal we want;
 * - if an upgrade starts honoring the `env` option, this still passes, because nothing is broken.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnWithServerEnv } from '../../src/providers/opencode-sdk';
import { mockProcessEnv } from '../util/utils';

// Resolved through a variable so TypeScript does not require the optional dependency to be
// present, matching how the provider itself loads it.
const OPENCODE_V2_SPECIFIER = '@opencode-ai/sdk/v2';

interface StubOpenCodeModule {
  createOpencode: (options: {
    hostname?: string;
    port?: number;
    timeout?: number;
  }) => Promise<{ server: { url: string; close(): void } }>;
}

const hasSdk = fs.existsSync(
  path.resolve(process.cwd(), 'node_modules/@opencode-ai/sdk/package.json'),
);
// The stub server is a POSIX shell script; Windows would need a separate shim.
const canSpawnStub = process.platform !== 'win32';

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/**
 * Writes a stand-in for the `opencode` CLI that records the environment it was given, then emits
 * the one stdout line the SDK waits for.
 */
function createStubOpenCodeCli(): { binDir: string; probeLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-opencode-stub-'));
  const probeLog = path.join(binDir, 'probe.txt');

  fs.writeFileSync(
    path.join(binDir, 'opencode'),
    [
      '#!/bin/sh',
      '{',
      '  echo "TRACEPARENT=${OPENCODE_TRACEPARENT:-<unset>}"',
      '  echo "PROBE=${PROMPTFOO_SPAWN_PROBE:-<unset>}"',
      '} > "$PROMPTFOO_SPAWN_PROBE_LOG"',
      'echo "opencode server listening on http://127.0.0.1:4096"',
      '# Stay alive until the test closes us, but bounded so an orphan cannot linger.',
      'sleep 10',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  return { binDir, probeLog };
}

const describeSpawnContract = hasSdk && canSpawnStub ? describe : describe.skip;

describeSpawnContract('OpenCode SDK spawn environment contract', () => {
  let restoreEnv: (() => void) | undefined;
  const tempDirs: string[] = [];

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENCODE_TRACEPARENT: undefined,
      PROMPTFOO_SPAWN_PROBE: undefined,
      PROMPTFOO_SPAWN_PROBE_LOG: undefined,
    });
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('delivers the computed environment to the real spawned server process', async () => {
    const { binDir, probeLog } = createStubOpenCodeCli();
    tempDirs.push(binDir);

    const { createOpencode } = (await import(
      /* @vite-ignore */ OPENCODE_V2_SPECIFIER
    )) as StubOpenCodeModule;

    const serverEnv = {
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      OPENCODE_TRACEPARENT: TRACEPARENT,
      PROMPTFOO_SPAWN_PROBE: 'from-buildServerEnv',
      PROMPTFOO_SPAWN_PROBE_LOG: probeLog,
    };

    const pending = spawnWithServerEnv(serverEnv, () =>
      createOpencode({ hostname: '127.0.0.1', port: 4096, timeout: 15000 }),
    );

    // Restored before the first suspension point, so a concurrently spawning provider can
    // neither observe these values nor inherit them.
    expect(process.env.OPENCODE_TRACEPARENT).toBeUndefined();
    expect(process.env.PROMPTFOO_SPAWN_PROBE).toBeUndefined();

    const opencode = await pending;
    try {
      const probe = fs.readFileSync(probeLog, 'utf8');
      expect(probe).toContain(`TRACEPARENT=${TRACEPARENT}`);
      expect(probe).toContain('PROBE=from-buildServerEnv');
    } finally {
      opencode.server.close();
    }
  });

  it('restores a pre-existing ambient value instead of dropping it', async () => {
    mockProcessEnv({ OPENCODE_TRACEPARENT: 'ambient-value' });
    const { binDir, probeLog } = createStubOpenCodeCli();
    tempDirs.push(binDir);

    const { createOpencode } = (await import(
      /* @vite-ignore */ OPENCODE_V2_SPECIFIER
    )) as StubOpenCodeModule;

    const opencode = await spawnWithServerEnv(
      {
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        OPENCODE_TRACEPARENT: TRACEPARENT,
        PROMPTFOO_SPAWN_PROBE_LOG: probeLog,
      },
      () => createOpencode({ hostname: '127.0.0.1', port: 4096, timeout: 15000 }),
    );

    try {
      expect(fs.readFileSync(probeLog, 'utf8')).toContain(`TRACEPARENT=${TRACEPARENT}`);
      expect(process.env.OPENCODE_TRACEPARENT).toBe('ambient-value');
    } finally {
      opencode.server.close();
    }
  });
});
