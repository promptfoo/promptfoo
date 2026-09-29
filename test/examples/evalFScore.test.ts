import { readFileSync } from 'node:fs';
import path from 'node:path';

import { evaluate } from 'mathjs';
import { describe, expect, it } from 'vitest';
import yaml from 'yaml';
import { runAssertions } from '../../src/assertions';

import type { ApiProvider, AtomicTestCase, TestSuite } from '../../src/types';

const config = yaml.parse(
  readFileSync(path.resolve(__dirname, '../../examples/eval-f-score/promptfooconfig.yaml'), 'utf8'),
) as { defaultTest: AtomicTestCase; derivedMetrics: NonNullable<TestSuite['derivedMetrics']> };
const provider: ApiProvider = {
  id: () => 'f-score-example-test',
  callApi: async () => ({ output: '' }),
};

async function grade(predicted: string, expected: string) {
  return runAssertions({
    prompt: 'Classify a movie review',
    provider,
    providerResponse: { output: { sentiment: predicted } },
    test: { ...config.defaultTest, vars: { sentiment: expected } },
  });
}

function derive(namedScores: Record<string, number>) {
  const scores = { ...namedScores };
  for (const metric of config.derivedMetrics) {
    scores[metric.name] = evaluate(metric.value as string, scores);
  }
  return scores;
}

describe('F-score example metrics', () => {
  it('counts each confusion-matrix outcome without changing the accuracy grade', async () => {
    const totals: Record<string, number> = {};
    for (const [predicted, expected, counter] of [
      ['positive', 'positive', 'true_positives'],
      ['positive', 'negative', 'false_positives'],
      ['negative', 'positive', 'false_negatives'],
      ['negative', 'negative', 'true_negatives'],
    ]) {
      const result = await grade(predicted, expected);
      expect(result.pass).toBe(predicted === expected);
      // The only grades are valid JSON and classification accuracy.
      expect(result.score).toBe(predicted === expected ? 1 : 0.5);
      expect(result.namedScores).toEqual({
        accuracy: Number(predicted === expected),
        true_positives: Number(counter === 'true_positives'),
        false_positives: Number(counter === 'false_positives'),
        false_negatives: Number(counter === 'false_negatives'),
        true_negatives: Number(counter === 'true_negatives'),
      });
      for (const [name, value] of Object.entries(result.namedScores!)) {
        totals[name] = (totals[name] ?? 0) + value;
      }
    }
    expect(derive(totals)).toMatchObject({
      precision: 0.5,
      recall: 0.5,
      f1_score: 0.5,
      accuracy_score: 0.5,
    });
  });

  it('reports finite metrics for a correctly classified all-negative batch', async () => {
    const result = await grade('negative', 'negative');
    expect(result.pass).toBe(true);
    expect(derive(result.namedScores!)).toMatchObject({
      precision: 0,
      recall: 0,
      f1_score: 0,
      accuracy_score: 1,
    });
  });

  it('reports finite zero metrics for an unsupported sentiment', async () => {
    const result = await grade('neutral', 'positive');
    expect(result.pass).toBe(false);
    expect(derive(result.namedScores!)).toMatchObject({
      precision: 0,
      recall: 0,
      f1_score: 0,
      accuracy_score: 0,
    });
  });
});
