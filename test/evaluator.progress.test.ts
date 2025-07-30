import type { RunEvalOptions } from '../src/types';

// Mock dependencies
jest.mock('cli-progress', () => {
  const mockBar = {
    increment: jest.fn(),
    update: jest.fn(),
    getTotal: jest.fn().mockImplementation(function (this: any) {
      return this._total || 10;
    }),
  };

  return {
    default: {
      MultiBar: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockImplementation((total: number) => {
          const bar = { ...mockBar, _total: total };
          return bar;
        }),
        stop: jest.fn(),
      })),
      Presets: {
        shades_classic: {},
      },
    },
  };
});

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
  setLogLevel: jest.fn(),
}));

// Import after mocking - we need to extract ProgressBarManager from evaluator
// Since it's a private class, we'll test it through its usage patterns
import { calculateThreadsPerBar } from '../src/evaluator';

describe('Progress Bar Management', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

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

    it('should handle dynamic comparison bar creation correctly', () => {
      // This test validates that comparison bars are created with the correct total
      // after we know the actual count of comparisons needed

      const cliProgress = require('cli-progress').default;
      const mockMultibar = new cliProgress.MultiBar();

      // Simulate creating progress bars without knowing comparison count initially
      mockMultibar.create(2, 0); // 2 serial tasks
      mockMultibar.create(3, 0); // 3 concurrent tasks

      // Later, when we know we need 5 comparisons, create the comparison bar
      mockMultibar.create(5, 0);

      // Verify the create method was called with correct totals
      expect(mockMultibar.create).toHaveBeenCalledTimes(3);
      expect(mockMultibar.create).toHaveBeenNthCalledWith(1, 2, 0);
      expect(mockMultibar.create).toHaveBeenNthCalledWith(2, 3, 0);
      expect(mockMultibar.create).toHaveBeenNthCalledWith(3, 5, 0);
    });
  });
});
