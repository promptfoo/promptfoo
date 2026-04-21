import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProfilerMetrics,
  getAllProfilerSummaries,
  getProfilerSummary,
  onRenderCallback,
  printProfilerReport,
} from './performanceProfiler';

describe('performanceProfiler', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear metrics before each test
    clearProfilerMetrics();
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
  });

  describe('onRenderCallback', () => {
    it('stores metrics for a component', () => {
      onRenderCallback('TestComponent', 'mount', 10.5, 8.2, 100, 110);

      const summary = getProfilerSummary('TestComponent');
      expect(summary).not.toBeNull();
      expect(summary?.totalRenders).toBe(1);
      expect(summary?.mountCount).toBe(1);
      expect(summary?.updateCount).toBe(0);
    });

    it('accumulates multiple render metrics', () => {
      onRenderCallback('TestComponent', 'mount', 10, 8, 100, 110);
      onRenderCallback('TestComponent', 'update', 5, 8, 120, 125);
      onRenderCallback('TestComponent', 'update', 3, 8, 130, 133);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.totalRenders).toBe(3);
      expect(summary?.mountCount).toBe(1);
      expect(summary?.updateCount).toBe(2);
    });

    it('stores metrics for different components separately', () => {
      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      onRenderCallback('ComponentB', 'mount', 15, 12, 100, 115);

      const summaryA = getProfilerSummary('ComponentA');
      const summaryB = getProfilerSummary('ComponentB');

      expect(summaryA?.totalRenders).toBe(1);
      expect(summaryB?.totalRenders).toBe(1);
      expect(summaryA?.avgActualDuration).toBe(10);
      expect(summaryB?.avgActualDuration).toBe(15);
    });

    it('logs significant renders to console.debug', () => {
      // Significant render (> 1ms)
      onRenderCallback('SlowComponent', 'mount', 5.5, 4.0, 100, 105);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Profiler] SlowComponent mount: 5.50ms'),
      );
    });

    it('does not log insignificant renders', () => {
      // Insignificant render (<= 1ms)
      onRenderCallback('FastComponent', 'mount', 0.5, 0.4, 100, 100.5);

      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it('handles nested-update phase', () => {
      onRenderCallback('TestComponent', 'nested-update', 10, 8, 100, 110);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.totalRenders).toBe(1);
      // nested-update is not counted as mount or update
      expect(summary?.mountCount).toBe(0);
      expect(summary?.updateCount).toBe(0);
    });
  });

  describe('getProfilerSummary', () => {
    it('returns null for component with no metrics', () => {
      const summary = getProfilerSummary('NonExistentComponent');
      expect(summary).toBeNull();
    });

    it('calculates average actual duration correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 8, 100, 110);
      onRenderCallback('TestComponent', 'update', 20, 8, 120, 140);
      onRenderCallback('TestComponent', 'update', 30, 8, 150, 180);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.avgActualDuration).toBe(20); // (10 + 20 + 30) / 3
    });

    it('calculates average base duration correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 5, 100, 110);
      onRenderCallback('TestComponent', 'update', 20, 10, 120, 140);
      onRenderCallback('TestComponent', 'update', 30, 15, 150, 180);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.avgBaseDuration).toBe(10); // (5 + 10 + 15) / 3
    });

    it('calculates max actual duration correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 8, 100, 110);
      onRenderCallback('TestComponent', 'update', 25, 8, 120, 145);
      onRenderCallback('TestComponent', 'update', 15, 8, 150, 165);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.maxActualDuration).toBe(25);
    });

    it('calculates min actual duration correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 8, 100, 110);
      onRenderCallback('TestComponent', 'update', 5, 8, 120, 125);
      onRenderCallback('TestComponent', 'update', 15, 8, 150, 165);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.minActualDuration).toBe(5);
    });

    it('calculates memoization efficiency correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 5, 100, 110);
      onRenderCallback('TestComponent', 'update', 20, 10, 120, 140);

      const summary = getProfilerSummary('TestComponent');
      // avgActual = 15, avgBase = 7.5, efficiency = 15/7.5 = 2
      expect(summary?.memoizationEfficiency).toBe(2);
    });

    it('counts mount and update phases separately', () => {
      onRenderCallback('TestComponent', 'mount', 10, 8, 100, 110);
      onRenderCallback('TestComponent', 'mount', 12, 8, 115, 127);
      onRenderCallback('TestComponent', 'update', 5, 8, 130, 135);
      onRenderCallback('TestComponent', 'update', 6, 8, 140, 146);
      onRenderCallback('TestComponent', 'update', 7, 8, 150, 157);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.totalRenders).toBe(5);
      expect(summary?.mountCount).toBe(2);
      expect(summary?.updateCount).toBe(3);
    });

    it('includes component id in summary', () => {
      onRenderCallback('MyComponent', 'mount', 10, 8, 100, 110);

      const summary = getProfilerSummary('MyComponent');
      expect(summary?.id).toBe('MyComponent');
    });
  });

  describe('getAllProfilerSummaries', () => {
    it('returns empty array when no metrics exist', () => {
      const summaries = getAllProfilerSummaries();
      expect(summaries).toEqual([]);
    });

    it('returns summaries for all profiled components', () => {
      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      onRenderCallback('ComponentB', 'mount', 20, 15, 100, 120);
      onRenderCallback('ComponentC', 'mount', 5, 4, 100, 105);

      const summaries = getAllProfilerSummaries();
      expect(summaries).toHaveLength(3);

      const ids = summaries.map((s) => s.id);
      expect(ids).toContain('ComponentA');
      expect(ids).toContain('ComponentB');
      expect(ids).toContain('ComponentC');
    });

    it('sorts summaries by avgActualDuration descending', () => {
      onRenderCallback('FastComponent', 'mount', 5, 4, 100, 105);
      onRenderCallback('SlowComponent', 'mount', 25, 20, 100, 125);
      onRenderCallback('MediumComponent', 'mount', 15, 12, 100, 115);

      const summaries = getAllProfilerSummaries();
      expect(summaries[0].id).toBe('SlowComponent');
      expect(summaries[1].id).toBe('MediumComponent');
      expect(summaries[2].id).toBe('FastComponent');
    });

    it('handles components with multiple renders', () => {
      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      onRenderCallback('ComponentA', 'update', 5, 8, 120, 125);
      onRenderCallback('ComponentB', 'mount', 30, 25, 100, 130);

      const summaries = getAllProfilerSummaries();
      expect(summaries).toHaveLength(2);

      const componentA = summaries.find((s) => s.id === 'ComponentA');
      expect(componentA?.totalRenders).toBe(2);
      expect(componentA?.avgActualDuration).toBe(7.5); // (10 + 5) / 2
    });
  });

  describe('clearProfilerMetrics', () => {
    it('clears all stored metrics', () => {
      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      onRenderCallback('ComponentB', 'mount', 20, 15, 100, 120);

      expect(getAllProfilerSummaries()).toHaveLength(2);

      clearProfilerMetrics();

      expect(getAllProfilerSummaries()).toHaveLength(0);
      expect(getProfilerSummary('ComponentA')).toBeNull();
      expect(getProfilerSummary('ComponentB')).toBeNull();
    });

    it('allows new metrics to be stored after clearing', () => {
      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      clearProfilerMetrics();
      onRenderCallback('ComponentB', 'mount', 20, 15, 100, 120);

      const summaries = getAllProfilerSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('ComponentB');
    });
  });

  describe('printProfilerReport', () => {
    it('logs message when no data is collected', () => {
      const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

      printProfilerReport();

      expect(consoleGroupSpy).toHaveBeenCalledWith('📊 React Profiler Report');
      expect(consoleLogSpy).toHaveBeenCalledWith('No profiler data collected yet.');
      expect(consoleGroupEndSpy).toHaveBeenCalled();

      consoleGroupSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('displays table with profiler data', () => {
      const consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
      const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

      onRenderCallback('ComponentA', 'mount', 10, 8, 100, 110);
      onRenderCallback('ComponentB', 'mount', 20, 16, 100, 120);

      printProfilerReport();

      expect(consoleGroupSpy).toHaveBeenCalledWith('📊 React Profiler Report');
      expect(consoleTableSpy).toHaveBeenCalled();
      expect(consoleGroupEndSpy).toHaveBeenCalled();

      // Check table data structure
      const tableData = consoleTableSpy.mock.calls[0][0];
      expect(tableData).toHaveLength(2);
      expect(tableData[0]).toHaveProperty('Component');
      expect(tableData[0]).toHaveProperty('Renders');
      expect(tableData[0]).toHaveProperty('Avg Duration (ms)');

      consoleTableSpy.mockRestore();
      consoleGroupSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('displays total renders and average efficiency', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
      const consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
      const consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

      onRenderCallback('ComponentA', 'mount', 10, 5, 100, 110); // efficiency = 2
      onRenderCallback('ComponentB', 'mount', 20, 10, 100, 120); // efficiency = 2

      printProfilerReport();

      expect(consoleLogSpy).toHaveBeenCalledWith('\nTotal renders: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith('Average memoization efficiency: 200.0%');
      expect(consoleLogSpy).toHaveBeenCalledWith('(Lower efficiency % = better memoization)');

      consoleLogSpy.mockRestore();
      consoleGroupSpy.mockRestore();
      consoleTableSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('formats table data correctly', () => {
      const consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
      vi.spyOn(console, 'group').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

      onRenderCallback('TestComponent', 'mount', 15.555, 10.333, 100, 115.555);
      onRenderCallback('TestComponent', 'update', 5.123, 10.333, 120, 125.123);

      printProfilerReport();

      const tableData = consoleTableSpy.mock.calls[0][0];
      expect(tableData[0]).toMatchObject({
        Component: 'TestComponent',
        Renders: 2,
        'Avg Duration (ms)': '10.34', // (15.555 + 5.123) / 2 = 10.339
        'Base Duration (ms)': '10.33',
        'Max (ms)': '15.55',
      });

      vi.restoreAllMocks();
    });
  });

  describe('edge cases', () => {
    it('handles zero actual duration', () => {
      onRenderCallback('FastComponent', 'mount', 0, 1, 100, 100);

      const summary = getProfilerSummary('FastComponent');
      expect(summary?.avgActualDuration).toBe(0);
      expect(summary?.minActualDuration).toBe(0);
      expect(summary?.memoizationEfficiency).toBe(0);
    });

    it('handles zero base duration', () => {
      onRenderCallback('TestComponent', 'mount', 10, 0, 100, 110);

      const summary = getProfilerSummary('TestComponent');
      expect(summary?.avgBaseDuration).toBe(0);
      // Efficiency calculation will be Infinity or NaN
      expect(summary?.memoizationEfficiency).toBeTruthy();
    });

    it('handles very large durations', () => {
      onRenderCallback('SlowComponent', 'mount', 1000000, 500000, 100, 1000100);

      const summary = getProfilerSummary('SlowComponent');
      expect(summary?.avgActualDuration).toBe(1000000);
      expect(summary?.memoizationEfficiency).toBe(2);
    });

    it('handles floating point precision in averages', () => {
      onRenderCallback('TestComponent', 'mount', 1.1, 1.1, 100, 101.1);
      onRenderCallback('TestComponent', 'update', 2.2, 2.2, 102, 104.2);
      onRenderCallback('TestComponent', 'update', 3.3, 3.3, 105, 108.3);

      const summary = getProfilerSummary('TestComponent');
      // (1.1 + 2.2 + 3.3) / 3 = 2.2
      expect(summary?.avgActualDuration).toBeCloseTo(2.2, 5);
      expect(summary?.avgBaseDuration).toBeCloseTo(2.2, 5);
    });
  });
});
