import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { executablePromptFunction } from '../../src/prompts/processors/executable';
import { ScriptCompletionProvider } from '../../src/providers/scriptCompletion';

const cache = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../../src/cache', () => ({ getCache: () => cache, isCacheEnabled: () => true }));

describe('executable prompts and providers', () => {
  let directory: string;
  let command: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'script-completion-cache-'));
    const script = path.join(directory, 'peer.cjs');
    await writeFile(
      script,
      `setTimeout(() => {
  console.error('Timed out waiting for stdin EOF');
  process.exit(1);
}, 2000).unref();
process.stdin.resume();
process.stdin.on('end', () => process.stdout.write(process.argv.at(-1)));`,
    );
    command = `"${process.execPath}" "${script}"`;
  });

  beforeEach(() => {
    cache.get.mockReset();
    cache.set.mockReset();
  });

  afterAll(() => rm(directory, { recursive: true, force: true }));

  it.each(['provider', 'prompt'])(
    'closes %s stdin and propagates cache write failures after child completion',
    async (mode) => {
      const failure = new Error('cache write failed');
      cache.set.mockRejectedValue(failure);
      const result =
        mode === 'provider'
          ? new ScriptCompletionProvider(command).callApi('hello')
          : executablePromptFunction(command, {
              vars: {},
              provider: { id: () => 'echo', callApi: async () => ({}) },
            });
      await expect(result).rejects.toBe(failure);
      expect(cache.set).toHaveBeenCalledOnce();
    },
  );

  it('omits internal accessors without reading them or changing the caller object', async () => {
    const prompt = { raw: 'hello', label: 'fixture' };
    const context = Object.freeze({
      vars: {},
      prompt,
      get getCache() {
        throw new Error('internal getter must not run');
      },
    });
    const response = await new ScriptCompletionProvider(command).callApi('hello', context);
    expect(JSON.parse(response.output as string)).toEqual({ vars: {}, prompt });
  });

  it('respects context serialization on the original instance', async () => {
    class Context {
      vars = { secret: 'private' };
      prompt = { raw: 'hello', label: 'fixture' };
      #safe = { redacted: true };

      toJSON() {
        return this.#safe;
      }
    }

    const response = await new ScriptCompletionProvider(command).callApi('hello', new Context());
    expect(JSON.parse(response.output as string)).toEqual({ redacted: true });
  });
});
