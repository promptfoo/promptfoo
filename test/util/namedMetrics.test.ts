import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import {
  accumulateNamedMetrics,
  backfillNamedScoreWeights,
  markNamedMetricsSeededFromPreviousRun,
  type NamedMetricAccumulator,
  renderPersistedMetricName,
  wereNamedMetricsSeededFromPreviousRun,
} from '../../src/util/namedMetrics';
import { mockProcessEnv } from './utils';

describe('accumulateNamedMetrics', () => {
  it.each([false, true])(
    'limits cumulative expansion without losing scores or stored weights (weighted=%s)',
    (weighted) => {
      const longKey = 'k'.repeat(8196);
      const namedScores = { quality: 0.25, [longKey]: 0.5 };
      const weights = { quality: 4, [longKey]: 2 };
      const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      accumulateNamedMetrics(metrics, {
        namedScores,
        testVars: { value: 'x'.repeat(8192) },
        gradingResult: {
          ...(weighted && { namedScoreWeights: weights }),
          componentResults: [
            'quality',
            'quality',
            ...Array.from({ length: 32 }, (_, index) => `${index}:{{ value }}`),
          ].map((metric) => ({ assertion: { metric } })),
        },
      });
      expect(metrics).toEqual({
        namedScores: weighted ? { quality: 1, [longKey]: 1 } : namedScores,
        namedScoresCount: {},
        namedScoreWeights: weighted ? weights : {},
      });
    },
  );

  it('counts repeated long templates and ordinary aliases without exhausting the allowance', () => {
    for (const [name, templates, testVars] of [
      [
        'quality',
        ['{{a}}', '{{b}}', '{{c}}', '{{d}}', '{{ a }}', '{{a }}'],
        { a: 'quality', b: 'quality', c: 'quality', d: 'quality' },
      ],
      ['q'.repeat(8192), Array.from({ length: 64 }, () => '{{m}}'), { m: 'q'.repeat(8192) }],
    ] as const) {
      const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      accumulateNamedMetrics(metrics, {
        namedScores: { [name]: templates.length },
        testVars,
        gradingResult: {
          componentResults: templates.map((metric) => ({ assertion: { metric } })),
        },
      });
      expect(metrics).toEqual({
        namedScores: { [name]: templates.length },
        namedScoresCount: { [name]: templates.length },
        namedScoreWeights: { [name]: templates.length },
      });
    }
  });

  it('bounds individual and cumulative persisted metric expansion within a small heap', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        String.raw`
          import assert from 'node:assert/strict';
          import { accumulateNamedMetrics } from './src/util/namedMetrics.ts';
          const longKey = 'k'.repeat(1024 * 1024 + 4);
          for (const [value, names, namedScores, countsKnown] of [
            ['x'.repeat(1024 * 1024), ['{{ value }}'.repeat(256)], { quality: 2 }, true],
            ['x'.repeat(128 * 1024), Array.from({ length: 192 }, (_, i) =>
              i + ':' + '{{ value }}'.repeat(8)), { quality: 2, [longKey]: 1 }, false],
          ]) {
            const metrics = { namedScores: {}, namedScoresCount: {} };
            accumulateNamedMetrics(metrics, {
              namedScores,
              testVars: { value },
              gradingResult: { componentResults: [...names, 'quality', 'quality'].map(metric =>
                ({ assertion: { metric } })) },
            });
            assert.deepEqual(metrics.namedScores, namedScores);
            assert.deepEqual(metrics.namedScoresCount, countsKnown ? namedScores : {});
            assert.deepEqual(metrics.namedScoreWeights, countsKnown ? namedScores : {});
          }
        `,
      ],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, PROMPTFOO_DISABLE_TEMPLATING: 'false' },
        timeout: 20_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it.each(['{{ env.SECRET }}', '{{ accessor }}', '{{ value | upper }}'])(
    'preserves unresolved and literal semantics after an oversized prefix: %s',
    (suffix) => {
      const metric = '{{ value }}'.repeat(8) + suffix;
      const accessor = vi.fn(() => 'secret');
      const testVars = Object.defineProperty({ value: 'x'.repeat(20) }, 'accessor', {
        get: accessor,
      });
      const componentResults = [
        { assertion: { metric } },
        { assertion: { metric } },
        { assertion: { metric: 'quality' } },
      ];
      const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      accumulateNamedMetrics(metrics, {
        namedScores: { quality: 0.5 },
        testVars,
        gradingResult: { componentResults, namedScoreWeights: { quality: 3 } },
      });
      expect(metrics).toEqual({
        namedScores: { quality: 1.5 },
        namedScoresCount: {},
        namedScoreWeights: { quality: 3 },
      });

      const literal: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      accumulateNamedMetrics(literal, {
        namedScores: { [metric]: 2 },
        testVars,
        gradingResult: { componentResults },
      });
      expect(literal.namedScoresCount).toEqual({ [metric]: 2 });
      expect(literal.namedScoreWeights).toEqual({ [metric]: 2 });
      expect(accessor).not.toHaveBeenCalled();
    },
  );

  it('counts literal score keys when templating is disabled', () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_TEMPLATING: 'true' });
    try {
      const metric = '{{ value }}{{ value }}';
      const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      accumulateNamedMetrics(metrics, {
        namedScores: { [metric]: 2 },
        testVars: { value: 'x'.repeat(100) },
        gradingResult: {
          componentResults: [{ assertion: { metric } }, { assertion: { metric } }],
        },
      });
      expect(metrics.namedScoresCount).toEqual({ [metric]: 2 });
      expect(metrics.namedScoreWeights).toEqual({ [metric]: 2 });
    } finally {
      restoreEnv();
    }
  });

  it('excludes deferred comparisons from legacy metric counts and weights', () => {
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    accumulateNamedMetrics(metrics, {
      namedScores: { quality: 2 },
      gradingResult: {
        componentResults: [
          { assertion: { type: 'contains', metric: 'quality' } },
          { assertion: { type: 'equals', metric: 'quality' } },
          { assertion: { type: 'select-best', metric: 'quality' } },
          { assertion: { type: 'max-score', metric: '{{ unrelated | lower }}' } },
        ],
      },
    });
    expect(metrics).toEqual({
      namedScores: { quality: 2 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 2 },
    });
  });

  it.each([
    ['true', 'true'],
    ['false', 'false'],
    ['none', ''],
    ['null', ''],
  ])('recovers repeated legacy assertions named with the %s literal', (literal, value) => {
    const metric = `quality:{{ ${literal} }}`;
    const name = `quality:${value}`;
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    accumulateNamedMetrics(metrics, {
      namedScores: { [name]: 2 },
      testVars: { [literal]: 'shadowed' },
      gradingResult: {
        componentResults: [{ assertion: { metric } }, { assertion: { metric } }],
      },
    });
    expect(metrics).toEqual({
      namedScores: { [name]: 2 },
      namedScoresCount: { [name]: 2 },
      namedScoreWeights: { [name]: 2 },
    });
  });

  const legacyComplexResult = {
    namedScores: { quality: 2 },
    testVars: { name: 'quality' },
    gradingResult: {
      componentResults: [
        { assertion: { metric: 'quality' } },
        { assertion: { metric: '{{ name | lower }}' } },
      ],
    },
  };

  it('retains legacy scores without claiming partially resolved counts as denominators', () => {
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    accumulateNamedMetrics(metrics, legacyComplexResult);
    expect(metrics).toEqual({
      namedScores: { quality: 2 },
      namedScoresCount: {},
      namedScoreWeights: {},
    });
  });

  it('keeps stored weights authoritative when legacy assertion counts are unavailable', () => {
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    accumulateNamedMetrics(metrics, {
      ...legacyComplexResult,
      namedScores: { quality: 0.75 },
      gradingResult: { ...legacyComplexResult.gradingResult, namedScoreWeights: { quality: 4 } },
    });
    expect(metrics).toEqual({
      namedScores: { quality: 3 },
      namedScoresCount: {},
      namedScoreWeights: { quality: 4 },
    });
  });

  it.each([false, true])(
    'keeps unknown denominators unavailable across row order (legacy first=%s)',
    (legacyFirst) => {
      const known = {
        namedScores: { quality: 1 },
        gradingResult: {
          namedScoreWeights: { quality: 2 },
          componentResults: [
            { assertion: { metric: 'quality' } },
            { assertion: { metric: 'quality' } },
          ],
        },
      };
      const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
      for (const result of legacyFirst
        ? [legacyComplexResult, known]
        : [known, legacyComplexResult]) {
        accumulateNamedMetrics(metrics, result);
      }
      expect(metrics).toEqual({
        namedScores: { quality: 4 },
        namedScoresCount: {},
        namedScoreWeights: {},
      });
    },
  );

  it('uses literal template names when they are actual score keys', () => {
    const metric = '{{ name | lower }}';
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    accumulateNamedMetrics(metrics, {
      namedScores: { [metric]: 2 },
      gradingResult: { componentResults: [{ assertion: { metric } }, { assertion: { metric } }] },
    });
    expect(metrics.namedScoresCount).toEqual({ [metric]: 2 });
    expect(metrics.namedScoreWeights).toEqual({ [metric]: 2 });
  });

  it('retains known legacy seed counts when the weight map is missing', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: { quality: 2 },
      namedScoresCount: { quality: 2 },
    };
    accumulateNamedMetrics(metrics, { namedScores: { quality: 1 }, gradingResult: undefined });
    expect(metrics).toEqual({
      namedScores: { quality: 3 },
      namedScoresCount: { quality: 3 },
      namedScoreWeights: { quality: 3 },
    });
  });

  it('renders each component once when a result contributes to multiple metrics', () => {
    const metrics: NamedMetricAccumulator = { namedScores: {}, namedScoresCount: {} };
    const render = vi.fn((metric) => metric);
    accumulateNamedMetrics(
      metrics,
      {
        namedScores: { accuracy: 1.5, relevance: 0.5 },
        gradingResult: {
          componentResults: [
            { assertion: { metric: 'accuracy' } },
            { assertion: { metric: 'accuracy' } },
            { assertion: { metric: 'relevance' } },
          ],
        },
      },
      render,
    );
    expect(metrics.namedScoresCount).toEqual({ accuracy: 2, relevance: 1 });
    expect(metrics.namedScoreWeights).toEqual({ accuracy: 2, relevance: 1 });
    expect(render).toHaveBeenCalledTimes(3);
  });
  it('preserves weighted totals from grading results while keeping assertion counts', () => {
    const metrics = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetrics(metrics, {
      namedScores: { ['accuracy']: 0.75 },
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

    accumulateNamedMetrics(metrics, {
      namedScores: { ['accuracy:alpha']: 0.8 },
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

    accumulateNamedMetrics(metrics, {
      namedScores: { ['accuracy']: 0.8 },
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

  it.each(['constructor', 'toString', '__proto__'])(
    'stores prototype-colliding metric name %s as an own numeric property',
    (metricName) => {
      const metrics: NamedMetricAccumulator = {
        namedScores: {},
        namedScoresCount: {},
        namedScoreWeights: {},
      };

      accumulateNamedMetrics(metrics, {
        namedScores: { [metricName]: 0.8 },
        gradingResult: undefined,
      });
      accumulateNamedMetrics(metrics, {
        namedScores: { [metricName]: 0.8 },
        gradingResult: undefined,
      });

      expect(Object.prototype.hasOwnProperty.call(metrics.namedScores, metricName)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(metrics.namedScoresCount, metricName)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(metrics.namedScoreWeights, metricName)).toBe(
        true,
      );
      expect(metrics.namedScores[metricName]).toBe(1.6);
      expect(metrics.namedScoresCount[metricName]).toBe(2);
      expect(metrics.namedScoreWeights?.[metricName]).toBe(2);
    },
  );

  it.each([null, '2', Number.NaN, Number.POSITIVE_INFINITY])(
    'treats invalid stored weight %s as an unweighted contribution',
    (invalidWeight) => {
      const metrics: NamedMetricAccumulator = {
        namedScores: {},
        namedScoresCount: {},
        namedScoreWeights: {},
      };

      accumulateNamedMetrics(metrics, {
        namedScores: { ['accuracy']: 0.8 },
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
    },
  );

  it('preserves a finite zero stored weight', () => {
    const metrics: NamedMetricAccumulator = {
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    };

    accumulateNamedMetrics(metrics, {
      namedScores: { ['accuracy']: 0.8 },
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

    accumulateNamedMetrics(metrics, {
      namedScores: { ['huge']: 1e308 },
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

    accumulateNamedMetrics(metrics, {
      namedScores: { ['huge']: 1e308 },
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

    accumulateNamedMetrics(
      metrics,
      {
        namedScores: { ['accuracy:alpha']: 0.8 },
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
  it.each([
    ['{{ value }}{{ value }}', { value: 'ab' }, 4, 'abab'],
    ['{{ value }}{{ value }}', { value: 'ab' }, 3, undefined],
    ['{{ value }}' + '{{ missing }}'.repeat(100), { value: 'quality' }, 7, 'quality'],
    ['{{ missing }}', {}, 0, ''],
  ])(
    'measures the complete expansion before applying the limit: %s',
    (metric, vars, limit, name) => {
      expect(renderPersistedMetricName(metric, vars, limit)).toBe(name);
    },
  );

  it.each([
    ['true', 'true'],
    ['false', 'false'],
    ['none', ''],
    ['null', ''],
  ])('renders the %s literal before looking up variables', (literal, value) => {
    expect(renderPersistedMetricName(`quality:{{ ${literal} }}`, {})).toBe(`quality:${value}`);
    expect(renderPersistedMetricName(`quality:{{ ${literal} }}`, { [literal]: 'shadowed' })).toBe(
      `quality:${value}`,
    );
    const dotted = `quality:{{ ${literal}.name }}`;
    expect(renderPersistedMetricName(dotted, { [literal]: { name: 'shadowed' } })).toBe(dotted);
  });

  it('renders root and dotted own-data primitive placeholders', () => {
    expect(
      renderPersistedMetricName(
        'score:{{ label }}:{{ category.name }}:{{ category.rank }}:{{ enabled }}:{{ missing }}',
        {
          label: 'alpha',
          category: { name: 'science', rank: 2 },
          enabled: false,
        },
      ),
    ).toBe('score:alpha:science:2:false:');
  });

  it.each([
    ['missing', {}],
    ['null', { category: null }],
    ['undefined', { category: undefined }],
  ])('renders a %s intermediate path as empty', (_label, vars) => {
    expect(renderPersistedMetricName('score:{{ category.name }}', vars)).toBe('score:');
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

  it('does not invoke nested accessors or traverse inherited and reserved paths', () => {
    let accessorCalls = 0;
    const category = Object.create({ inherited: 'secret' }) as Record<string, unknown>;
    Object.defineProperty(category, 'accessor', {
      enumerable: true,
      get: () => {
        accessorCalls++;
        return 'secret';
      },
    });

    expect(renderPersistedMetricName('score:{{ category.accessor }}', { category })).toBe(
      'score:{{ category.accessor }}',
    );
    expect(renderPersistedMetricName('score:{{ category.inherited }}', { category })).toBe(
      'score:',
    );
    expect(renderPersistedMetricName('score:{{ category.constructor.name }}', { category })).toBe(
      'score:{{ category.constructor.name }}',
    );
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

describe('namedMetricsSeededFromPreviousRun', () => {
  it('marks the exact object it is given and returns it', () => {
    const metrics = { namedScores: {}, namedScoresCount: {}, namedScoreWeights: {} };

    expect(markNamedMetricsSeededFromPreviousRun(metrics)).toBe(metrics);
    expect(wereNamedMetricsSeededFromPreviousRun(metrics)).toBe(true);
  });

  it('does not treat copies or unrelated values as seeded', () => {
    const metrics = markNamedMetricsSeededFromPreviousRun({
      namedScores: { quality: 3 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 4 },
    });

    expect(wereNamedMetricsSeededFromPreviousRun({ ...metrics })).toBe(false);
    expect(wereNamedMetricsSeededFromPreviousRun(structuredClone(metrics))).toBe(false);
    expect(wereNamedMetricsSeededFromPreviousRun(undefined)).toBe(false);
    expect(wereNamedMetricsSeededFromPreviousRun(null)).toBe(false);
    expect(wereNamedMetricsSeededFromPreviousRun('metrics')).toBe(false);
  });

  it('keeps the marker off the serialized payload', () => {
    const metrics = markNamedMetricsSeededFromPreviousRun({
      namedScores: { quality: 3 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 4 },
    });

    expect(Object.keys(metrics)).toEqual(['namedScores', 'namedScoresCount', 'namedScoreWeights']);
    expect(JSON.parse(JSON.stringify(metrics))).toEqual({
      namedScores: { quality: 3 },
      namedScoresCount: { quality: 2 },
      namedScoreWeights: { quality: 4 },
    });
  });
});
