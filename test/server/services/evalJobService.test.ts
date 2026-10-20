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
    const result = { results: [{ output: { nested: 'original' } }] } as never;
    service.complete('job-1', result, 'eval-1');

    const snapshot = service.get('job-1');
    expect(snapshot).toBeDefined();
    snapshot?.logs.push('mutated outside service');
    (snapshot?.result as any).results[0].output.nested = 'mutated outside service';
    (result as any).results[0].output.nested = 'mutated after completion';

    expect(service.get('job-1')?.logs).toEqual([]);
    expect((service.get('job-1')?.result as any).results[0].output.nested).toBe('original');
  });

  it('stores JSON-safe snapshots for function-backed prompts', () => {
    const service = new EvalJobService();
    service.create('job-1');

    expect(() =>
      service.complete(
        'job-1',
        {
          prompts: [{ function: () => 'generated prompt', label: 'dynamic prompt' }],
          results: [],
        } as never,
        'eval-1',
      ),
    ).not.toThrow();
    expect(service.get('job-1')?.result).toEqual({
      prompts: [{ label: 'dynamic prompt' }],
      results: [],
    });
  });

  it('stores JSON-safe snapshots for circular references and bigint values', () => {
    const service = new EvalJobService();
    service.create('job-1');
    const output: { count: bigint; self?: unknown } = { count: 42n };
    output.self = output;

    expect(() =>
      service.complete(
        'job-1',
        {
          results: [{ response: { output } }],
        } as never,
        'eval-1',
      ),
    ).not.toThrow();
    expect(service.get('job-1')?.result).toEqual({
      results: [{ response: { output: { count: '42' } } }],
    });
  });

  it('supports replacing and appending failure logs', () => {
    const service = new EvalJobService();
    service.create('job-1');
    service.appendLog('job-1', 'before failure');

    expect(service.fail('job-1', ['first failure'])).toBe(true);
    expect(service.get('job-1')?.logs).toEqual(['first failure']);

    expect(service.fail('job-1', ['second failure'], { append: true })).toBe(true);
    expect(service.get('job-1')).toMatchObject({
      evalId: null,
      status: 'error',
      result: null,
      logs: ['first failure', 'second failure'],
    });
  });

  it('can preserve completed results when marking a job as failed', () => {
    const service = new EvalJobService();
    service.create('job-1');
    service.complete('job-1', { results: [] } as never, 'eval-1');

    expect(
      service.fail('job-1', ['cancelled after completion'], {
        append: true,
        resetResult: false,
      }),
    ).toBe(true);
    expect(service.get('job-1')).toMatchObject({
      evalId: 'eval-1',
      status: 'error',
      result: { results: [] },
      logs: ['cancelled after completion'],
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
