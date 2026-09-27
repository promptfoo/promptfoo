import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICodexAppServerProvider } from '../../../src/providers/openai/codex-app-server';
import { OpenAICodexSDKProvider } from '../../../src/providers/openai/codex-sdk';
import { mockProcessEnv } from '../../util/utils';

interface QueueProvider {
  threadRunQueues: Map<string, Promise<void>>;
  runSerializedThreadTurn<T>(
    key: string | undefined,
    signal: AbortSignal | undefined,
    run: () => Promise<T>,
  ): Promise<T>;
  prepareEnvironment(config: Record<string, unknown>): Record<string, string>;
  findGitRepositoryRoot(directory: string): string | undefined;
  config: Record<string, unknown>;
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let restoreEnv: (() => void) | undefined;
const temporaryDirectories: string[] = [];
afterEach(() => {
  restoreEnv?.();
  restoreEnv = undefined;
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

for (const [name, Class, abortMessage] of [
  ['SDK', OpenAICodexSDKProvider, 'Codex thread turn wait aborted'],
  ['app-server', OpenAICodexAppServerProvider, 'Codex app-server thread turn wait aborted'],
] as const) {
  const make = (): QueueProvider =>
    Object.assign(Object.create(Class.prototype), { threadRunQueues: new Map(), config: {} });
  describe(name + ' shared primitive compatibility', () => {
    it('keeps a cancelled queued turn behind its predecessor without releasing the next turn early', async () => {
      const provider = make(),
        gate = deferred(),
        started = deferred(),
        controller = new AbortController();
      const events: string[] = [];
      const first = provider.runSerializedThreadTurn('same', undefined, async () => {
        events.push('first');
        started.resolve();
        await gate.promise;
      });
      await started.promise;
      const cancelled = provider
        .runSerializedThreadTurn('same', controller.signal, async () => {
          events.push('cancelled');
        })
        .catch((error) => error);
      const third = provider.runSerializedThreadTurn('same', undefined, async () => {
        events.push('third');
      });
      controller.abort();
      expect(await cancelled).toMatchObject({ name: 'AbortError', message: abortMessage });
      await setImmediate();
      expect(events).toEqual(['first']);
      gate.resolve();
      await Promise.all([first, third]);
      await setImmediate();
      expect(events).toEqual(['first', 'third']);
      expect(provider.threadRunQueues.size).toBe(0);
    });

    it('runs other keys and other instances independently', async () => {
      const provider = make(),
        other = make(),
        gate = deferred(),
        started = deferred();
      const first = provider.runSerializedThreadTurn('same', undefined, async () => {
        started.resolve();
        await gate.promise;
      });
      await started.promise;
      expect(
        await provider.runSerializedThreadTurn('different', undefined, async () => 'different'),
      ).toBe('different');
      expect(await other.runSerializedThreadTurn('same', undefined, async () => 'other')).toBe(
        'other',
      );
      gate.resolve();
      await first;
    });

    it('retains the unkeyed direct call even when its signal is already aborted', async () => {
      const provider = make(),
        controller = new AbortController();
      controller.abort();
      expect(
        await provider.runSerializedThreadTurn(undefined, controller.signal, async () => 'direct'),
      ).toBe('direct');
      expect(provider.threadRunQueues.size).toBe(0);
    });

    it('recovers after operation failure and rejected predecessors', async () => {
      const provider = make();
      await expect(
        provider.runSerializedThreadTurn('same', undefined, async () => {
          throw new Error('failed');
        }),
      ).rejects.toThrow('failed');
      provider.threadRunQueues.set('same', Promise.reject(new Error('previous failed')));
      expect(
        await provider.runSerializedThreadTurn('same', undefined, async () => 'recovered'),
      ).toBe('recovered');
      await setImmediate();
      expect(provider.threadRunQueues.size).toBe(0);
    });

    it.each([false, true])(
      'removes the abort listener when the wait finishes (abort=%s)',
      async (abort) => {
        const provider = make(),
          gate = deferred(),
          started = deferred(),
          controller = new AbortController();
        const add = vi.spyOn(controller.signal, 'addEventListener');
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const first = provider.runSerializedThreadTurn('same', undefined, async () => {
          started.resolve();
          await gate.promise;
        });
        await started.promise;
        const next = provider
          .runSerializedThreadTurn('same', controller.signal, async () => 'done')
          .catch((error) => error);
        if (abort) {
          controller.abort();
        } else {
          gate.resolve();
        }
        const result = await next;
        if (abort) {
          expect(result).toMatchObject({ name: 'AbortError', message: abortMessage });
        } else {
          expect(result).toBe('done');
        }
        gate.resolve();
        await first;
        expect(add).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
      },
    );

    it('does not let an old completion erase a replacement after cleanup clears the map', async () => {
      const provider = make(),
        oldGate = deferred(),
        oldStarted = deferred(),
        newGate = deferred(),
        newStarted = deferred();
      const old = provider.runSerializedThreadTurn('same', undefined, async () => {
        oldStarted.resolve();
        await oldGate.promise;
      });
      await oldStarted.promise;
      provider.threadRunQueues.clear();
      const replacement = provider.runSerializedThreadTurn('same', undefined, async () => {
        newStarted.resolve();
        await newGate.promise;
      });
      await newStarted.promise;
      const entry = provider.threadRunQueues.get('same');
      oldGate.resolve();
      await old;
      await setImmediate();
      expect(provider.threadRunQueues.get('same')).toBe(entry);
      newGate.resolve();
      await replacement;
      await setImmediate();
      expect(provider.threadRunQueues.size).toBe(0);
    });

    it('keeps minimum env filtering and explicit per-call overrides separate', () => {
      restoreEnv = mockProcessEnv(
        {
          PATH: '/fixture/bin',
          HOME: '/fixture/home',
          TERM: 'xterm',
          LC_ALL: '',
          AMBIENT_CANARY: 'private',
        },
        { clear: true },
      );
      const provider = make();
      expect(provider.prepareEnvironment({ cli_env: { EXPLICIT: 'A' } })).toEqual({
        HOME: '/fixture/home',
        PATH: '/fixture/bin',
        TERM: 'xterm',
        EXPLICIT: 'A',
      });
      expect(provider.prepareEnvironment({ cli_env: { EXPLICIT: 'B' } }).EXPLICIT).toBe('B');
      expect(provider.prepareEnvironment({ inherit_process_env: true }).AMBIENT_CANARY).toBe(
        'private',
      );
    });

    it.each(['file', 'directory'])(
      'finds the nearest Git marker including a worktree %s',
      (marker) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-codex-root-'));
        temporaryDirectories.push(directory);
        const nested = path.join(directory, 'nested'),
          leaf = path.join(nested, 'leaf');
        fs.mkdirSync(leaf, { recursive: true });
        fs.mkdirSync(path.join(directory, '.git'));
        if (marker === 'file') {
          fs.writeFileSync(path.join(nested, '.git'), 'gitdir: /fixture');
        } else {
          fs.mkdirSync(path.join(nested, '.git'));
        }
        expect(make().findGitRepositoryRoot(leaf)).toBe(nested);
      },
    );
  });
}
