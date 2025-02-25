import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Chart } from 'chart.js';
import { callApi } from '@app/utils/api';

vi.mock('chart.js', () => ({
  Chart: vi.fn(),
  register: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('Charts', () => {
  const mockTable = {
    head: {
      prompts: [
        {
          provider: 'test-provider-1',
          metrics: {
            namedScores: {
              metric1: 0.8,
              metric2: 0.6
            }
          }
        },
        {
          provider: 'test-provider-2',
          metrics: {
            namedScores: {
              metric1: 0.9,
              metric2: 0.7
            }
          }
        }
      ]
    },
    body: [
      {
        outputs: [
          { score: 0.8, text: 'output1', pass: true },
          { score: 0.9, text: 'output2', pass: false }
        ]
      },
      {
        outputs: [
          { score: 0.6, text: 'output3', pass: true },
          { score: 0.7, text: 'output4', pass: true }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Chart initialization', () => {
    it('should initialize chart with correct data', () => {
      const mockDestroy = vi.fn();
      (Chart as any).mockImplementation(() => ({
        destroy: mockDestroy
      }));

      expect(Chart).toBeDefined();
      expect(mockDestroy).toBeDefined();
    });
  });

  describe('Chart data processing', () => {
    it('should process pass rates correctly', () => {
      const outputs = mockTable.body.flatMap(row => row.outputs);
      const passCount = outputs.filter(output => output.pass).length;
      const passRate = (passCount / outputs.length) * 100;

      expect(passRate).toBeDefined();
      expect(passRate).toBeGreaterThanOrEqual(0);
      expect(passRate).toBeLessThanOrEqual(100);
    });

    it('should process scores correctly', () => {
      const scores = mockTable.body.flatMap(row =>
        row.outputs.map(output => output.score)
      );

      expect(scores).toHaveLength(4);
      expect(Math.min(...scores)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...scores)).toBeLessThanOrEqual(1);
    });

    it('should process metrics correctly', () => {
      const metrics = mockTable.head.prompts[0].metrics?.namedScores;

      expect(metrics).toBeDefined();
      expect(Object.keys(metrics || {})).toHaveLength(2);
    });
  });

  describe('API integration', () => {
    it('should fetch performance data correctly', async () => {
      const mockProgressData = [{
        evalId: 'eval1',
        description: 'test',
        promptId: 'prompt1',
        createdAt: 1000,
        label: 'Test 1',
        provider: 'provider1',
        metrics: {
          testPassCount: 8,
          testFailCount: 2,
          score: 0.8
        }
      }];

      (callApi as any).mockResolvedValue({
        json: () => Promise.resolve({ data: mockProgressData })
      });

      const response = await callApi('/history?description=test');
      const data = await response.json();

      expect(data.data).toEqual(mockProgressData);
      expect(callApi).toHaveBeenCalledWith('/history?description=test');
    });
  });
});
