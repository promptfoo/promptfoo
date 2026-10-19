import { expect, it } from 'vitest';
import { AgenticRunQueue } from '../../src/providers/agenticRunQueue';
import { createDeferred } from '../util/utils';

it('recovers a rejected predecessor and releases the next turn after execution fails', async () => {
  const queue = new AgenticRunQueue('Wait aborted');
  queue.set('session', Promise.reject(new Error('Previous turn failed')));
  const started = createDeferred<void>();
  const release = createDeferred<void>();
  const order: string[] = [];
  const failure = new Error('Current turn failed');
  const first = queue.run('session', undefined, async () => {
    order.push('first');
    started.resolve();
    await release.promise;
    throw failure;
  });
  const second = queue.run('session', undefined, async () => {
    order.push('second');
    return 'Recovered';
  });

  await started.promise;
  expect(order).toEqual(['first']);
  release.resolve();
  await expect(first).rejects.toBe(failure);
  await expect(second).resolves.toBe('Recovered');
  await queue.get('session');
  expect(order).toEqual(['first', 'second']);
  expect(queue.size).toBe(0);
});
