import fs from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import { importModule } from '../../src/esm';
import { ClaudeCodeSDKProvider } from '../../src/providers/claude-agent-sdk';
import { releaseWorkingDirectoryCopies } from '../../src/providers/workingDirectoryCopies';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  importModule: vi.fn(),
  resolvePackageEntryPoint: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
}));

const mockQuery = vi.fn();
const roots: string[] = [];

function successQuery(): Query {
  const messages = [
    {
      type: 'result',
      subtype: 'success',
      session_id: 'copy-test-session',
      result: 'done',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 1,
      permission_denials: [],
    },
  ];
  return (async function* () {
    for (const message of messages) {
      yield message as unknown as SDKMessage;
    }
  })() as unknown as Query;
}

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-copy-test-'));
  roots.push(root);
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'seed.txt'), 'original');
  return source;
}

describe('Claude Agent SDK copied working directory', () => {
  beforeEach(() => {
    disableCache();
    mockQuery.mockReset();
    vi.mocked(importModule).mockResolvedValue({ query: mockQuery });
    mockQuery.mockImplementation(() => successQuery());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearCache();
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('gives each call a distinct writable copy and retains it for assertions', async () => {
    const source = await fixture();
    mockQuery.mockImplementation(({ options }) => {
      const destination = path.join(options.cwd, 'written.txt');
      return (async function* () {
        await fs.writeFile(destination, 'agent output');
        for await (const message of successQuery()) {
          yield message;
        }
      })() as unknown as Query;
    });
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });

    const [first, second] = await Promise.all([provider.callApi('edit'), provider.callApi('edit')]);
    const firstDir = first.metadata?.workingDir as string;
    const secondDir = second.metadata?.workingDir as string;
    expect(firstDir).toBeTruthy();
    expect(secondDir).toBeTruthy();
    expect(firstDir).not.toBe(secondDir);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(await fs.readFile(path.join(firstDir, 'written.txt'), 'utf8')).toBe('agent output');
    expect(await fs.readFile(path.join(secondDir, 'seed.txt'), 'utf8')).toBe('original');
    await expect(fs.stat(path.join(source, 'written.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    await provider.cleanup();
    await expect(fs.stat(firstDir)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(secondDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not replay cached output or an expired copy path', async () => {
    const source = await fixture();
    enableCache();
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const first = await provider.callApi('same');
    const second = await provider.callApi('same');
    expect(first.cached).toBeUndefined();
    expect(second.cached).toBeUndefined();
    expect(first.metadata?.workingDir).not.toBe(second.metadata?.workingDir);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    await provider.cleanup();
  });

  it('rejects a missing working_dir before starting the SDK', async () => {
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', copy_working_dir: true },
    });
    const response = await provider.callApi('same');
    expect(response.error).toMatch(/working_dir/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects symlinks in the fixture so writes cannot escape the copy', async () => {
    const source = await fixture();
    await fs.symlink(path.join(source, 'seed.txt'), path.join(source, 'linked.txt'));
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const response = await provider.callApi('same');
    expect(response.error).toMatch(/symbolic link|symlink/i);
    expect(mockQuery).not.toHaveBeenCalled();
    await provider.cleanup();
  });
  it('rejects special files in the fixture before copying', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const source = await fixture();
    const socket = createServer();
    await new Promise<void>((resolve) => socket.listen(path.join(source, 'socket'), resolve));
    try {
      const provider = new ClaudeCodeSDKProvider({
        config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
      });
      const response = await provider.callApi('same');
      expect(response.error).toMatch(/special files/i);
      expect(mockQuery).not.toHaveBeenCalled();
      await provider.cleanup();
    } finally {
      await new Promise<void>((resolve) => socket.close(() => resolve()));
    }
  });

  it('keeps an aborted call copy until the SDK settles, then removes it', async () => {
    const source = await fixture();
    const controller = new AbortController();
    let started!: (dir: string) => void;
    const startedPromise = new Promise<string>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    const finishPromise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockQuery.mockImplementation(
      ({ options }) =>
        (async function* () {
          started(options.cwd);
          await finishPromise;
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        })() as unknown as Query,
    );
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const responsePromise = provider.callApi('same', undefined, { abortSignal: controller.signal });
    const dir = await startedPromise;
    controller.abort();
    await provider.cleanup();
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
    finish();
    const response = await responsePromise;
    expect(response.error).toMatch(/aborted/i);
    expect(response.metadata?.workingDir).toBe(dir);
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns the copy path when the SDK yields no result', async () => {
    const source = await fixture();
    mockQuery.mockImplementation(() => (async function* () {})() as unknown as Query);
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const response = await provider.callApi('same');
    const dir = response.metadata?.workingDir as string;
    expect(response.error).toMatch(/didn't return a result/);
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
    await provider.cleanup();
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates another fresh copy when the scheduler retries a rate limit', async () => {
    const source = await fixture();
    const paths: string[] = [];
    mockQuery.mockImplementation(({ options }) => {
      paths.push(options.cwd);
      if (paths.length === 1) {
        return (async function* () {
          throw new Error('rate limit');
        })() as unknown as Query;
      }
      return successQuery();
    });
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const scheduler = new RateLimitRegistry({ maxConcurrency: 1 });
    try {
      const result = await scheduler.execute(provider, () => provider.callApi('same'), {
        isRateLimited: (response) => Boolean(response?.error?.includes('rate limit')),
        getRetryAfter: () => 0,
      });
      expect(result.error).toBeUndefined();
      expect(paths).toHaveLength(2);
      expect(paths[0]).not.toBe(paths[1]);
      expect(result.metadata?.workingDir).toBe(paths[1]);
      expect((await fs.stat(paths[0])).isDirectory()).toBe(true);
    } finally {
      scheduler.dispose();
      await provider.cleanup();
    }
    for (const dir of paths) {
      await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('waits for an in-flight SDK call to settle after its evaluation is released', async () => {
    const source = await fixture();
    let finish!: () => void;
    let started!: (dir: string) => void;
    const startedPromise = new Promise<string>((resolve) => {
      started = resolve;
    });
    const finishPromise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockQuery.mockImplementation(
      ({ options }) =>
        (async function* () {
          started(options.cwd);
          await finishPromise;
          for await (const message of successQuery()) {
            yield message;
          }
        })() as unknown as Query,
    );
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const responsePromise = provider.callApi('same', {
      evaluationId: 'timed-out-eval',
      vars: {},
      prompt: { raw: 'same', label: 'same' },
    });
    const dir = await startedPromise;
    await releaseWorkingDirectoryCopies('timed-out-eval');
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
    finish();
    const response = await responsePromise;
    expect(response.metadata?.workingDir).toBe(dir);
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns the workspace path on SDK failure and cleans it on release', async () => {
    const source = await fixture();
    mockQuery.mockImplementation(
      () =>
        (async function* () {
          throw new Error('SDK failed');
        })() as unknown as Query,
    );
    const provider = new ClaudeCodeSDKProvider({
      config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
    });
    const response = await provider.callApi('same');
    const dir = response.metadata?.workingDir as string;
    expect(response.error).toContain('SDK failed');
    expect((await fs.stat(dir)).isDirectory()).toBe(true);
    await provider.cleanup();
    await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
