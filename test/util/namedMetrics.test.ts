import { describe, expect, it } from 'vitest';
import {
  accumulateNamedMetric,
  backfillNamedScoreWeights,
  type NamedMetricAccumulator,
} from '../../src/util/namedMetrics';

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

  it('falls back to one contribution when componentResults is malformed', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.8,
      gradingResult: {
        pass: false,
        score: 0.8,
        reason: 'malformed imported result',
        componentResults: {} as unknown as [],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 0.8 },
      namedScoresCount: { accuracy: 1 },
      namedScoreWeights: { accuracy: 1 },
    });
  });

  it.each([
    'constructor',
    'toString',
    '__proto__',
  ])('stores prototype-colliding metric name %s as an own numeric property', (metricName) => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName,
      metricValue: 0.8,
      gradingResult: undefined,
    });
    accumulateNamedMetric(metrics, {
      metricName,
      metricValue: 0.8,
      gradingResult: undefined,
    });

    expect(Object.prototype.hasOwnProperty.call(metrics.namedScores, metricName)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(metrics.namedScoresCount, metricName)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(metrics.namedScoreWeights, metricName)).toBe(true);
    expect(metrics.namedScores[metricName]).toBe(1.6);
    expect(metrics.namedScoresCount[metricName]).toBe(2);
    expect(metrics.namedScoreWeights?.[metricName]).toBe(2);
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

  it('backfills prototype-colliding metric names as own properties', () => {
    const namedScoresCount: Record<string, number> = {};
    Object.defineProperty(namedScoresCount, '__proto__', {
      configurable: true,
      enumerable: true,
      value: 2,
      writable: true,
    });
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount,
      namedScoreWeights: {},
    };

    backfillNamedScoreWeights(metrics);

    expect(Object.prototype.hasOwnProperty.call(metrics.namedScoreWeights, '__proto__')).toBe(true);
    expect(metrics.namedScoreWeights?.__proto__).toBe(2);
  });
});
