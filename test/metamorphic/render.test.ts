import { describe, expect, it } from 'vitest';
import { analyzeMetamorphic } from '../../src/metamorphic/analyze';
import { renderReport } from '../../src/metamorphic/render';

function report() {
  const rows = ['a', 'b'].map((variantId) => ({
    promptIdx: 0,
    provider: { id: 'private-provider' },
    testCase: { metadata: { metamorphic: { familyId: 'f', variantId } } },
    success: true,
    failureReason: 0,
    response: { output: `private-${variantId}` },
  }));
  return analyzeMetamorphic(
    { results: { version: 3, results: rows } },
    {
      version: 1,
      name: '<script>![bad](https://secret.test)</script>',
      repetitions: 1,
      contexts: [{ id: 'c', promptIdx: 0, providerId: 'private-provider' }],
      families: [
        {
          id: 'f',
          variants: ['a', 'b'],
          relations: [
            {
              id: 'r',
              left: 'a',
              right: 'b',
              kind: 'equal',
              leftSelector: { source: 'output' },
              rightSelector: { source: 'output' },
            },
          ],
        },
      ],
    },
  );
}
describe('privacy-first reports', () => {
  it.each(['json', 'markdown', 'junit'] as const)(
    'preserves a failed full verdict with zero %s details',
    (format) => {
      const text = renderReport(report(), format, { maxDetails: 0 });
      expect(text).toContain('fail');
      expect(text).not.toContain('private-');
      if (format === 'json') {
        expect(JSON.parse(text).presentation.omittedChecks).toBe(1);
      }
      if (format === 'junit') {
        expect(text).toContain('<failure');
      }
    },
  );
  it('escapes user labels for Markdown and XML', () => {
    expect(renderReport(report(), 'markdown')).not.toContain('<script>');
    expect(renderReport(report(), 'markdown')).not.toContain('![bad]');
    expect(renderReport(report(), 'junit')).toContain('&lt;script&gt;');
  });
  it('rejects oversized report output instead of partially publishing it', () => {
    expect(() => renderReport(report(), 'json', { maxBytes: 10 })).toThrow(/byte limit/);
    expect(() => renderReport(report(), 'markdown', { maxBytes: 10 })).toThrow(/byte limit/);
  });
});

it('preserves inconclusive full-panel outcomes as JUnit failures even without details', () => {
  const incomplete = report();
  incomplete.verdict = 'inconclusive';
  incomplete.totals = { expected: 1, pass: 0, fail: 0, inconclusive: 1 };
  const text = renderReport(incomplete, 'junit', { maxDetails: 0 });
  expect(text).toContain('failures="1"');
  expect(text).toContain('<failure');
  expect(text).not.toContain('<skipped');
});

it('prioritizes failed details without mutating complete ledgers', () => {
  const value = report();
  const failed = value.checks[0];
  value.checks = [
    { ...failed, relationId: 'early-pass', verdict: 'pass', reason: 'relation-satisfied' },
    { ...failed, relationId: 'later-failure' },
  ];
  const selected = JSON.parse(renderReport(value, 'json', { maxDetails: 1 }));
  expect(selected.checks[0].relationId).toBe('later-failure');
  expect(selected.presentation.omittedChecks).toBe(1);
  expect(value.checks[0].relationId).toBe('early-pass');
  const original = JSON.parse(
    renderReport(value, 'json', { maxDetails: 1, detailOrder: 'input-order' }),
  );
  expect(original.checks[0].relationId).toBe('early-pass');
});
