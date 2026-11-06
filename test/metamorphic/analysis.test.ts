import { describe, expect, it } from 'vitest';
import { analyzeMetamorphic } from '../../src/metamorphic/analyze';
import { parsePlan } from '../../src/metamorphic/plan';

const selector = { source: 'output', pointer: '', decode: 'json' };
function plan() {
  return {
    version: 1,
    name: 'context order',
    repetitions: 1,
    contexts: [{ id: 'local', promptIdx: 0, providerId: 'echo' }],
    families: [
      {
        id: 'retrieval',
        variants: ['original', 'reordered'],
        relations: [
          {
            id: 'decision',
            left: 'original',
            right: 'reordered',
            leftSelector: { ...selector },
            rightSelector: { ...selector },
            kind: 'equal',
          },
        ],
      },
    ],
  };
}
function row(variant: string, output: unknown = '{"decision":"allow"}') {
  return {
    promptIdx: 0,
    provider: { id: 'echo' },
    promptId: 'prompt',
    testCase: { metadata: { metamorphic: { familyId: 'retrieval', variantId: variant } } },
    success: true,
    failureReason: 0,
    response: { output },
    namedScores: {},
  };
}
function exported(rows: unknown[]) {
  return { evalId: 'eval-native', results: { version: 3, results: rows }, config: {} };
}
describe('native metamorphic panels', () => {
  it('accepts the actual native OutputFile without an outer version', () => {
    const report = analyzeMetamorphic(exported([row('original'), row('reordered')]), plan());
    expect(report.verdict).toBe('pass');
    expect(report.checks).toHaveLength(1);
    expect(report.observations.expected).toBe(2);
  });
  it('keeps missing variants and repetitions in the expected panel', () => {
    const p = { ...plan(), repetitions: 2 };
    const report = analyzeMetamorphic(exported([{ ...row('original'), repeatIndex: 0 }]), p);
    expect(report.verdict).toBe('inconclusive');
    expect(report.observations.expected).toBe(4);
    expect(report.observations.missing).toBe(3);
    expect(report.checks).toHaveLength(2);
  });
  it('does not pass equality on native redacted outputs', () => {
    const report = analyzeMetamorphic(
      exported([row('original', '[output stripped]'), row('reordered', '[output stripped]')]),
      plan(),
    );
    expect(report.verdict).toBe('inconclusive');
    expect(report.checks[0].reason).toBe('output-stripped');
  });
  it('separates source assertion failure from usable output', () => {
    const input = exported([
      { ...row('original'), success: false, failureReason: 1, error: 'private assertion reason' },
      row('reordered'),
    ]);
    const report = analyzeMetamorphic(input, plan());
    expect(report.checks[0].verdict).toBe('pass');
    expect(report.verdict).toBe('fail');
    expect(report.observations.assertionFailed).toBe(1);
    expect(JSON.stringify(report)).not.toContain('private assertion reason');
    expect(
      analyzeMetamorphic(input, { ...plan(), sourceAssertions: 'observe-output' }).verdict,
    ).toBe('pass');
  });
  it('rejects duplicate expanded test slots', () => {
    expect(() => analyzeMetamorphic(exported([row('original'), row('original')]), plan())).toThrow(
      /duplicate/i,
    );
  });
  it('never uses provider-merged metadata as test identity', () => {
    const noIdentity = {
      ...row('original'),
      testCase: {},
      metadata: {
        metamorphic: {
          familyId: 'retrieval',
          variantId: 'original',
        },
      },
    };
    const report = analyzeMetamorphic(exported([noIdentity, row('reordered')]), plan());
    expect(report.verdict).toBe('inconclusive');
    expect(report.observations.missing).toBe(1);
  });
  it('keeps private output values out of reports by default', () => {
    const p = plan();
    p.families[0].relations[0].leftSelector.decode = 'none';
    p.families[0].relations[0].rightSelector.decode = 'none';
    const input = exported([row('original', 'secret-A'), row('reordered', 'secret-B')]);
    const report = analyzeMetamorphic(input, p);
    expect(report.verdict).toBe('fail');
    expect(JSON.stringify(report)).not.toContain('secret-');
  });
});
describe('strict plan', () => {
  it('rejects unknown fields and self relations before reading any rows', () => {
    expect(() => parsePlan({ ...plan(), typo: true })).toThrow();
    const p = plan();
    p.families[0].relations[0].right = 'original';
    expect(() => parsePlan(p)).toThrow();
  });
  it('rejects duplicate contexts and unused variants', () => {
    const p = plan();
    p.contexts.push({ ...p.contexts[0], id: 'other' });
    expect(() => parsePlan(p)).toThrow();
    const q = plan();
    q.families[0].variants.push('unused');
    expect(() => parsePlan(q)).toThrow();
  });
});

describe('runtime and repetition identity contracts', () => {
  it('rejects nonboolean source-value disclosure options', () => {
    expect(() =>
      analyzeMetamorphic(exported([row('original'), row('reordered')]), plan(), {
        includeValues: 'false',
      } as unknown as { includeValues: boolean }),
    ).toThrow(/boolean/);
  });
  it('rejects different expanded tests filling disjoint repeat slots', () => {
    expect(() =>
      analyzeMetamorphic(
        exported([
          { ...row('original'), repeatIndex: 0, repeatGroupId: 'first-input' },
          { ...row('original'), repeatIndex: 1, repeatGroupId: 'different-input' },
        ]),
        { ...plan(), repetitions: 2 },
      ),
    ).toThrow(/repeat group/);
  });
  it('rejects one native group assigned two logical variants', () => {
    expect(() =>
      analyzeMetamorphic(
        exported([
          { ...row('original'), repeatGroupId: 'same-input' },
          { ...row('reordered'), repeatGroupId: 'same-input' },
        ]),
        plan(),
      ),
    ).toThrow(/repeat group/);
  });
});

describe('joint family outcomes and identity provenance', () => {
  it('requires every relation to pass in the same repetition', () => {
    const p = plan();
    p.repetitions = 2;
    const report = analyzeMetamorphic(
      exported([
        { ...row('original'), repeatIndex: 0, repeatGroupId: 'original' },
        { ...row('reordered'), repeatIndex: 0, repeatGroupId: 'reordered' },
        { ...row('original'), repeatIndex: 1, repeatGroupId: 'original' },
        { ...row('reordered', '{"decision":"deny"}'), repeatIndex: 1, repeatGroupId: 'reordered' },
      ]),
      p,
    );
    expect(report.runTotals).toEqual({ expected: 2, pass: 1, fail: 1, inconclusive: 0 });
    expect(report.familyRuns.map((run) => run.verdict)).toEqual(['pass', 'fail']);
    expect(report.identityCoverage).toEqual({
      presentObservations: 4,
      repeatIndexProvided: 4,
      repeatGroupProvided: 4,
      promptIdProvided: 4,
    });
  });
  it('reports independent left and right selector availability', () => {
    const p = plan();
    p.families[0].relations[0].leftSelector.pointer = '/missing';
    const report = analyzeMetamorphic(
      exported([row('original'), row('reordered', 'invalid json')]),
      p,
    );
    expect(report.checks[0].selections).toEqual({
      left: { available: false, reason: 'pointer-missing' },
      right: { available: false, reason: 'invalid-json-output' },
    });
  });
  it('does not present absent native identity metadata as verified', () => {
    const report = analyzeMetamorphic(exported([row('original'), row('reordered')]), plan());
    expect(report.identityCoverage.repeatGroupProvided).toBe(0);
    expect(report.identityCoverage.repeatIndexProvided).toBe(0);
  });
});

it('bounds native repeat identity strings consistently with inspection', () => {
  expect(() =>
    analyzeMetamorphic(
      exported([{ ...row('original'), repeatGroupId: 'x'.repeat(5000) }, row('reordered')]),
      plan(),
    ),
  ).toThrow(/repeat group/);
});
