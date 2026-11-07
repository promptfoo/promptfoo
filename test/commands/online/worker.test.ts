import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as timers from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureEvent } from '../../../src/commands/online/capture';
import { evaluateTurn, loadOnlineConfig } from '../../../src/commands/online/evaluate';
import * as store from '../../../src/commands/online/store';
import { readJson } from '../../../src/commands/online/store';
import { runOnlineWorker } from '../../../src/commands/online/worker';
import { createEmptyTokenUsage } from '../../../src/util/tokenUsageUtils';

vi.mock('../../../src/commands/online/evaluate', () => ({
  evaluateTurn: vi.fn(),
  loadOnlineConfig: vi.fn(),
}));
vi.mock('../../../src/logger');
vi.mock('node:timers/promises', { spy: true });
let directory: string;
const options = () => ({
  directory,
  configPath: '/trusted/grading.yaml',
  once: true,
  retryErrors: false,
  interval: 100,
});
async function queue(turnId = 't') {
  return captureEvent(directory, 'generic', {
    sessionId: 's',
    turnId,
    input: 'task',
    output: 'reply',
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  directory = await fs.mkdtemp(path.join(tmpdir(), 'online-worker-'));
  vi.mocked(loadOnlineConfig).mockResolvedValue({
    grading: { assert: [{ type: 'contains', value: 'reply' }] },
    description: 'test',
    basePath: directory,
    env: undefined,
  });
  vi.mocked(evaluateTurn).mockResolvedValue({
    evalId: 'eval-test',
    stats: { successes: 1, failures: 0, errors: 0, tokenUsage: createEmptyTokenUsage() },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('online worker', () => {
  it('reads retained receipts once per run while continuing to grade new arrivals', async () => {
    const id = await queue();
    await runOnlineWorker(options());
    const reads = vi.spyOn(store, 'readJson');
    const controller = new AbortController();
    let polls = 0;
    vi.mocked(timers.setTimeout).mockImplementation(async () => {
      polls++;
      if (polls === 1) {
        await queue('new-turn');
      }
      if (polls === 3) {
        controller.abort();
      }
    });
    await runOnlineWorker({ ...options(), once: false, signal: controller.signal });
    expect(polls).toBe(3);
    expect(
      reads.mock.calls.filter(([file]) => file === path.join(directory, 'results', `${id}.json`)),
    ).toHaveLength(1);
    expect(evaluateTurn).toHaveBeenCalledTimes(2);
    expect(await fs.readdir(path.join(directory, 'results'))).toHaveLength(2);
  });
  it('persists the eval receipt and does not regrade after restart', async () => {
    const id = await queue();
    await runOnlineWorker(options());
    expect(await readJson(path.join(directory, 'results', `${id}.json`))).toMatchObject({
      status: 'completed',
      evalId: 'eval-test',
      eventId: id,
    });
    await runOnlineWorker(options());
    expect(evaluateTurn).toHaveBeenCalledTimes(1);
    expect(await fs.readdir(directory)).not.toContain('worker.lock');
  });

  it('records failures without leaking provider details and retries only on request', async () => {
    const id = await queue();
    vi.mocked(evaluateTurn).mockRejectedValueOnce(new Error('secret in judge failure'));
    await runOnlineWorker(options());
    const receipt = await readJson(path.join(directory, 'results', `${id}.json`));
    expect(receipt).toMatchObject({ status: 'error' });
    expect(JSON.stringify(receipt)).not.toContain('secret');
    await runOnlineWorker(options());
    expect(evaluateTurn).toHaveBeenCalledTimes(1);
    await runOnlineWorker({ ...options(), retryErrors: true });
    expect(evaluateTurn).toHaveBeenCalledTimes(2);
    expect(await readJson(path.join(directory, 'results', `${id}.json`))).toMatchObject({
      status: 'completed',
    });
  });

  it('grades a failed assertion as a completed evaluation, not a retryable job', async () => {
    const id = await queue();
    vi.mocked(evaluateTurn).mockResolvedValueOnce({
      evalId: 'eval-fail',
      stats: { successes: 0, failures: 1, errors: 0, tokenUsage: createEmptyTokenUsage() },
    });
    await runOnlineWorker(options());
    expect(await readJson(path.join(directory, 'results', `${id}.json`))).toMatchObject({
      status: 'completed',
      stats: { failures: 1 },
    });
    await runOnlineWorker({ ...options(), retryErrors: true });
    expect(evaluateTurn).toHaveBeenCalledTimes(1);
  });

  it('rejects tampered events without evaluating injected instructions', async () => {
    const id = await queue();
    const file = path.join(directory, 'events', `${id}.json`);
    const event = (await readJson(file)) as object;
    await fs.writeFile(file, JSON.stringify({ ...event, output: 'changed' }));
    await fs.writeFile(path.join(directory, 'events', 'unpublished.tmp'), 'partial');
    await runOnlineWorker(options());
    expect(evaluateTurn).not.toHaveBeenCalled();
    expect(await readJson(path.join(directory, 'results', `${id}.json`))).toMatchObject({
      status: 'error',
    });
  });

  it('excludes a second worker and releases the lock when configuration fails', async () => {
    await fs.writeFile(path.join(directory, 'worker.lock'), '{}');
    await expect(runOnlineWorker(options())).rejects.toThrow('locked');
    await fs.unlink(path.join(directory, 'worker.lock'));
    vi.mocked(loadOnlineConfig).mockRejectedValueOnce(new Error('invalid config'));
    await expect(runOnlineWorker(options())).rejects.toThrow('invalid config');
    expect(await fs.readdir(directory)).not.toContain('worker.lock');
  });

  it('retains interrupted work for a later run and handles shutdown', async () => {
    const id = await queue();
    const controller = new AbortController();
    vi.mocked(evaluateTurn).mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('aborted');
    });
    await runOnlineWorker({ ...options(), signal: controller.signal });
    await expect(fs.stat(path.join(directory, 'results', `${id}.json`))).rejects.toThrow();
    await runOnlineWorker(options());
    expect(evaluateTurn).toHaveBeenCalledTimes(2);
  });

  it('watches new arrivals and exits on abort without leaving the lock', async () => {
    const controller = new AbortController();
    const running = runOnlineWorker({ ...options(), once: false, signal: controller.signal });
    await vi.waitFor(() => expect(loadOnlineConfig).toHaveBeenCalled());
    await queue();
    await vi.waitFor(() => expect(evaluateTurn).toHaveBeenCalledTimes(1));
    controller.abort();
    await running;
    expect(await fs.readdir(directory)).not.toContain('worker.lock');
  });
});
