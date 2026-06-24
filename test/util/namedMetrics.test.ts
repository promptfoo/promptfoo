import { describe, expect, it } from 'vitest';
import {
  accumulateNamedMetric,
  backfillNamedScoreWeights,
  type NamedMetricAccumulator,
  renderPersistedMetricName,
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

  it.each([
    null,
    '2',
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('treats invalid stored weight %s as an unweighted contribution', (invalidWeight) => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.8,
      gradingResult: {
        namedScoreWeights: { accuracy: invalidWeight },
        componentResults: [
          { assertion: { metric: 'accuracy' } },
          { assertion: { metric: 'accuracy' } },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 0.8 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: 2 },
    });
  });

  it('preserves a finite zero stored weight', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.8,
      gradingResult: {
        namedScoreWeights: { accuracy: 0 },
        componentResults: [
          { assertion: { metric: 'accuracy' } },
          { assertion: { metric: 'accuracy' } },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 0 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: 0 },
    });
  });

  it('falls back to an unweighted contribution when score times weight overflows', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'huge',
      metricValue: 1e308,
      gradingResult: { namedScoreWeights: { huge: 1e308 } },
    });

    expect(metrics).toEqual({
      namedScores: { huge: 1e308 },
      namedScoresCount: { huge: 1 },
      namedScoreWeights: { huge: 1 },
    });
  });

  it('skips an entire contribution when an aggregate would become non-finite', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: { huge: 1e308 },
      namedScoresCount: { huge: 1 },
      namedScoreWeights: { huge: 1 },
    };

    accumulateNamedMetric(metrics, {
      metricName: 'huge',
      metricValue: 1e308,
      gradingResult: undefined,
    });

    expect(metrics).toEqual({
      namedScores: { huge: 1e308 },
      namedScoresCount: { huge: 1 },
      namedScoreWeights: { huge: 1 },
    });
  });

  it('accepts the live assertion renderer explicitly without using it for persisted reads', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };
    const renderLiveMetric = (metric: string | undefined) =>
      metric === 'accuracy:{% if suffix %}alpha{% endif %}' ? 'accuracy:alpha' : metric;

    accumulateNamedMetric(
      metrics,
      {
        metricName: 'accuracy:alpha',
        metricValue: 0.8,
        gradingResult: {
          componentResults: [
            { assertion: { metric: 'accuracy:{% if suffix %}alpha{% endif %}' } },
            { assertion: { metric: 'accuracy:{% if suffix %}alpha{% endif %}' } },
          ],
        },
        testVars: { suffix: true },
      },
      renderLiveMetric,
    );

    expect(metrics.namedScoresCount['accuracy:alpha']).toBe(2);
  });
});

describe('renderPersistedMetricName', () => {
  it('renders only simple root primitive placeholders', () => {
    expect(
      renderPersistedMetricName('score:{{ label }}:{{ count }}:{{ enabled }}:{{ missing }}', {
        label: 'alpha',
        count: 2,
        enabled: false,
      }),
    ).toBe('score:alpha:2:false:');
  });

  it.each([
    'score:{{ env.SECRET }}',
    'score:{{ value | upper }}',
    'score:{% if enabled %}yes{% endif %}',
    'score:{# comment #}',
  ])('leaves executable or complex persisted syntax literal: %s', (metric) => {
    expect(renderPersistedMetricName(metric, { enabled: true, value: 'secret' })).toBe(metric);
  });

  it('does not invoke accessors or read inherited values', () => {
    let accessorCalls = 0;
    const vars = Object.create({ inherited: 'secret' }) as Record<string, unknown>;
    Object.defineProperty(vars, 'accessor', {
      enumerable: true,
      get: () => {
        accessorCalls++;
        return 'secret';
      },
    });

    expect(renderPersistedMetricName('score:{{ accessor }}', vars)).toBe('score:{{ accessor }}');
    expect(renderPersistedMetricName('score:{{ inherited }}', vars)).toBe('score:');
    expect(accessorCalls).toBe(0);
  });

  it('does not recursively render placeholder text from a variable', () => {
    expect(renderPersistedMetricName('score:{{ value }}', { value: '{{ secret }}' })).toBe(
      'score:{{ secret }}',
    );
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

  it('repairs invalid legacy weights from finite assertion counts', () => {
    const metrics = {
      namedScores: { accuracy: 1.6 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: Number.NaN },
    };

    backfillNamedScoreWeights(metrics);

    expect(metrics.namedScoreWeights).toEqual({ accuracy: 2 });
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
