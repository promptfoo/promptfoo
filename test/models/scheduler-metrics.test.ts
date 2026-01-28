import { randomUUID } from 'crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';

import type { SchedulerMetrics } from '../../src/types';

vi.mock('../../src/globalConfig/accounts', async () => {
  const actual = await vi.importActual('../../src/globalConfig/accounts');
  return {
    ...actual,
    getUserEmail: vi.fn().mockReturnValue('test@example.com'),
  };
});

describe('SchedulerMetrics persistence', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  let evalInstance: Eval;
  const testMetrics: SchedulerMetrics = {
    minConcurrency: 2,
    maxConcurrency: 10,
    finalConcurrency: 4,
    rateLimitHits: 5,
    retriedRequests: 3,
    concurrencyReduced: true,
  };

  beforeEach(async () => {
    // Create a new eval
    evalInstance = await Eval.create({ description: 'Test eval for scheduler metrics' }, [], {
      id: randomUUID(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should persist schedulerMetrics through save/load cycle', async () => {
    // Set scheduler metrics
    evalInstance.setSchedulerMetrics(testMetrics);

    // Save the eval
    await evalInstance.save();

    // Load the eval from database
    const loadedEval = await Eval.findById(evalInstance.id);

    // Verify metrics were persisted
    expect(loadedEval).toBeDefined();
    expect(loadedEval!.schedulerMetrics).toEqual(testMetrics);
  });

  it('should include schedulerMetrics in getStats() output', async () => {
    // Set scheduler metrics
    evalInstance.setSchedulerMetrics(testMetrics);

    // Get stats
    const stats = evalInstance.getStats();

    // Verify schedulerMetrics are included
    expect(stats.schedulerMetrics).toEqual(testMetrics);
  });

  it('should handle eval without schedulerMetrics gracefully', async () => {
    // Save eval without setting metrics
    await evalInstance.save();

    // Load the eval from database
    const loadedEval = await Eval.findById(evalInstance.id);

    // Verify no metrics
    expect(loadedEval).toBeDefined();
    expect(loadedEval!.schedulerMetrics).toBeUndefined();

    // getStats should still work
    const stats = loadedEval!.getStats();
    expect(stats.schedulerMetrics).toBeUndefined();
  });
});
