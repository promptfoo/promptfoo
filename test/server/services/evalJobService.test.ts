import { describe, expect, it } from 'vitest';
import { EvalJobService } from '../../../src/server/services/evalJobService';

describe('EvalJobService', () => {
  it('creates an in-progress job', () => {
    const service = new EvalJobService();

    expect(service.create('job-1')).toEqual({
      evalId: null,
      status: 'in-progress',
      progress: 0,
      total: 0,
      result: null,
      logs: [],
    });
  });

  it('tracks progress, completion, and logs', () => {
    const service = new EvalJobService();
    service.create('job-1');

    expect(service.setProgress('job-1', 2, 5)).toBe(true);
    expect(service.appendLog('job-1', 'working')).toBe(true);
    expect(service.complete('job-1', { results: [] } as never, 'eval-1')).toBe(true);

    expect(service.get('job-1')).toMatchObject({
      evalId: 'eval-1',
      status: 'complete',
      progress: 2,
      total: 5,
      result: { results: [] },
      logs: ['working'],
    });
  });

  it('returns defensive snapshots', () => {
    const service = new EvalJobService();
    service.create('job-1');

    const snapshot = service.get('job-1');
    expect(snapshot).toBeDefined();
    snapshot?.logs.push('mutated outside service');

    expect(service.get('job-1')?.logs).toEqual([]);
  });

  it('supports replacing and appending failure logs', () => {
    const service = new EvalJobService();
    service.create('job-1');
    service.appendLog('job-1', 'before failure');

    expect(service.fail('job-1', ['first failure'])).toBe(true);
    expect(service.get('job-1')?.logs).toEqual(['first failure']);

    expect(service.fail('job-1', ['second failure'], true)).toBe(true);
    expect(service.get('job-1')).toMatchObject({
      evalId: null,
      status: 'error',
      result: null,
      logs: ['first failure', 'second failure'],
    });
  });

  it('returns false when updating a missing job', () => {
    const service = new EvalJobService();

    expect(service.setProgress('missing', 1, 1)).toBe(false);
    expect(service.complete('missing', null, null)).toBe(false);
    expect(service.fail('missing', ['missing'])).toBe(false);
    expect(service.appendLog('missing', 'missing')).toBe(false);
  });
});
