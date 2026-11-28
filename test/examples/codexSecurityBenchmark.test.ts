import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';
import { AssertionsResult } from '../../src/assertions/assertionsResult';

import type { GradingResult } from '../../src/types/index';

let helper: {
  evidenceHash: (value: unknown) => string;
  completedScan: (output: unknown, context: unknown) => GradingResult;
  gradeBenchmark: (output: unknown, context: unknown) => GradingResult;
};
const reportHash = 'a'.repeat(64);

function fixture() {
  const definition = {
    revision: 'pinned-revision',
    sourceSnapshotSha256: 'b'.repeat(64),
    groundTruthSha256: 'c'.repeat(64),
    scope: { includePaths: ['a.ts', 'b.ts'], excludePaths: [] as string[] },
    expectedIds: ['expected-a', 'expected-b'],
  };
  const review = {
    definitionSha256: helper.evidenceHash(definition),
    protocolValid: true,
    provenanceValid: true,
    findings: {
      first: [
        {
          rootCauseId: 'cause-a',
          verdict: 'supported',
          inScope: true,
          expectedIds: ['expected-a'],
          evidence: 'Independently reviewed source reference',
        },
      ],
    } as Record<
      string,
      Array<{
        rootCauseId: string;
        verdict: string;
        inScope: boolean;
        expectedIds: string[];
        evidence: string;
      }>
    >,
  };
  const receipt = { review, reviewSha256: helper.evidenceHash(review) };
  const benchmark = {
    definition,
    definitionSha256: helper.evidenceHash(definition),
    reports: { [reportHash]: receipt },
  };
  const context = {
    metadata: {
      codexSecurity: {
        version: 1,
        operation: 'security-scan' as string | null,
        status: 'completed',
        scanId: 'recorded-scan',
        findings: { total: 1, bySeverity: {} },
        validation: null,
        source: { kind: 'saved-report', mocked: false, sha256: reportHash },
        target: { revision: definition.revision },
        scope: {
          ...definition.scope,
          summary: 'Run-specific narrative',
          limitations: ['Partial review'],
        },
        coverage: { completeness: 'partial' },
      },
    },
    vars: { benchmark },
  };
  const output = {
    manifest: {
      documentType: 'codex-security.scan-manifest',
      schemaVersion: '1.0',
      scan: { id: 'recorded-scan', status: 'completed' },
    },
    findings: {
      documentType: 'codex-security.findings',
      schemaVersion: '1.0',
      scanId: 'recorded-scan',
      findings: [{ findingId: 'first' }],
    },
  };
  const resign = () => {
    benchmark.definitionSha256 = helper.evidenceHash(definition);
    review.definitionSha256 = benchmark.definitionSha256;
    receipt.reviewSha256 = helper.evidenceHash(review);
  };
  return { definition, review, receipt, benchmark, context, output, resign };
}

describe('Codex Security example benchmark grading', () => {
  beforeAll(async () => {
    helper = await import(
      pathToFileURL(path.resolve('examples/openai-codex-security/grade-benchmark.mjs')).href
    );
  });

  it('scores curated recall with a fixed denominator despite partial coverage', () => {
    const f = fixture();
    expect(helper.gradeBenchmark(JSON.stringify(f.output), f.context)).toMatchObject({
      pass: false,
      score: 0.5,
      namedScores: { CuratedRecall: 0.5, PrecisionLower: 1, PrecisionUpper: 1 },
      metadata: { quality: { status: 'scored', expectedCount: 2 } },
    });
  });

  it('does not count a completed validation as a completed scan', () => {
    const f = fixture();
    expect(helper.completedScan(f.output, f.context)).toMatchObject({ pass: true, score: 1 });
    for (const invalid of [
      { operation: 'validation' },
      { validation: { disposition: 'reportable' } },
      { findings: null },
      { status: 'failed' },
    ]) {
      expect(
        helper.completedScan(f.output, {
          metadata: { codexSecurity: { ...f.context.metadata.codexSecurity, ...invalid } },
        }),
      ).toMatchObject({ pass: false, score: 0 });
    }
    expect(helper.completedScan(null, {})).toMatchObject({ pass: false, score: 0 });
  });

  it('leaves validation results with extra findings and matching review evidence unscored', () => {
    const f = fixture();
    Object.assign(f.context.metadata.codexSecurity, {
      operation: 'validation',
      validation: { disposition: 'reportable' },
    });
    const output = {
      disposition: 'reportable',
      report: 'Recorded validation decision',
      findings: f.output.findings,
    };

    const result = helper.gradeBenchmark(output, f.context);

    expect(result).toMatchObject({
      pass: false,
      metadata: { quality: { status: 'not-scored', curatedRecall: null, precision: null } },
    });
    expect(result.namedScores).toBeUndefined();
  });

  it.each(['security-scan', 'deep-security-scan', 'security-diff-scan', null])(
    'scores canonical scan-shaped reports with operation %s',
    (operation) => {
      const f = fixture();
      f.context.metadata.codexSecurity.operation = operation;

      expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
        namedScores: { CuratedRecall: 0.5 },
        metadata: { quality: { status: 'scored' } },
      });
    },
  );

  it('loads independent grading evidence from an explicit file without prompt variables', () => {
    const f = fixture();
    const directory = mkdtempSync(path.join(tmpdir(), 'codex-security-grading-'));
    try {
      const file = path.join(directory, 'benchmark.json');
      writeFileSync(file, JSON.stringify(f.benchmark));
      const result = helper.gradeBenchmark(f.output, {
        metadata: f.context.metadata,
        config: { benchmark: `file://${file}` },
      });
      expect(result.namedScores?.CuratedRecall).toBe(0.5);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('passes a fully matched, supported report and excludes out-of-scope claims from precision', () => {
    const f = fixture();
    f.review.findings.first.push(
      {
        rootCauseId: 'cause-b',
        verdict: 'supported',
        inScope: true,
        expectedIds: ['expected-b'],
        evidence: 'Second reviewed cause',
      },
      {
        rootCauseId: 'outside',
        verdict: 'refuted',
        inScope: false,
        expectedIds: [],
        evidence: 'Outside frozen scope',
      },
    );
    f.resign();
    expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
      pass: true,
      namedScores: { CuratedRecall: 1, PrecisionLower: 1, PrecisionUpper: 1 },
    });
  });

  it('rejects conflicting judgments for duplicate root causes', () => {
    const f = fixture();
    f.review.findings.first.push({
      rootCauseId: 'cause-a',
      verdict: 'refuted',
      inScope: true,
      expectedIds: [],
      evidence: 'Conflicting adjudication',
    });
    f.resign();
    expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
      metadata: { quality: { status: 'not-scored' } },
    });
  });

  it('hashes object keys consistently while preserving array order', () => {
    expect(helper.evidenceHash({ a: 1, b: 2 })).toBe(helper.evidenceHash({ b: 2, a: 1 }));
    expect(helper.evidenceHash(['a', 'b'])).not.toBe(helper.evidenceHash(['b', 'a']));
  });

  it('ignores scope order and narrative differences', () => {
    const f = fixture();
    f.context.metadata.codexSecurity.scope.includePaths = ['b.ts', 'a.ts'];
    expect(helper.gradeBenchmark(f.output, f.context).namedScores?.CuratedRecall).toBe(0.5);
  });

  it('does not double count repeated claims or expected matches', () => {
    const f = fixture();
    f.review.findings.second = structuredClone(f.review.findings.first);
    f.output.findings.findings.push({ findingId: 'second' });
    f.context.metadata.codexSecurity.findings.total = 2;
    f.resign();
    expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
      namedScores: { CuratedRecall: 0.5 },
      metadata: { quality: { duplicateClaims: 1, precision: { supported: 1 } } },
    });
  });

  it('keeps supported extra findings out of curated recall and reports unresolved precision bounds', () => {
    const f = fixture();
    f.review.findings.first.push(
      {
        rootCauseId: 'extra',
        verdict: 'supported',
        inScope: true,
        expectedIds: [],
        evidence: 'Extra reviewed cause',
      },
      {
        rootCauseId: 'uncertain',
        verdict: 'unresolved',
        inScope: true,
        expectedIds: [],
        evidence: 'Unresolved precondition',
      },
    );
    f.resign();
    expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
      namedScores: { CuratedRecall: 0.5, PrecisionLower: 2 / 3, PrecisionUpper: 1 },
      metadata: { quality: { precision: { resolved: 1, unresolved: 1 } } },
    });
  });

  it('measures zero recall for an eligible empty report while precision remains undefined', () => {
    const f = fixture();
    f.output.findings.findings = [];
    f.context.metadata.codexSecurity.findings.total = 0;
    f.review.findings = {};
    f.resign();
    expect(helper.gradeBenchmark(f.output, f.context)).toMatchObject({
      namedScores: { CuratedRecall: 0 },
      metadata: {
        quality: { status: 'scored', precision: { lower: null, upper: null, resolved: null } },
      },
    });
    expect(helper.gradeBenchmark(f.output, f.context).namedScores).not.toHaveProperty(
      'PrecisionLower',
    );
  });

  it.each([
    [
      'validation operation on a scan-shaped output',
      (f: ReturnType<typeof fixture>) => {
        f.context.metadata.codexSecurity.operation = 'validation';
      },
    ],
    [
      'missing normalized scan findings',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.context.metadata.codexSecurity, { findings: null });
      },
    ],
    [
      'validation disposition on a scan-shaped output',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.context.metadata.codexSecurity, {
          validation: { disposition: 'reportable' },
        });
      },
    ],
    [
      'missing canonical scan manifest',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.output, { manifest: undefined });
      },
    ],
    [
      'mismatched scan identity',
      (f: ReturnType<typeof fixture>) => {
        f.output.manifest.scan.id = 'different-scan';
      },
    ],
    [
      'changed revision',
      (f: ReturnType<typeof fixture>) => {
        f.context.metadata.codexSecurity.target.revision = 'other';
      },
    ],
    [
      'changed scope',
      (f: ReturnType<typeof fixture>) => {
        f.context.metadata.codexSecurity.scope.includePaths = ['other.ts'];
      },
    ],
    [
      'changed definition',
      (f: ReturnType<typeof fixture>) => {
        f.definition.expectedIds.push('new');
      },
    ],
    [
      'changed review',
      (f: ReturnType<typeof fixture>) => {
        f.review.findings.first[0].evidence = 'Changed';
      },
    ],
    [
      'missing review',
      (f: ReturnType<typeof fixture>) => {
        f.context.metadata.codexSecurity.source.sha256 = 'd'.repeat(64);
      },
    ],
    [
      'failed operation',
      (f: ReturnType<typeof fixture>) => {
        f.context.metadata.codexSecurity.status = 'failed';
      },
    ],
    [
      'protocol violation',
      (f: ReturnType<typeof fixture>) => {
        f.review.protocolValid = false;
        f.resign();
      },
    ],
    [
      'unverified provenance',
      (f: ReturnType<typeof fixture>) => {
        f.review.provenanceValid = false;
        f.resign();
      },
    ],
    [
      'empty expected set',
      (f: ReturnType<typeof fixture>) => {
        f.definition.expectedIds = [];
        f.resign();
      },
    ],
    [
      'duplicate expected IDs',
      (f: ReturnType<typeof fixture>) => {
        f.definition.expectedIds = ['x', 'x'];
        f.resign();
      },
    ],
    [
      'unadjudicated finding',
      (f: ReturnType<typeof fixture>) => {
        f.output.findings.findings.push({ findingId: 'unknown' });
      },
    ],
    [
      'unsupported expected ID',
      (f: ReturnType<typeof fixture>) => {
        f.review.findings.first[0].expectedIds = ['unknown'];
        f.resign();
      },
    ],
    [
      'unresolved matched claim',
      (f: ReturnType<typeof fixture>) => {
        f.review.findings.first[0].verdict = 'unresolved';
        f.resign();
      },
    ],
    [
      'duplicate report IDs',
      (f: ReturnType<typeof fixture>) => {
        f.output.findings.findings.push({ findingId: 'first' });
      },
    ],
    [
      'unreviewed source snapshot',
      (f: ReturnType<typeof fixture>) => {
        f.definition.sourceSnapshotSha256 = '';
        f.resign();
      },
    ],
  ])('leaves quality unscored for %s', (_name, change) => {
    const f = fixture();
    change(f);
    const result = helper.gradeBenchmark(f.output, f.context);
    expect(result).toMatchObject({
      pass: false,
      score: 0,
      metadata: { quality: { status: 'not-scored', curatedRecall: null, precision: null } },
    });
    expect(result.namedScores).toBeUndefined();
  });

  it('does not insert missing quality metrics into assertion aggregates', async () => {
    const f = fixture();
    f.review.protocolValid = false;
    f.resign();
    const aggregate = new AssertionsResult();
    aggregate.addResult({ index: 0, result: helper.gradeBenchmark(f.output, f.context) });
    const result = await aggregate.testResult();
    expect(result.namedScores).not.toHaveProperty('CuratedRecall');
    expect(result.componentResults?.[0].metadata?.quality.status).toBe('not-scored');
  });
});
