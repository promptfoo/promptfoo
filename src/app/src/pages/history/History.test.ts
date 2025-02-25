import { describe, it, expect } from 'vitest';

describe('History component utils', () => {
  const calculatePassRate = (
    metrics: { testPassCount: number; testFailCount: number } | undefined,
  ) => {
    if (metrics?.testPassCount != null && metrics?.testFailCount != null) {
      return (
        (metrics.testPassCount / (metrics.testPassCount + metrics.testFailCount)) *
        100
      ).toFixed(2);
    }
    return '-';
  };

  describe('calculatePassRate', () => {
    it('should calculate pass rate correctly', () => {
      expect(calculatePassRate({ testPassCount: 8, testFailCount: 2 })).toBe('80.00');
      expect(calculatePassRate({ testPassCount: 0, testFailCount: 10 })).toBe('0.00');
      expect(calculatePassRate({ testPassCount: 10, testFailCount: 0 })).toBe('100.00');
    });

    it('should return "-" for undefined metrics', () => {
      expect(calculatePassRate(undefined)).toBe('-');
    });
  });

  describe('convertToCSV', () => {
    const convertToCSV = (arr: any[]) => {
      const headers = [
        'Eval',
        'Dataset',
        'Provider',
        'Prompt',
        'Pass Rate %',
        'Pass Count',
        'Fail Count',
        'Raw score',
      ];
      const rows = arr.map((col) => [
        col.evalId ?? '',
        col.datasetId?.slice(0, 6) ?? '',
        col.provider ?? '',
        (col.promptId?.slice(0, 6) ?? '') + ' ' + (col.raw ?? ''),
        calculatePassRate(col.metrics),
        col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`,
        col.metrics?.testFailCount == null ? '-' : `${col.metrics.testFailCount}`,
        col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2),
      ]);
      return [headers]
        .concat(rows)
        .map((it) => it.map((value) => value ?? '').join(','))
        .join('\n');
    };

    it('should convert data to CSV format', () => {
      const testData = [
        {
          evalId: 'eval1',
          datasetId: 'dataset1',
          provider: 'provider1',
          promptId: 'prompt1',
          raw: 'test prompt',
          label: 'test label',
          description: null,
          isRedteam: false,
          createdAt: Date.now(),
          pluginFailCount: {},
          pluginPassCount: {},
          metrics: {
            testPassCount: 8,
            testFailCount: 2,
            testErrorCount: 1,
            cost: 0,
            score: 0.8,
            assertPassCount: 0,
            assertFailCount: 0,
            totalLatencyMs: 0,
            tokenUsage: {},
            namedScores: {},
            namedScoresCount: {},
          },
        },
      ];

      const expected =
        'Eval,Dataset,Provider,Prompt,Pass Rate %,Pass Count,Fail Count,Raw score\n' +
        'eval1,datase,provider1,prompt test prompt,80.00,8,2,0.80';

      expect(convertToCSV(testData)).toBe(expected);
    });

    it('should handle empty data', () => {
      const expected = 'Eval,Dataset,Provider,Prompt,Pass Rate %,Pass Count,Fail Count,Raw score';
      expect(convertToCSV([])).toBe(expected);
    });

    it('should handle missing data fields', () => {
      const testData = [
        {
          evalId: '',
          datasetId: '',
          provider: '',
          promptId: '',
          raw: '',
          label: '',
          description: null,
          isRedteam: false,
          createdAt: 0,
          pluginFailCount: {},
          pluginPassCount: {},
          metrics: undefined,
        },
      ];

      const expected =
        'Eval,Dataset,Provider,Prompt,Pass Rate %,Pass Count,Fail Count,Raw score\n' +
        ',,, ,-,-,-,-';

      expect(convertToCSV(testData)).toBe(expected);
    });
  });

  describe('getSortedValues', () => {
    const getSortedValues = (sortOrder: string, a: number, b: number): number => {
      return sortOrder === 'asc' ? a - b : b - a;
    };

    it('should sort values in ascending order', () => {
      expect(getSortedValues('asc', 1, 2)).toBe(-1);
      expect(getSortedValues('asc', 2, 1)).toBe(1);
      expect(getSortedValues('asc', 1, 1)).toBe(0);
    });

    it('should sort values in descending order', () => {
      expect(getSortedValues('desc', 1, 2)).toBe(1);
      expect(getSortedValues('desc', 2, 1)).toBe(-1);
      expect(getSortedValues('desc', 1, 1)).toBe(0);
    });
  });

  describe('getValue', () => {
    const getValue = (metrics: any | undefined, sortField: string): number => {
      if (metrics && sortField in metrics) {
        return metrics[sortField] as number;
      }
      return 0;
    };

    it('should get value from metrics object', () => {
      const metrics = {
        testPassCount: 10,
        testFailCount: 5,
      };

      expect(getValue(metrics, 'testPassCount')).toBe(10);
      expect(getValue(metrics, 'testFailCount')).toBe(5);
    });

    it('should return 0 for undefined metrics', () => {
      expect(getValue(undefined, 'testPassCount')).toBe(0);
    });

    it('should return 0 for non-existent field', () => {
      const metrics = {
        testPassCount: 10,
      };
      expect(getValue(metrics, 'nonExistentField')).toBe(0);
    });
  });
});
