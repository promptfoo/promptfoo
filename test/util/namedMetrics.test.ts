import { describe, expect, it } from 'vitest';
import { accumulateNamedMetric, backfillNamedScoreWeights } from '../../src/util/namedMetrics';

describe('accumulateNamedMetric', () => {
  it.each(['constructor', 'toString', '__proto__'])(
    'accumulates own metric %s without inherited values',
    (metricName) => {
      const metrics = { namedScores: {}, namedScoresCount: {}, namedScoreWeights: {} };
      for (const metricValue of [0.25, 0.75]) {
        accumulateNamedMetric(metrics, {
          metricName,
          metricValue,
          gradingResult: {
            pass: true,
            score: metricValue,
            reason: 'fixture',
            namedScoreWeights: Object.fromEntries([[metricName, 2]]),
          },
        });
      }
      expect(metrics).toEqual({
        namedScores: Object.fromEntries([[metricName, 2]]),
        namedScoresCount: Object.fromEntries([[metricName, 2]]),
        namedScoreWeights: Object.fromEntries([[metricName, 4]]),
      });
      for (const record of Object.values(metrics)) {
        expect(Object.hasOwn(record, metricName)).toBe(true);
        expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
      }
      expect(JSON.parse(JSON.stringify(metrics))).toEqual(metrics);
    },
  );

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
  it.each(['constructor', 'toString', '__proto__'])(
    'backfills own weights for %s and preserves zero',
    (metricName) => {
      const metrics = {
        namedScores: Object.fromEntries([[metricName, 1]]),
        namedScoresCount: Object.fromEntries([[metricName, 2]]),
        namedScoreWeights: {},
      };
      backfillNamedScoreWeights(metrics);
      expect(metrics.namedScoreWeights).toEqual(Object.fromEntries([[metricName, 2]]));
      expect(Object.getPrototypeOf(metrics.namedScoreWeights)).toBe(Object.prototype);
      metrics.namedScoreWeights = Object.fromEntries([[metricName, 0]]);
      backfillNamedScoreWeights(metrics);
      expect(metrics.namedScoreWeights).toEqual(Object.fromEntries([[metricName, 0]]));
    },
  );

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
