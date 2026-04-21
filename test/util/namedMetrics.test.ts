import { describe, expect, it } from 'vitest';
import { accumulateNamedMetric, backfillNamedScoreWeights } from '../../src/util/namedMetrics';

describe('accumulateNamedMetric', () => {
  it('preserves weighted totals from grading results while keeping assertion counts', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.75,
      gradingResult: {
        pass: false,
        score: 0.75,
        reason: 'weighted metric',
        namedScoreWeights: { accuracy: 4 },
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'critical passed',
            assertion: { type: 'contains', value: 'critical', metric: 'accuracy' },
          },
          {
            pass: false,
            score: 0,
            reason: 'optional failed',
            assertion: { type: 'contains', value: 'missing', metric: 'accuracy' },
          },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 3 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: 4 },
    });
  });

  it('falls back to rendered assertion counts when stored weights are absent', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy:alpha',
      metricValue: 0.8,
      testVars: { suffix: 'alpha' },
      gradingResult: {
        pass: true,
        score: 0.8,
        reason: 'templated metric',
        componentResults: [
          {
            pass: true,
            score: 0.8,
            reason: 'templated metric',
            assertion: { type: 'contains', value: 'alpha', metric: 'accuracy:{{ suffix }}' },
          },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { 'accuracy:alpha': 0.8 },
      namedScoresCount: { 'accuracy:alpha': 1 },
      namedScoreWeights: { 'accuracy:alpha': 1 },
    });
  });
});

describe('backfillNamedScoreWeights', () => {
  it('fills missing weights from assertion counts without overwriting existing weights', () => {
    const metrics = {
      namedScores: { accuracy: 1.6, safety: 0.8 },
      namedScoresCount: { accuracy: 2, safety: 1 },
      namedScoreWeights: { accuracy: 4 },
    };

    backfillNamedScoreWeights(metrics);

    expect(metrics).toEqual({
      namedScores: { accuracy: 1.6, safety: 0.8 },
      namedScoresCount: { accuracy: 2, safety: 1 },
      namedScoreWeights: { accuracy: 4, safety: 1 },
    });
  });

  it('initializes missing weights from assertion counts for legacy metrics', () => {
    const metrics = {
      namedScores: { accuracy: 1.6 },
      namedScoresCount: { accuracy: 2 },
    };

    backfillNamedScoreWeights(metrics);

    expect(metrics).toEqual({
      namedScores: { accuracy: 1.6 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: 2 },
    });
  });
});
