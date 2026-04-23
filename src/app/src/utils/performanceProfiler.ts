/**
 * Performance Profiler Utility
 *
 * This utility helps measure React component render performance.
 *
 * Usage:
 *   1. Wrap components with <PerformanceProfiler id="ComponentName">
 *   2. Run the app: npm run dev
 *   3. Check console for render metrics or call window.__REACT_PROFILER__.printReport()
 */

export interface RenderMetric {
  id: string;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
  timestamp: number;
}

export interface ProfilerSummary {
  id: string;
  totalRenders: number;
  mountCount: number;
  updateCount: number;
  avgActualDuration: number;
  avgBaseDuration: number;
  maxActualDuration: number;
  minActualDuration: number;
  memoizationEfficiency: number; // actualDuration / baseDuration (lower is better)
}

// Store metrics in memory for analysis
const metricsStore: Map<string, RenderMetric[]> = new Map();

// Whether profiling is enabled (only in development)
const PROFILING_ENABLED =
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROFILING === 'true');

/**
 * Callback for React Profiler component
 * Logs render metrics for later analysis
 */
export function onRenderCallback(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
): void {
  if (!PROFILING_ENABLED) {
    return;
  }

  const metric: RenderMetric = {
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
    timestamp: Date.now(),
  };

  // Store metric
  const existing = metricsStore.get(id) || [];
  existing.push(metric);
  metricsStore.set(id, existing);

  // Log significant renders (> 1ms actual duration)
  if (actualDuration > 1) {
    const efficiency = ((actualDuration / baseDuration) * 100).toFixed(1);
    console.debug(
      `[Profiler] ${id} ${phase}: ${actualDuration.toFixed(2)}ms ` +
        `(base: ${baseDuration.toFixed(2)}ms, efficiency: ${efficiency}%)`,
    );
  }
}

/**
 * Get summary statistics for a profiled component
 */
export function getProfilerSummary(id: string): ProfilerSummary | null {
  const metrics = metricsStore.get(id);
  if (!metrics || metrics.length === 0) {
    return null;
  }

  const mountMetrics = metrics.filter((m) => m.phase === 'mount');
  const updateMetrics = metrics.filter((m) => m.phase === 'update');
  const allActualDurations = metrics.map((m) => m.actualDuration);
  const allBaseDurations = metrics.map((m) => m.baseDuration);

  const avgActual = allActualDurations.reduce((a, b) => a + b, 0) / metrics.length;
  const avgBase = allBaseDurations.reduce((a, b) => a + b, 0) / metrics.length;

  return {
    id,
    totalRenders: metrics.length,
    mountCount: mountMetrics.length,
    updateCount: updateMetrics.length,
    avgActualDuration: avgActual,
    avgBaseDuration: avgBase,
    maxActualDuration: Math.max(...allActualDurations),
    minActualDuration: Math.min(...allActualDurations),
    memoizationEfficiency: avgActual / avgBase,
  };
}

/**
 * Get all profiler summaries
 */
export function getAllProfilerSummaries(): ProfilerSummary[] {
  const summaries: ProfilerSummary[] = [];
  for (const id of metricsStore.keys()) {
    const summary = getProfilerSummary(id);
    if (summary) {
      summaries.push(summary);
    }
  }
  return summaries.sort((a, b) => b.avgActualDuration - a.avgActualDuration);
}

/**
 * Clear all stored metrics
 */
export function clearProfilerMetrics(): void {
  metricsStore.clear();
}

/**
 * Print a formatted report to console
 */
export function printProfilerReport(): void {
  const summaries = getAllProfilerSummaries();

  console.group('📊 React Profiler Report');

  if (summaries.length === 0) {
    console.log('No profiler data collected yet.');
    console.groupEnd();
    return;
  }

  console.table(
    summaries.map((s) => ({
      Component: s.id,
      Renders: s.totalRenders,
      'Avg Duration (ms)': s.avgActualDuration.toFixed(2),
      'Base Duration (ms)': s.avgBaseDuration.toFixed(2),
      'Max (ms)': s.maxActualDuration.toFixed(2),
      Efficiency: `${(s.memoizationEfficiency * 100).toFixed(1)}%`,
    })),
  );

  const totalRenders = summaries.reduce((a, s) => a + s.totalRenders, 0);
  const avgEfficiency =
    summaries.reduce((a, s) => a + s.memoizationEfficiency, 0) / summaries.length;

  console.log(`\nTotal renders: ${totalRenders}`);
  console.log(`Average memoization efficiency: ${(avgEfficiency * 100).toFixed(1)}%`);
  console.log('(Lower efficiency % = better memoization)');
  console.groupEnd();
}

// Expose utilities globally for console access
if (typeof window !== 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny: window can kind of have anything I guess
  (window as any).__REACT_PROFILER__ = {
    getSummary: getProfilerSummary,
    getAllSummaries: getAllProfilerSummaries,
    printReport: printProfilerReport,
    clear: clearProfilerMetrics,
  };
}
