import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';
import { compileDerivedMetricFormula } from '../../src/evaluator/derivedMetricFormula';

import type { ApiProvider, AtomicTestCase, TestSuite } from '../../src/types';

const exampleDir = path.resolve(__dirname, '../../examples/eval-judge-calibration');
const config = yaml.parse(readFileSync(path.join(exampleDir, 'promptfooconfig.yaml'), 'utf8')) as {
  defaultTest: AtomicTestCase;
  derivedMetrics: NonNullable<TestSuite['derivedMetrics']>;
};
const provider: ApiProvider = {
  id: () => 'judge-calibration-example-test',
  callApi: async () => ({ output: '' }),
};

async function grade(reply: string, label: string) {
  return runAssertions({
    prompt: 'Judge a claim',
    provider,
    providerResponse: { output: reply },
    test: { ...config.defaultTest, vars: { label } },
  });
}

function derive(namedScores: Record<string, number>) {
  const scores = { ...namedScores };
  for (const metric of config.derivedMetrics) {
    scores[metric.name] = compileDerivedMetricFormula(metric.name, metric.value as string)(scores);
  }
  return scores;
}

describe('judge calibration example', () => {
  it('counts misses and false flags apart from the exact-label grade', async () => {
    const totals: Record<string, number> = {};
    for (const [reply, label, pass] of [
      ['Invented id.\n\nLABEL: fabricated', 'fabricated', true],
      // Flagged with the wrong false label: caught, but not an exact match.
      ['Rests on an invented number.\n\nLABEL: fabricated', 'unsupported', false],
      ['Looks fine.\n\nLABEL: verified', 'unsupported', false],
      ['The agent wrote its own review.\n\nLABEL: self-certified', 'verified', false],
      ['A read observed it.\n\nLABEL: verified', 'verified', true],
    ] as const) {
      const result = await grade(reply, label);
      expect(result.pass).toBe(pass);
      for (const [name, value] of Object.entries(result.namedScores!)) {
        totals[name] = (totals[name] ?? 0) + value;
      }
    }
    expect(totals).toEqual({ false_claims: 3, caught: 2, miss: 1, true_claims: 2, false_flag: 1 });
    expect(derive(totals)).toMatchObject({ recall: 2 / 3, false_flag_rate: 0.5 });
  });

  it('reads the last LABEL line and treats a reply without one as no answer', async () => {
    const last = await grade('LABEL: verified\nOn reflection:\nLABEL: tampered', 'tampered');
    expect(last.pass).toBe(true);
    const none = await grade('I cannot decide.', 'fabricated');
    expect(none.pass).toBe(false);
    expect(none.reason).toBe('Expected fabricated, judge said no-answer');
    expect(none.namedScores).toMatchObject({ miss: 1, caught: 0 });
  });

  it('replays the recorded reply for the prompt version', async () => {
    const RecordedJudge = (await import(path.join(exampleDir, 'recordedJudge.js'))).default;
    const judge = new RecordedJudge({});
    const vars = { recorded_v1: 'LABEL: verified', recorded_v5: 'LABEL: unsupported' };
    const label = 'judge-v5: examples/eval-judge-calibration/prompts/judge-v5.txt: An unattended';
    await expect(judge.callApi('', { prompt: { label }, vars })).resolves.toEqual({
      output: 'LABEL: unsupported',
    });
    await expect(judge.callApi('', { prompt: { label: 'other' }, vars })).resolves.toHaveProperty(
      'error',
    );
  });
});
