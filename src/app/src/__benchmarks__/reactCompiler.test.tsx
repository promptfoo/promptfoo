/**
 * React Compiler Performance Benchmark
 *
 * This benchmark measures render performance of key components to verify
 * React Compiler is providing expected optimizations.
 *
 * Run with compiler:
 *   npm run test -- src/__benchmarks__/reactCompiler.bench.tsx
 *
 * Run without compiler:
 *   DISABLE_REACT_COMPILER=true npm run test -- src/__benchmarks__/reactCompiler.bench.tsx
 *
 * Compare the "Render time" metrics between runs.
 */

import { Profiler, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Test components that simulate common patterns
function ExpensiveChild({ value }: { value: number }) {
  // Simulate expensive computation
  let sum = 0;
  for (let i = 0; i < 1000; i++) {
    sum += Math.sqrt(i * value);
  }
  return <div data-testid="expensive">{sum.toFixed(2)}</div>;
}

function ListItem({ item, onClick }: { item: string; onClick: (item: string) => void }) {
  return (
    <li data-testid={`item-${item}`} onClick={() => onClick(item)}>
      {item}
    </li>
  );
}

function ParentWithCallbacks() {
  const [count, setCount] = useState(0);
  const [items] = useState(['a', 'b', 'c', 'd', 'e']);

  // Without React Compiler, this callback would be recreated every render
  // causing all ListItem children to re-render
  const handleClick = (item: string) => {
    console.log('clicked', item);
  };

  return (
    <div>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
      <ul>
        {items.map((item) => (
          <ListItem key={item} item={item} onClick={handleClick} />
        ))}
      </ul>
    </div>
  );
}

function ParentWithExpensiveChild() {
  const [count, setCount] = useState(0);
  const [expensiveValue] = useState(42);

  return (
    <div>
      <button data-testid="increment" onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
      <ExpensiveChild value={expensiveValue} />
    </div>
  );
}

// Profiler metrics collector
interface ProfileMetrics {
  renderCount: number;
  totalActualDuration: number;
  totalBaseDuration: number;
  renders: Array<{ phase: string; actualDuration: number; baseDuration: number }>;
}

function createMetricsCollector(): {
  metrics: ProfileMetrics;
  onRender: (
    id: string,
    phase: 'mount' | 'update' | 'nested-update',
    actualDuration: number,
    baseDuration: number,
  ) => void;
} {
  const metrics: ProfileMetrics = {
    renderCount: 0,
    totalActualDuration: 0,
    totalBaseDuration: 0,
    renders: [],
  };

  return {
    metrics,
    onRender: (_id, phase, actualDuration, baseDuration) => {
      metrics.renderCount++;
      metrics.totalActualDuration += actualDuration;
      metrics.totalBaseDuration += baseDuration;
      metrics.renders.push({ phase, actualDuration, baseDuration });
    },
  };
}

describe('React Compiler Performance Benchmarks', () => {
  const compilerEnabled = import.meta.env.VITE_REACT_COMPILER_ENABLED === 'true';

  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('reports compiler status', () => {
    console.log(`\n📊 React Compiler: ${compilerEnabled ? 'ENABLED' : 'DISABLED'}\n`);
    expect(true).toBe(true);
  });

  it('measures callback stability impact on list re-renders', async () => {
    const { metrics, onRender } = createMetricsCollector();

    render(
      <Profiler id="callback-test" onRender={onRender}>
        <ParentWithCallbacks />
      </Profiler>,
    );

    // Initial render
    expect(metrics.renderCount).toBe(1);

    // Trigger multiple state updates
    const button = screen.getByTestId('increment');
    for (let i = 0; i < 10; i++) {
      fireEvent.click(button);
    }

    // With React Compiler, children should NOT re-render when callbacks are stable
    // Without compiler, all ListItems would re-render on each parent update
    console.log(`  Callback Test Results (Compiler: ${compilerEnabled ? 'ON' : 'OFF'}):`);
    console.log(`    Total renders: ${metrics.renderCount}`);
    console.log(`    Total actual duration: ${metrics.totalActualDuration.toFixed(2)}ms`);
    console.log(
      `    Avg render time: ${(metrics.totalActualDuration / metrics.renderCount).toFixed(2)}ms`,
    );
    console.log(
      `    Memoization ratio: ${((metrics.totalActualDuration / metrics.totalBaseDuration) * 100).toFixed(1)}%`,
    );

    // The test passes regardless - we're measuring, not asserting specific values
    expect(metrics.renderCount).toBeGreaterThan(0);
  });

  it('measures expensive child memoization', async () => {
    const { metrics, onRender } = createMetricsCollector();

    render(
      <Profiler id="expensive-child-test" onRender={onRender}>
        <ParentWithExpensiveChild />
      </Profiler>,
    );

    const initialActualDuration = metrics.totalActualDuration;

    // Trigger state updates that should NOT affect expensive child
    const button = screen.getByTestId('increment');
    for (let i = 0; i < 5; i++) {
      fireEvent.click(button);
    }

    const updateDuration = metrics.totalActualDuration - initialActualDuration;
    const avgUpdateDuration = updateDuration / 5;

    console.log(`  Expensive Child Test Results (Compiler: ${compilerEnabled ? 'ON' : 'OFF'}):`);
    console.log(`    Initial render: ${initialActualDuration.toFixed(2)}ms`);
    console.log(`    5 updates total: ${updateDuration.toFixed(2)}ms`);
    console.log(`    Avg update time: ${avgUpdateDuration.toFixed(2)}ms`);

    // With compiler, updates should be much faster than initial render
    // because ExpensiveChild should be memoized
    if (compilerEnabled) {
      console.log(`    Expected: Update time << Initial render (memoization working)`);
    } else {
      console.log(`    Expected: Update time ~ Initial render (no automatic memoization)`);
    }

    expect(metrics.renderCount).toBeGreaterThan(0);
  });

  it('provides benchmark summary', () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BENCHMARK SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`React Compiler: ${compilerEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`\nTo compare performance:`);
    console.log(`  1. Run: npm run test -- src/__benchmarks__/reactCompiler.bench.tsx`);
    console.log(
      `  2. Run: DISABLE_REACT_COMPILER=true npm run test -- src/__benchmarks__/reactCompiler.bench.tsx`,
    );
    console.log(`  3. Compare the render times above`);
    console.log(`${'='.repeat(60)}\n`);

    expect(true).toBe(true);
  });
});
