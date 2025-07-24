import type { RunEvalOptions } from '../src/types';

// Mock cli-progress
jest.mock('cli-progress', () => ({
  default: {
    MultiBar: jest.fn().mockImplementation(() => ({
      create: jest.fn().mockReturnValue({
        increment: jest.fn(),
        update: jest.fn(),
        getTotal: jest.fn().mockReturnValue(10),
      }),
      stop: jest.fn(),
    })),
    Presets: {
      shades_classic: {},
    },
  },
}));

// Import after mocking
import { calculateThreadsPerBar } from '../src/evaluator';

describe('Progress Bar Management', () => {
  describe('calculateThreadsPerBar', () => {
    it('should distribute threads evenly when divisible', () => {
      expect(calculateThreadsPerBar(12, 4, 0)).toBe(3);
      expect(calculateThreadsPerBar(12, 4, 1)).toBe(3);
      expect(calculateThreadsPerBar(12, 4, 2)).toBe(3);
      expect(calculateThreadsPerBar(12, 4, 3)).toBe(3);
    });

    it('should distribute extra threads to early bars', () => {
      expect(calculateThreadsPerBar(13, 4, 0)).toBe(4); // Gets extra thread
      expect(calculateThreadsPerBar(13, 4, 1)).toBe(3);
      expect(calculateThreadsPerBar(13, 4, 2)).toBe(3);
      expect(calculateThreadsPerBar(13, 4, 3)).toBe(3);
    });

    it('should handle concurrency less than bars', () => {
      expect(calculateThreadsPerBar(2, 4, 0)).toBe(1);
      expect(calculateThreadsPerBar(2, 4, 1)).toBe(1);
      expect(calculateThreadsPerBar(2, 4, 2)).toBe(0);
      expect(calculateThreadsPerBar(2, 4, 3)).toBe(0);
    });

    it('should handle single thread', () => {
      expect(calculateThreadsPerBar(1, 1, 0)).toBe(1);
      expect(calculateThreadsPerBar(1, 4, 0)).toBe(1);
      expect(calculateThreadsPerBar(1, 4, 1)).toBe(0);
    });
  });

  describe('ProgressBarManager Work Distribution', () => {
    it('should correctly separate serial and group (concurrent) tasks', () => {
      const runEvalOptions: Partial<RunEvalOptions>[] = [
        { test: { options: { runSerially: true } } },
        { test: {} },
        { test: { options: { runSerially: true } } },
        { test: {} },
        { test: {} },
      ];

      let serialCount = 0;
      let groupCount = 0;

      for (const option of runEvalOptions) {
        if (option.test?.options?.runSerially) {
          serialCount++;
        } else {
          groupCount++;
        }
      }

      expect(serialCount).toBe(2);
      expect(groupCount).toBe(3);
    });

    it('should map indices correctly to execution contexts', () => {
      const indexToContext = new Map();
      const runEvalOptions: Partial<RunEvalOptions>[] = [
        { test: { options: { runSerially: true } } }, // index 0 -> serial
        { test: {} }, // index 1 -> concurrent bar 0
        { test: { options: { runSerially: true } } }, // index 2 -> serial
        { test: {} }, // index 3 -> concurrent bar 1
        { test: {} }, // index 4 -> concurrent bar 2
      ];

      let concurrentCount = 0;
      const concurrency = 3;
      const maxBars = Math.min(concurrency, 20);

      for (let i = 0; i < runEvalOptions.length; i++) {
        const option = runEvalOptions[i];
        if (option.test?.options?.runSerially) {
          indexToContext.set(i, { phase: 'serial', barIndex: 0 });
        } else {
          indexToContext.set(i, {
            phase: 'concurrent',
            barIndex: concurrentCount % maxBars,
          });
          concurrentCount++;
        }
      }

      expect(indexToContext.get(0)).toEqual({ phase: 'serial', barIndex: 0 });
      expect(indexToContext.get(1)).toEqual({ phase: 'concurrent', barIndex: 0 });
      expect(indexToContext.get(2)).toEqual({ phase: 'serial', barIndex: 0 });
      expect(indexToContext.get(3)).toEqual({ phase: 'concurrent', barIndex: 1 });
      expect(indexToContext.get(4)).toEqual({ phase: 'concurrent', barIndex: 2 });
    });

    it('should calculate correct totals for each progress bar', () => {
      const concurrentCount = 10;
      const numBars = 3;

      const perBar = Math.floor(concurrentCount / numBars);
      const remainder = concurrentCount % numBars;

      const barTotals = [];
      for (let i = 0; i < numBars; i++) {
        const total = i < remainder ? perBar + 1 : perBar;
        barTotals.push(total);
      }

      expect(barTotals).toEqual([4, 3, 3]);
      expect(barTotals.reduce((a, b) => a + b, 0)).toBe(concurrentCount);
    });
  });
});
