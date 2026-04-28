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

  it('SubmitRating response schema returns a message envelope', () => {
    const parsed = EvalSchemas.SubmitRating.Response.parse({ message: 'ok' });
    expect(parsed).toEqual({ message: 'ok' });
  });
});
