import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executablePromptFunction } from '../../src/prompts/processors/executable';
import { ScriptCompletionProvider } from '../../src/providers/scriptCompletion';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('../../src/cache', () => ({
  getCache: () => mocks,
  isCacheEnabled: () => true,
}));

let directory: string;
let command: string;
let pidPath: string;

beforeEach(async () => {
  mocks.get.mockReset().mockResolvedValue(undefined);
  mocks.set.mockReset().mockResolvedValue(undefined);
  directory = await mkdtemp(path.join(os.tmpdir(), 'script-completion-cache-'));
  pidPath = path.join(directory, 'child.pid');
  const script = path.join(directory, 'fixture.cjs');
  await writeFile(
    script,
    `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
process.stdout.write('finished child');`,
  );
  command = `"${process.execPath}" "${script}"`;
});

afterEach(async () => {
  try {
    const pid = Number(await readFile(pidPath, 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
    vi.resetAllMocks();
  }
});

describe('script execution cache failures', () => {
  it.each(['provider', 'prompt'] as const)(
    'rejects the %s call when caching a successful child result fails',
    async (mode) => {
      const failure = new Error('cache write failed');
      mocks.set.mockRejectedValue(failure);
      const operation =
        mode === 'provider'
          ? new ScriptCompletionProvider(command).callApi('hello')
          : executablePromptFunction(command, {
              vars: {},
              provider: { id: () => 'echo', callApi: async () => ({}) },
            });
      await expect(operation).rejects.toBe(failure);
      expect(mocks.set).toHaveBeenCalledOnce();
    },
  );

  it('serializes script context without changing the caller object', async () => {
    const script = path.join(directory, 'fixture.cjs');
    await writeFile(
      script,
      `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
process.stdout.write(process.argv[4]);`,
    );
    const getCache = vi.fn();
    const prompt = { raw: 'hello', label: 'fixture' };
    const context = Object.freeze({ vars: { value: 'fixture' }, prompt, getCache });
    const response = await new ScriptCompletionProvider(command).callApi('hello', context);

    expect(JSON.parse(response.output as string)).toEqual({ vars: { value: 'fixture' }, prompt });
    expect(context.getCache).toBe(getCache);
  });

  it('closes provider stdin before awaiting child completion', async () => {
    const script = path.join(directory, 'fixture.cjs');
    await writeFile(
      script,
      `require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
process.stdin.resume();
process.stdin.on('end', () => process.stdout.write('received EOF'));`,
    );
    await expect(new ScriptCompletionProvider(command).callApi('hello')).resolves.toEqual({
      output: 'received EOF',
    });
  });
});
