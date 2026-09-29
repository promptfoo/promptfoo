import { describe, expect, it } from 'vitest';
import { getGradingTrace } from '../../../src/redteam/grading/trace';

describe('grading trace span identities', () => {
  it('rejects native and collected span ID collisions', () => {
    expect(() =>
      getGradingTrace({
        traceData: {
          traceId: 'trace',
          evaluationId: 'eval-fixture',
          testCaseId: 'case-fixture',
          spans: [{ spanId: 'provider-tool-0', name: 'inventory.lookup', startTime: 1 }],
        },
        providerResponse: {
          metadata: { toolCalls: [{ name: 'inventory.count', input: {}, output: { count: 2 } }] },
        },
      }),
    ).toThrow('Duplicate grading span ID');
  });

  it('rejects duplicate collected span IDs without native receipts', () => {
    expect(() =>
      getGradingTrace({
        traceData: {
          traceId: 'trace',
          evaluationId: 'eval-fixture',
          testCaseId: 'case-fixture',
          spans: [
            { spanId: 'duplicate', name: 'inventory.lookup', startTime: 1 },
            { spanId: 'duplicate', name: 'inventory.count', startTime: 2 },
          ],
        },
      }),
    ).toThrow('Duplicate grading span ID');
  });

  it('preserves distinct native and collected receipts', () => {
    const trace = getGradingTrace({
      traceData: {
        traceId: 'trace',
        evaluationId: 'eval-fixture',
        testCaseId: 'case-fixture',
        spans: [{ spanId: 'collected', name: 'inventory.lookup', startTime: 1 }],
      },
      providerResponse: {
        metadata: { toolCalls: [{ name: 'inventory.count', input: {}, output: { count: 2 } }] },
      },
    });
    expect(trace?.spans.map((span) => span.spanId)).toEqual(['collected', 'provider-tool-0']);
  });
});
