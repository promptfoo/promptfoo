import { describe, expect, it } from 'vitest';
import { EvalSchemas } from '../../../src/types/api/eval';

describe('Eval API schemas', () => {
  it('validates table response envelopes without deep-parsing table rows', () => {
    const body = new Proxy([{ outputs: [{ text: 'large output' }] }], {
      get(target, property, receiver) {
        if (property === '0') {
          throw new Error('table body was deep-parsed');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const head = { prompts: [], vars: [] };

    const parsed = EvalSchemas.Table.Response.parse({
      table: { head, body },
      totalCount: 1,
      filteredCount: 1,
      filteredMetrics: null,
      config: {},
      author: null,
      version: 4,
      id: 'eval-1',
      stats: {},
    });

    expect(parsed.table.head).toBe(head);
    expect(parsed.table.body).toBe(body);
  });

  it('rejects table responses where version is not a number', () => {
    const result = EvalSchemas.Table.Response.safeParse({
      table: { head: { prompts: [], vars: [] }, body: [] },
      totalCount: 0,
      filteredCount: 0,
      filteredMetrics: null,
      config: {},
      author: null,
      version: '4',
      id: 'eval-1',
      stats: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects table responses where body is not an array', () => {
    const result = EvalSchemas.Table.Response.safeParse({
      table: { head: { prompts: [], vars: [] }, body: 'not-an-array' },
      totalCount: 0,
      filteredCount: 0,
      filteredMetrics: null,
      config: {},
      author: null,
      version: 4,
      id: 'eval-1',
      stats: {},
    });
    expect(result.success).toBe(false);
  });

  it('SubmitRating response schema preserves the persisted EvalResult row', () => {
    const parsed = EvalSchemas.SubmitRating.Response.parse({
      id: 'result-123',
      success: true,
      score: 0.75,
      failureReason: 0,
      gradingResult: { pass: true, score: 0.75, reason: 'manual override' },
      promptIdx: 0,
    });
    expect(parsed.id).toBe('result-123');
    expect(parsed.success).toBe(true);
    expect(parsed.score).toBe(0.75);
    expect(parsed.failureReason).toBe(0);
    expect(parsed.gradingResult?.pass).toBe(true);
  });

  it('SubmitRating request schema accepts explicit rating intent and rejects unknown actions', () => {
    expect(
      EvalSchemas.SubmitRating.Request.parse({ pass: true, score: 1, ratingAction: 'rate' }),
    ).toMatchObject({ ratingAction: 'rate' });
    expect(
      EvalSchemas.SubmitRating.Request.parse({ pass: true, score: 0.5, ratingAction: 'update' }),
    ).toMatchObject({ ratingAction: 'update' });
    expect(
      EvalSchemas.SubmitRating.Request.safeParse({
        pass: true,
        score: 1,
        ratingAction: 'delete-everything',
      }).success,
    ).toBe(false);
  });

  it('SubmitRating response schema rejects payloads missing the row identifier', () => {
    const result = EvalSchemas.SubmitRating.Response.safeParse({
      success: true,
      score: 1,
      failureReason: 0,
      gradingResult: null,
    });
    expect(result.success).toBe(false);
  });

  it('SubmitRating response schema requires fields used for UI reconciliation', () => {
    const result = EvalSchemas.SubmitRating.Response.safeParse({
      id: 'result-123',
      success: true,
      score: 1,
    });
    expect(result.success).toBe(false);
  });
});
