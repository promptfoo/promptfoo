import { describe, expect, it } from 'vitest';
import { inspectNative } from '../../src/metamorphic/inspect';
import { renderInspection } from '../../src/metamorphic/inspectRender';
import { renderPlanSummary, summarizePlan } from '../../src/metamorphic/planSummary';
import { serializeReport } from '../../src/metamorphic/serialize';

function row(variant: string, repetition = 0, group = variant) {
  return {
    promptIdx: 0,
    provider: { id: 'https://private-endpoint', label: '' },
    promptId: 'private-prompt',
    testCase: { metadata: { metamorphic: { familyId: 'family', variantId: variant } } },
    repeatIndex: repetition,
    repeatGroupId: group,
    success: true,
    failureReason: 0,
    response: { output: 'secret-output', cached: false },
  };
}
function exported(rows: unknown[]) {
  return { results: { version: 3, results: rows } };
}
const plan = {
  version: 1,
  name: 'plan',
  repetitions: 2,
  contexts: [{ id: 'local', providerId: 'echo', promptIdx: 0 }],
  families: [
    {
      id: 'f',
      variants: ['a', 'b'],
      relations: [
        {
          id: 'r',
          kind: 'subset',
          left: 'a',
          right: 'b',
          leftSelector: { source: 'output' },
          rightSelector: { source: 'output' },
        },
      ],
    },
  ],
};
describe('native inspection', () => {
  it('counts observed identity without inferring expected coverage', () => {
    const result = inspectNative(exported([row('a', 0), row('a', 2), row('b', 0)]));
    expect(result.contexts[0].variants[0].explicitRepeatIndices).toEqual([0, 2]);
    expect(result).not.toHaveProperty('expected');
    expect(result.contexts[0].status.passed).toBe(3);
    expect(result.contexts[0].variants[0].repeatGroupCount).toBe(1);
  });
  it('redacts endpoint identities until explicitly opted in', () => {
    const input = exported([row('a')]);
    expect(JSON.stringify(inspectNative(input))).not.toContain('https://private');
    const disclosed = inspectNative(input, { includeContextSelectors: true });
    expect(disclosed.contexts[0].selector).toEqual({
      providerId: 'https://private-endpoint',
      providerLabel: '',
      promptIdx: 0,
    });
    expect(JSON.stringify(disclosed)).not.toContain('secret-output');
    expect(JSON.stringify(disclosed)).not.toContain('private-prompt');
    expect(() =>
      inspectNative(input, { includeContextSelectors: 'false' } as unknown as {
        includeContextSelectors: boolean;
      }),
    ).toThrow(/boolean/);
  });
  it('distinguishes absent and empty provider labels', () => {
    const result = inspectNative(
      exported([row('a'), { ...row('a'), provider: { id: 'https://private-endpoint' } }]),
    );
    expect(result.contexts).toHaveLength(2);
    expect(result.contexts.map((item) => item.providerLabelPresent)).toEqual([true, false]);
  });
  it('reports duplicate slots and native group collisions with row indices', () => {
    const result = inspectNative(
      exported([row('a'), row('a'), row('a', 1, 'other'), row('b', 1, 'a')]),
    );
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'duplicate-slot',
        'conflicting-repeat-group',
        'conflicting-group-identity',
      ]),
    );
    expect(result.diagnostics.find((item) => item.code === 'duplicate-slot')?.rowIndices).toEqual([
      1,
    ]);
  });
  it('bounds diagnostic samples without dropping occurrence totals', () => {
    const result = inspectNative(
      exported(Array.from({ length: 100 }, () => ({ ...row('a'), testCase: {} }))),
    );
    expect(result.diagnostics[0]).toMatchObject({
      code: 'missing-identity',
      count: 100,
      omittedRowIndices: 80,
    });
    expect(result.diagnostics[0].rowIndices).toHaveLength(20);
  });
  it('renders compact repeated-index runs and private-output-free diagnostics', () => {
    const result = inspectNative(exported([row('a', 0), row('a', 1), row('a', 2), row('a', 4)]));
    const text = renderInspection(result, 'markdown', 100_000);
    expect(text).toContain('0–2, 4');
    expect(text).not.toContain('secret-output');
    expect(text).not.toContain('private-endpoint');
  });
});
describe('plan review and serialization', () => {
  it('reviews expected workload and direction before results exist', () => {
    const summary = summarizePlan(plan);
    expect(summary.expectedChecks).toBe(2);
    expect(summary.expectedObservations).toBe(4);
    expect(summary.relations[0].requirement).toContain('left array occurs in the right');
    expect(renderPlanSummary(summary, 'markdown', 100_000)).toContain('a → b');
  });
  it('serializes reports identically to pretty JSON within bounds', () => {
    const value = { quote: '\"\n', array: [null, false, 0, { x: 'é' }], absent: undefined };
    expect(serializeReport(value, 10_000)).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(() => serializeReport({ repeated: Array(100).fill('x'.repeat(1000)) }, 100)).toThrow(
      /byte limit/,
    );
  });
  it('does not invoke getters or serialization hooks', () => {
    let called = false;
    const value = Object.defineProperty({}, 'x', {
      get() {
        called = true;
        return 'private';
      },
      enumerable: true,
    });
    expect(() => serializeReport(value, 1000)).toThrow();
    expect(() =>
      serializeReport(
        {
          toJSON() {
            called = true;
            return 'private';
          },
        },
        1000,
      ),
    ).toThrow();
    expect(called).toBe(false);
  });
  it('bounds plan structure before Zod traverses it', () => {
    expect(() => summarizePlan(plan, { maxValueNodes: 3 })).toThrow(/node/);
    const unsafe = Object.defineProperty({}, 'version', {
      get() {
        throw new Error('secret executed');
      },
    });
    expect(() => summarizePlan(unsafe)).toThrow(/data properties/);
  });
});
