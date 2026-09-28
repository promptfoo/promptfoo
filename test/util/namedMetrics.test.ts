import { describe, expect, it } from 'vitest';
import { AssertionsResult } from '../../src/assertions/assertionsResult';
import {
  accumulateNamedMetric,
  backfillNamedScoreWeights,
  getNamedMetricContribution,
  subtractNamedMetric,
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

  it('falls back to assertion counts when stored weights are malformed', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.75,
      gradingResult: {
        pass: true,
        score: 0.75,
        reason: 'imported malformed metric weight',
        namedScoreWeights: { accuracy: 'bad' } as any,
        componentResults: [
          {
            pass: true,
            score: 0.75,
            reason: 'metric assertion',
            assertion: { type: 'contains', value: 'ok', metric: 'accuracy' },
          },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 0.75 },
      namedScoresCount: { accuracy: 1 },
      namedScoreWeights: { accuracy: 1 },
    });
  });

  it('counts resolved assertion identities when stored weights are absent', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetric(metrics, {
      metricName: 'accuracy:alpha',
      metricValue: 0.8,
      gradingResult: {
        pass: true,
        score: 0.8,
        reason: 'templated metric',
        componentResults: Array.from({ length: 2 }, () => ({
          pass: true,
          score: 0.8,
          reason: 'templated metric',
          assertion: { type: 'contains' as const, value: 'alpha', metric: 'accuracy:alpha' },
        })),
      },
    });

    expect(metrics).toEqual({
      namedScores: { 'accuracy:alpha': 0.8 },
      namedScoresCount: { 'accuracy:alpha': 2 },
      namedScoreWeights: { 'accuracy:alpha': 2 },
    });
  });
});

describe('getNamedMetricContribution', () => {
  it('treats missing components and unresolved templates as unavailable accounting', () => {
    const contribution = (
      gradingResult: Parameters<typeof getNamedMetricContribution>[0]['gradingResult'],
    ) => getNamedMetricContribution({ gradingResult, metricName: 'accuracy', metricValue: 1 });
    expect(contribution(null).namedScoresCount).toBeUndefined();
    expect(
      contribution({ pass: true, score: 1, reason: 'legacy' }).namedScoresCount,
    ).toBeUndefined();
    expect(
      contribution({
        pass: true,
        score: 1,
        reason: 'legacy',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'legacy',
            assertion: { type: 'contains', metric: '{{ env.METRIC }}' },
          },
        ],
      }).namedScoresCount,
    ).toBeUndefined();
  });

  it('keeps matching persisted names literal even when they contain template delimiters', () => {
    expect(
      getNamedMetricContribution({
        metricName: '{{ literal }}',
        metricValue: 1,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'literal',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'literal',
              assertion: { type: 'contains', metric: '{{ literal }}' },
            },
          ],
        },
      }).namedScoresCount,
    ).toBe(1);
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

describe('subtractNamedMetric', () => {
  it.each([false, true])(
    'reverses fresh fallback contributions after %s custom scoring replaces components',
    async (replaceComponents) => {
      const aggregation = new AssertionsResult({});
      aggregation.addResult({
        index: 0,
        result: {
          pass: true,
          score: 1,
          reason: 'No named scores until a later hook',
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Literal runtime metric',
              assertion: { type: 'javascript', metric: '{{ tag }}' },
            },
          ],
        },
      });
      const gradingResult = await aggregation.testResult(
        replaceComponents
          ? async () => ({
              pass: true,
              score: 1,
              reason: 'Replacement components',
              componentResults: null,
              metadata: { namedMetricCountsKnown: false },
            })
          : undefined,
      );
      const metrics = { namedScores: {}, namedScoresCount: {}, namedScoreWeights: {} };
      const contribution = { metricName: 'quality', metricValue: 1, gradingResult };
      accumulateNamedMetric(metrics, contribution);
      accumulateNamedMetric(metrics, contribution);
      subtractNamedMetric(metrics, contribution);
      expect(metrics).toEqual({
        namedScores: { quality: 1 },
        namedScoresCount: { quality: 1 },
        namedScoreWeights: { quality: 1 },
      });
    },
  );

  it('preserves an absent metric weight inside a tracked map', () => {
    const metrics = {
      namedScores: { quality: 2 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: {},
    };
    subtractNamedMetric(metrics, {
      metricName: 'quality',
      metricValue: 1,
      gradingResult: { pass: true, score: 1, reason: 'Imported score', componentResults: [] },
    });
    expect(metrics).toEqual({
      namedScores: { quality: 1 },
      namedScoresCount: { quality: 1 },
      namedScoreWeights: {},
    });
  });

  it('removes legacy metric keys after the final debit without creating count buckets', () => {
    const metrics = {
      namedScores: { accuracy: 1 },
    } as {
      namedScores: Record<string, number>;
      namedScoresCount?: Record<string, number>;
      namedScoreWeights?: Record<string, number>;
    };

    subtractNamedMetric(metrics as any, {
      metricName: 'accuracy',
      metricValue: 1,
      gradingResult: { pass: true, score: 1, reason: 'Legacy', componentResults: [] },
    });

    expect(metrics).toEqual({
      namedScores: {},
    });
  });

  it('preserves missing legacy count buckets when surviving rows still have the metric', () => {
    const metrics = {
      namedScores: { accuracy: 1.5 },
    } as {
      namedScores: Record<string, number>;
      namedScoresCount?: Record<string, number>;
      namedScoreWeights?: Record<string, number>;
    };

    subtractNamedMetric(metrics as any, {
      metricName: 'accuracy',
      metricValue: 0.5,
      gradingResult: { pass: true, score: 1, reason: 'Legacy', componentResults: [] },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 1 },
    });
  });

  it('preserves unavailable contributions when componentResults are malformed', () => {
    const metrics = {
      namedScores: { accuracy: 1 },
      namedScoresCount: { accuracy: 1 },
      namedScoreWeights: { accuracy: 1 },
    };

    subtractNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 1,
      gradingResult: {
        pass: true,
        score: 1,
        reason: 'malformed imported grading result',
        componentResults: 'not-an-array',
      } as any,
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 1 },
      namedScoresCount: { accuracy: 1 },
      namedScoreWeights: { accuracy: 1 },
    });
  });

  it('does not write non-finite values when stored weights are malformed', () => {
    const metrics = {
      namedScores: { accuracy: 1.5 },
      namedScoresCount: { accuracy: 2 },
      namedScoreWeights: { accuracy: 2 },
    };

    subtractNamedMetric(metrics, {
      metricName: 'accuracy',
      metricValue: 0.75,
      gradingResult: {
        pass: true,
        score: 0.75,
        reason: 'imported malformed metric weight',
        namedScoreWeights: { accuracy: 'bad' } as any,
        componentResults: [
          {
            pass: true,
            score: 0.75,
            reason: 'metric assertion',
            assertion: { type: 'contains', value: 'ok', metric: 'accuracy' },
          },
        ],
      },
    });

    expect(metrics).toEqual({
      namedScores: { accuracy: 0.75 },
      namedScoresCount: { accuracy: 1 },
      namedScoreWeights: { accuracy: 1 },
    });
  });
});
