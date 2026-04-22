import React, { Profiler } from 'react';

import { onRenderCallback } from '@app/utils/performanceProfiler';

interface PerformanceProfilerProps {
  id: string;
  children: React.ReactNode;
  /** Only profile in development mode (default: true) */
  devOnly?: boolean;
}

/**
 * Wrapper component for React's Profiler API
 *
 * Wrap any component to measure its render performance:
 *
 * ```tsx
 * <PerformanceProfiler id="MyComponent">
 *   <MyComponent />
 * </PerformanceProfiler>
 * ```
 *
 * Then in browser console:
 * - `__REACT_PROFILER__.printReport()` - Print summary
 * - `__REACT_PROFILER__.getSummary('MyComponent')` - Get specific component
 * - `__REACT_PROFILER__.clear()` - Reset metrics
 */
export function PerformanceProfiler({ id, children, devOnly = true }: PerformanceProfilerProps) {
  // Skip profiling in production unless explicitly enabled
  if (devOnly && !import.meta.env.DEV && import.meta.env.VITE_ENABLE_PROFILING !== 'true') {
    return <>{children}</>;
  }

  return (
    <Profiler id={id} onRender={onRenderCallback}>
      {children}
    </Profiler>
  );
}

export default PerformanceProfiler;
