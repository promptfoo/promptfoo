import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import {
  getProviderTokenUsage,
  trackResponseUsage,
  withTokenUsageTracking,
} from '../../src/util/tokenUsage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluation token usage', () => {
  it('infers one request when a fresh response omits numRequests', async () => {
    const evaluation = await withTokenUsageTracking(async () => {
      trackResponseUsage('target', { tokenUsage: { total: 7, prompt: 3, completion: 4 } });
      return {};
    });
    expect(getProviderTokenUsage(evaluation).get('target')).toMatchObject({
      total: 7,
      prompt: 3,
      completion: 4,
      cached: 0,
      numRequests: 1,
    });
  });

  it('shows cache hits without charging historical work again', async () => {
    const evaluation = await withTokenUsageTracking(async () => {
      trackResponseUsage('target', {
        cached: true,
        tokenUsage: { total: 100, prompt: 60, completion: 40, cached: 10, numRequests: 1 },
      });
      return {};
    });
    expect(getProviderTokenUsage(evaluation).get('target')).toMatchObject({
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 100,
      numRequests: 0,
    });
  });

  it('combines fresh usage with cache visibility and preserves reported retry counts', async () => {
    const evaluation = await withTokenUsageTracking(async () => {
      trackResponseUsage('target', {
        tokenUsage: { total: 25, prompt: 15, completion: 10, cached: 5, numRequests: 3 },
      });
      trackResponseUsage('target', {
        cached: true,
        tokenUsage: { total: 40, prompt: 25, completion: 15, numRequests: 1 },
      });
      return {};
    });
    expect(getProviderTokenUsage(evaluation).get('target')).toMatchObject({
      total: 25,
      prompt: 15,
      completion: 10,
      cached: 45,
      numRequests: 3,
    });
  });

  it('restores parent accounting after a nested run and a failed nested run', async () => {
    let child!: object;
    const parent = await withTokenUsageTracking(async () => {
      trackResponseUsage('shared', { tokenUsage: { total: 1 } });
      child = await withTokenUsageTracking(async () => {
        trackResponseUsage('shared', { tokenUsage: { total: 100 } });
        return {};
      });
      await expect(
        withTokenUsageTracking(async () => {
          trackResponseUsage('shared', { tokenUsage: { total: 1000 } });
          throw new Error('failed nested evaluation');
        }),
      ).rejects.toThrow('failed nested evaluation');
      trackResponseUsage('shared', { tokenUsage: { total: 2 } });
      return {};
    });
    expect(getProviderTokenUsage(parent).get('shared')).toMatchObject({ total: 3, numRequests: 2 });
    expect(getProviderTokenUsage(child).get('shared')).toMatchObject({
      total: 100,
      numRequests: 1,
    });
  });

  it('keeps overlapping runs with the same ID separate by returned object identity', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withTokenUsageTracking(async () => {
      trackResponseUsage('shared', { tokenUsage: { total: 1 } });
      await ready;
      trackResponseUsage('shared', { tokenUsage: { total: 2 } });
      return { id: 'same-id' };
    });
    const second = await withTokenUsageTracking(async () => {
      trackResponseUsage('shared', { tokenUsage: { total: 100 } });
      return { id: 'same-id' };
    });
    release();
    expect(getProviderTokenUsage(await first).get('shared')?.total).toBe(3);
    expect(getProviderTokenUsage(second).get('shared')?.total).toBe(100);
  });

  it('starts a new map for a later run of the same evaluation object', async () => {
    const evaluation = {};
    await withTokenUsageTracking(async () => {
      trackResponseUsage('target', { tokenUsage: { total: 100 } });
      return evaluation;
    });
    const firstUsage = getProviderTokenUsage(evaluation);
    await withTokenUsageTracking(async () => {
      trackResponseUsage('target', { tokenUsage: { total: 3 } });
      return evaluation;
    });
    expect(firstUsage.get('target')?.total).toBe(100);
    expect(getProviderTokenUsage(evaluation).get('target')?.total).toBe(3);
  });

  it('seals completed accounting against late work that inherited its async context', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let lateWork!: Promise<void>;
    const evaluation = await withTokenUsageTracking(async () => {
      trackResponseUsage('target', { tokenUsage: { total: 1 } });
      lateWork = ready.then(() => {
        trackResponseUsage('target', { tokenUsage: { total: 100 } });
        trackResponseUsage('late-attacker', { tokenUsage: { total: 1000 } });
      });
      return {};
    });
    release();
    await lateWork;
    expect([...getProviderTokenUsage(evaluation).keys()]).toEqual(['target']);
    expect(getProviderTokenUsage(evaluation).get('target')?.total).toBe(1);
  });

  it('does not create process-wide accounting outside an evaluation', () => {
    const debug = vi.spyOn(logger, 'debug');
    trackResponseUsage('standalone', { tokenUsage: { total: 100 } });
    expect(debug).not.toHaveBeenCalled();
    expect(getProviderTokenUsage({}).size).toBe(0);
  });

  it('redacts URL credentials in provider IDs when logging response usage', async () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    await withTokenUsageTracking(async () => {
      trackResponseUsage(
        'https://api.example.com/v1?api_key=sk-12345678901234567890 (HttpProvider)',
        {
          tokenUsage: { total: 1 },
        },
      );
      return {};
    });
    const messages = debug.mock.calls.map(([message]) => String(message)).join('\n');
    expect(messages).toContain('api_key=%5BREDACTED%5D');
    expect(messages).toContain('(HttpProvider)');
    expect(messages).not.toContain('sk-12345678901234567890');
  });
});
