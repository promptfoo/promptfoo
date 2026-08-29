import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CyclicDependencyError,
  DagOrchestrator,
  MissingDependencyError,
} from '../../src/scheduler/dagOrchestrator';

describe('DagOrchestrator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute an empty DAG returning zero stats', async () => {
    const orchestrator = new DagOrchestrator();
    const result = await orchestrator.execute();

    expect(result.stats.totalTasks).toBe(0);
    expect(result.stats.completedTasks).toBe(0);
    expect(result.outputs.size).toBe(0);
    expect(result.errors.size).toBe(0);
  });

  it('should execute independent root tasks in parallel', async () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({
      id: 'task-1',
      run: async () => 'result-1',
    });
    orchestrator.addTask({
      id: 'task-2',
      run: async () => 'result-2',
    });

    const result = await orchestrator.execute();
    expect(result.stats.totalTasks).toBe(2);
    expect(result.stats.completedTasks).toBe(2);
    expect(result.outputs.get('task-1')).toBe('result-1');
    expect(result.outputs.get('task-2')).toBe('result-2');
  });

  it('should execute sequential tasks passing dependency outputs', async () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({
      id: 'extract',
      run: async () => ({ text: 'promptfoo evaluation' }),
    });
    orchestrator.addTask({
      id: 'transform',
      dependencies: ['extract'],
      run: async ({ getDependencyOutput }) => {
        const input = getDependencyOutput<{ text: string }>('extract');
        return { upper: input.text.toUpperCase() };
      },
    });
    orchestrator.addTask({
      id: 'load',
      dependencies: ['transform'],
      run: async ({ getDependencyOutput }) => {
        const input = getDependencyOutput<{ upper: string }>('transform');
        return `Loaded: ${input.upper}`;
      },
    });

    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(3);
    expect(result.outputs.get('load')).toBe('Loaded: PROMPTFOO EVALUATION');
  });

  it('should reject undeclared dependencies in getDependencyOutput', async () => {
    const orchestrator = new DagOrchestrator({ failFast: true });
    orchestrator.addTask({
      id: 'unrelated',
      run: async () => 'secret',
    });
    orchestrator.addTask({
      id: 'rogue-task',
      // Note: 'unrelated' is NOT in dependencies!
      dependencies: [],
      run: async ({ getDependencyOutput }) => {
        return getDependencyOutput('unrelated');
      },
    });

    await expect(orchestrator.execute()).rejects.toThrow(
      "Task 'rogue-task' cannot access output of undeclared dependency 'unrelated'",
    );
  });

  it('should snapshot dependencies upon registration preventing external mutation', async () => {
    const orchestrator = new DagOrchestrator();
    const externalDeps = ['root'];
    orchestrator.addTask({
      id: 'root',
      run: async () => 'root-val',
    });
    orchestrator.addTask({
      id: 'child',
      dependencies: externalDeps,
      run: async ({ getDependencyOutput }) => getDependencyOutput('root'),
    });

    // Mutate the external array after registration
    externalDeps.push('non-existent-task');

    // Validation and execution should use the snapshotted graph and succeed
    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(2);
    expect(result.outputs.get('child')).toBe('root-val');
  });

  it('should execute diamond dependency DAGs correctly', async () => {
    //        [Root]
    //       /      \
    //   [BranchA]  [BranchB]
    //       \      /
    //        [Join]
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({
      id: 'root',
      run: async () => 10,
    });
    orchestrator.addTask({
      id: 'branchA',
      dependencies: ['root'],
      run: async ({ getDependencyOutput }) => {
        const val = getDependencyOutput<number>('root');
        return val * 2;
      },
    });
    orchestrator.addTask({
      id: 'branchB',
      dependencies: ['root'],
      run: async ({ getDependencyOutput }) => {
        const val = getDependencyOutput<number>('root');
        return val + 5;
      },
    });
    orchestrator.addTask({
      id: 'join',
      dependencies: ['branchA', 'branchB'],
      run: async ({ getDependencyOutput }) => {
        const a = getDependencyOutput<number>('branchA');
        const b = getDependencyOutput<number>('branchB');
        return a + b;
      },
    });

    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(4);
    // (10 * 2) + (10 + 5) = 20 + 15 = 35
    expect(result.outputs.get('join')).toBe(35);
  });

  it('should compute topological levels for stepped stage execution', () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({ id: 'a', run: async () => 1 });
    orchestrator.addTask({ id: 'b', dependencies: ['a'], run: async () => 2 });
    orchestrator.addTask({ id: 'c', dependencies: ['a'], run: async () => 3 });
    orchestrator.addTask({ id: 'd', dependencies: ['b', 'c'], run: async () => 4 });

    const levels = orchestrator.getTopologicalLevels();
    expect(levels).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('should detect circular dependencies and throw CyclicDependencyError with path', () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({ id: 'a', dependencies: ['c'], run: async () => 1 });
    orchestrator.addTask({ id: 'b', dependencies: ['a'], run: async () => 2 });
    orchestrator.addTask({ id: 'c', dependencies: ['b'], run: async () => 3 });

    expect(() => orchestrator.validate()).toThrow(CyclicDependencyError);
    try {
      orchestrator.validate();
    } catch (e) {
      const err = e as CyclicDependencyError;
      expect(err.cyclePath.length).toBeGreaterThan(0);
      expect(err.message).toContain('Cyclic dependency detected');
    }
  });

  it('should detect cycles in deep graphs using iterative DFS without stack overflow', () => {
    const orchestrator = new DagOrchestrator();
    const depth = 200;
    for (let i = 0; i < depth; i++) {
      orchestrator.addTask({
        id: `node-${i}`,
        dependencies: i === 0 ? [`node-${depth - 1}`] : [`node-${i - 1}`],
        run: async () => i,
      });
    }

    expect(() => orchestrator.validate()).toThrow(CyclicDependencyError);
  });

  it('should detect missing dependencies and throw MissingDependencyError', () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({ id: 'task-1', dependencies: ['ghost-task'], run: async () => 1 });

    expect(() => orchestrator.validate()).toThrow(MissingDependencyError);
  });

  it('should prevent duplicate task ID registration', () => {
    const orchestrator = new DagOrchestrator();
    orchestrator.addTask({ id: 'dup-id', run: async () => 1 });
    expect(() => orchestrator.addTask({ id: 'dup-id', run: async () => 2 })).toThrow(
      "Task with ID 'dup-id' is already registered in the DAG",
    );
  });

  it('should normalize invalid maxConcurrency options to 1', async () => {
    const orchestrator = new DagOrchestrator({ maxConcurrency: 0 });
    orchestrator.addTask({ id: 'task-1', run: async () => 'done' });
    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(1);
    expect(result.outputs.get('task-1')).toBe('done');
  });

  it('should enforce maxConcurrency limits during execution', async () => {
    let active = 0;
    let maxActiveSeen = 0;

    const orchestrator = new DagOrchestrator({ maxConcurrency: 2 });
    for (let i = 0; i < 6; i++) {
      orchestrator.addTask({
        id: `task-${i}`,
        run: async () => {
          active++;
          maxActiveSeen = Math.max(maxActiveSeen, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active--;
          return i;
        },
      });
    }

    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(6);
    expect(maxActiveSeen).toBeLessThanOrEqual(2);
  });

  it('should fail fast and reject immediately when failFast is true', async () => {
    const orchestrator = new DagOrchestrator({ failFast: true });
    orchestrator.addTask({
      id: 'failing-task',
      run: async () => {
        throw new Error('Explosion');
      },
    });
    orchestrator.addTask({
      id: 'downstream-task',
      dependencies: ['failing-task'],
      run: async () => 'should not run',
    });

    await expect(orchestrator.execute()).rejects.toThrow('Explosion');
  });

  it('should convert synchronous exceptions into task failures when failFast is false', async () => {
    const orchestrator = new DagOrchestrator({ failFast: false });
    orchestrator.addTask({
      id: 'sync-throwing-task',
      run: () => {
        throw new Error('Sync boom');
      },
    });
    orchestrator.addTask({
      id: 'healthy-task',
      run: async () => 'healthy',
    });

    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(1);
    expect(result.stats.failedTasks).toBe(1);
    expect(result.outputs.get('healthy-task')).toBe('healthy');
    expect(result.errors.get('sync-throwing-task')?.message).toBe('Sync boom');
  });

  it('should skip downstream tasks while completing independent tasks when failFast is false', async () => {
    const orchestrator = new DagOrchestrator({ failFast: false });
    orchestrator.addTask({
      id: 'failing-branch-root',
      run: async () => {
        throw new Error('Branch error');
      },
    });
    orchestrator.addTask({
      id: 'failing-branch-child',
      dependencies: ['failing-branch-root'],
      run: async () => 'skipped',
    });
    orchestrator.addTask({
      id: 'healthy-branch',
      run: async () => 'healthy-output',
    });

    const result = await orchestrator.execute();
    expect(result.stats.completedTasks).toBe(1);
    expect(result.stats.failedTasks).toBe(1);
    expect(result.stats.skippedTasks).toBe(1);
    expect(result.outputs.get('healthy-branch')).toBe('healthy-output');
    expect(result.errors.get('failing-branch-root')?.message).toBe('Branch error');
  });

  it('should respect overall timeoutMs and trigger cooperative AbortSignal using fake timers', async () => {
    vi.useFakeTimers();
    let abortedViaSignal = false;

    const orchestrator = new DagOrchestrator({ timeoutMs: 50 });
    orchestrator.addTask({
      id: 'slow-task',
      run: async ({ signal }) => {
        if (signal.aborted) {
          abortedViaSignal = true;
        } else {
          signal.addEventListener('abort', () => {
            abortedViaSignal = true;
          });
        }
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            resolve('aborted');
          });
        });
      },
    });

    const execPromise = orchestrator.execute();
    vi.advanceTimersByTime(60);

    await expect(execPromise).rejects.toThrow('DAG execution timed out after 50ms');
    expect(abortedViaSignal).toBe(true);
  });
});
