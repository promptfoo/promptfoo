import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../src/orchestrator/index';
import type { Task } from '../src/orchestrator/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Orchestrator', () => {
  it('should run tasks respecting global concurrency', async () => {
    const orchestrator = new Orchestrator({ maxConcurrency: 2 });
    let active = 0;
    let maxActive = 0;

    const runTask = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(50);
      active--;
    };

    const tasks: Task[] = Array.from({ length: 5 }).map((_, i) => ({
      id: String(i),
      providerKey: 'provider-a',
      run: runTask,
    }));

    await orchestrator.run(tasks);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('should run tasks respecting global concurrency across multiple lanes', async () => {
    const orchestrator = new Orchestrator({ maxConcurrency: 2 });
    let active = 0;
    let maxActive = 0;

    const runTask = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(50);
      active--;
    };

    const tasks: Task[] = Array.from({ length: 6 }).map((_, i) => ({
      id: String(i),
      providerKey: `provider-${i % 3}`,
      run: runTask,
    }));

    await orchestrator.run(tasks);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('should handle task errors gracefully', async () => {
    const orchestrator = new Orchestrator({ maxConcurrency: 1 });
    const task: Task = {
      id: 'error-task',
      providerKey: 'p1',
      run: async () => {
        throw new Error('fail');
      },
    };

    await expect(orchestrator.run([task])).rejects.toThrow('fail');
  });

  it('should respect task delay (rate limiting)', async () => {
    const orchestrator = new Orchestrator({ maxConcurrency: 10 });
    const startTimes: number[] = [];

    const runTask = async () => {
      startTimes.push(Date.now());
      await sleep(100);
    };

    const tasks: Task[] = Array.from({ length: 3 }).map((_, i) => ({
      id: String(i),
      providerKey: 'delay-provider',
      limits: { minGapMs: 50 },
      run: runTask,
    }));

    await orchestrator.run(tasks);

    startTimes.sort((a, b) => a - b);
    expect(startTimes.length).toBe(3);
    expect(startTimes[1] - startTimes[0]).toBeGreaterThanOrEqual(40);
    expect(startTimes[2] - startTimes[1]).toBeGreaterThanOrEqual(40);
  });
});
