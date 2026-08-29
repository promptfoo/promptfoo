import { IndexedDeque } from './slotQueue';

/**
 * Thrown when a cycle is detected in the DAG dependencies.
 */
export class CyclicDependencyError extends Error {
  readonly cyclePath: string[];

  constructor(cyclePath: string[]) {
    super(`Cyclic dependency detected in DAG: ${cyclePath.join(' -> ')}`);
    this.name = 'CyclicDependencyError';
    this.cyclePath = cyclePath;
  }
}

/**
 * Thrown when a task references a dependency that does not exist in the DAG.
 */
export class MissingDependencyError extends Error {
  readonly taskId: string;
  readonly missingDependencyId: string;

  constructor(taskId: string, missingDependencyId: string) {
    super(`Task '${taskId}' references non-existent dependency '${missingDependencyId}'`);
    this.name = 'MissingDependencyError';
    this.taskId = taskId;
    this.missingDependencyId = missingDependencyId;
  }
}

/**
 * Context provided to a task during its execution.
 */
export interface DagExecutionContext {
  /**
   * Retrieves the resolved output of an upstream dependency task.
   * Throws if the dependency did not resolve successfully.
   */
  getDependencyOutput: <T = unknown>(dependencyId: string) => T;

  /**
   * Read-only map of all currently resolved outputs across the DAG.
   */
  allOutputs: ReadonlyMap<string, unknown>;
}

/**
 * Represents a single executable node in the DAG.
 */
export interface DagTask<TOutput = unknown> {
  /** Unique identifier for this task */
  id: string;

  /** List of task IDs that must complete before this task starts */
  dependencies?: string[];

  /**
   * Execution callback. Receives the DAG execution context containing
   * parent dependency outputs.
   */
  run: (context: DagExecutionContext) => Promise<TOutput>;
}

export interface DagOrchestratorOptions {
  /** Maximum number of tasks to execute concurrently. Default: Infinity (unbounded) */
  maxConcurrency?: number;

  /**
   * If true, the DAG stops scheduling new tasks immediately upon the first failure.
   * If false, independent subgraphs continue to execute. Default: true.
   */
  failFast?: boolean;

  /** Optional overall timeout in milliseconds for the entire DAG execution */
  timeoutMs?: number;
}

export interface DagStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  durationMs: number;
}

export interface DagExecutionResult {
  outputs: Map<string, unknown>;
  errors: Map<string, Error>;
  stats: DagStats;
}

/**
 * Directed Acyclic Graph (DAG) Task Orchestrator.
 *
 * Implements:
 * - Topological sorting with Kahn's Algorithm in O(V + E) time
 * - Static cycle detection with cycle path tracing
 * - Dynamic parallel asynchronous task execution
 * - Upstream-to-downstream dependency data passing
 * - Configurable concurrency bounds & fail-fast policies
 */
export class DagOrchestrator {
  private tasks = new Map<string, DagTask<unknown>>();
  private adjacencyList = new Map<string, Set<string>>(); // parent -> Set<child>
  private reverseAdjacency = new Map<string, Set<string>>(); // child -> Set<parent>
  private options: Required<DagOrchestratorOptions>;

  constructor(options?: DagOrchestratorOptions) {
    this.options = {
      maxConcurrency: options?.maxConcurrency ?? Infinity,
      failFast: options?.failFast ?? true,
      timeoutMs: options?.timeoutMs ?? 0,
    };
  }

  /**
   * Registers a task in the DAG.
   */
  addTask<T>(task: DagTask<T>): this {
    if (this.tasks.has(task.id)) {
      throw new Error(`Task with ID '${task.id}' is already registered in the DAG`);
    }

    this.tasks.set(task.id, task as DagTask<unknown>);
    if (!this.adjacencyList.has(task.id)) {
      this.adjacencyList.set(task.id, new Set());
    }
    if (!this.reverseAdjacency.has(task.id)) {
      this.reverseAdjacency.set(task.id, new Set());
    }

    for (const depId of task.dependencies ?? []) {
      if (!this.adjacencyList.has(depId)) {
        this.adjacencyList.set(depId, new Set());
      }
      this.adjacencyList.get(depId)!.add(task.id);
      this.reverseAdjacency.get(task.id)!.add(depId);
    }

    return this;
  }

  /**
   * Registers multiple tasks in the DAG.
   */
  addTasks(tasks: DagTask<unknown>[]): this {
    for (const task of tasks) {
      this.addTask(task);
    }
    return this;
  }

  /**
   * Validates graph topology using Kahn's Algorithm.
   *
   * Verifies that:
   * 1. All referenced dependencies exist in the graph.
   * 2. The graph contains no cycles (is a valid DAG).
   *
   * @throws MissingDependencyError if a dependency ID is unknown.
   * @throws CyclicDependencyError if circular dependencies are detected.
   */
  validate(): void {
    // 1. Check for missing dependencies
    for (const [taskId, task] of this.tasks) {
      for (const depId of task.dependencies ?? []) {
        if (!this.tasks.has(depId)) {
          throw new MissingDependencyError(taskId, depId);
        }
      }
    }

    // 2. Kahn's Algorithm for cycle detection
    const inDegree = new Map<string, number>();
    for (const taskId of this.tasks.keys()) {
      const deps = this.reverseAdjacency.get(taskId);
      inDegree.set(taskId, deps ? deps.size : 0);
    }

    const queue: string[] = [];
    for (const [taskId, deg] of inDegree) {
      if (deg === 0) {
        queue.push(taskId);
      }
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visitedCount++;

      for (const childId of this.adjacencyList.get(curr) ?? []) {
        const remaining = inDegree.get(childId)! - 1;
        inDegree.set(childId, remaining);
        if (remaining === 0) {
          queue.push(childId);
        }
      }
    }

    // If not all nodes were visited, a cycle exists
    if (visitedCount < this.tasks.size) {
      const cyclePath = this.findCyclePath();
      throw new CyclicDependencyError(cyclePath);
    }
  }

  /**
   * Computes topological execution levels (stages) for visualization or stepped execution.
   * Stage 0 contains all root tasks (no dependencies).
   * Stage N contains tasks whose dependencies all resolve in stages < N.
   */
  getTopologicalLevels(): string[][] {
    this.validate();

    const levels: string[][] = [];
    const nodeLevel = new Map<string, number>();

    const inDegree = new Map<string, number>();
    for (const taskId of this.tasks.keys()) {
      const deps = this.reverseAdjacency.get(taskId);
      inDegree.set(taskId, deps ? deps.size : 0);
    }

    const queue: string[] = [];
    for (const [taskId, deg] of inDegree) {
      if (deg === 0) {
        queue.push(taskId);
        nodeLevel.set(taskId, 0);
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currentLvl = nodeLevel.get(curr)!;

      if (!levels[currentLvl]) {
        levels[currentLvl] = [];
      }
      levels[currentLvl].push(curr);

      for (const childId of this.adjacencyList.get(curr) ?? []) {
        const remaining = inDegree.get(childId)! - 1;
        inDegree.set(childId, remaining);

        const nextLvl = Math.max(nodeLevel.get(childId) ?? 0, currentLvl + 1);
        nodeLevel.set(childId, nextLvl);

        if (remaining === 0) {
          queue.push(childId);
        }
      }
    }

    return levels;
  }

  /**
   * Executes the DAG asynchronously.
   *
   * Dispatches ready tasks up to maxConcurrency, resolves outputs,
   * unblocks child tasks in real time, and aggregates results.
   */
  async execute(): Promise<DagExecutionResult> {
    this.validate();

    const startTime = Date.now();
    const outputs = new Map<string, unknown>();
    const errors = new Map<string, Error>();
    const skippedTasks = new Set<string>();

    if (this.tasks.size === 0) {
      return {
        outputs,
        errors,
        stats: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          skippedTasks: 0,
          durationMs: 0,
        },
      };
    }

    // In-degree tracking for active execution
    const currentInDegree = new Map<string, number>();
    for (const taskId of this.tasks.keys()) {
      const deps = this.reverseAdjacency.get(taskId);
      currentInDegree.set(taskId, deps ? deps.size : 0);
    }

    // O(1) Ready Queue for runnable tasks
    const readyQueue = new IndexedDeque<{ id: string }>();
    for (const [taskId, deg] of currentInDegree) {
      if (deg === 0) {
        readyQueue.push({ id: taskId });
      }
    }

    let runningCount = 0;
    let isAborted = false;
    let completedCount = 0;

    return new Promise<DagExecutionResult>((resolve, reject) => {
      let timeoutTimer: NodeJS.Timeout | null = null;

      if (this.options.timeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
          isAborted = true;
          reject(new Error(`DAG execution timed out after ${this.options.timeoutMs}ms`));
        }, this.options.timeoutMs);
      }

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const markDescendantsSkipped = (failedTaskId: string) => {
        const queue = [failedTaskId];
        while (queue.length > 0) {
          const parent = queue.shift()!;
          for (const childId of this.adjacencyList.get(parent) ?? []) {
            if (!skippedTasks.has(childId)) {
              skippedTasks.add(childId);
              queue.push(childId);
            }
          }
        }
      };

      const checkCompletion = () => {
        const settledCount = completedCount + errors.size + skippedTasks.size;
        if (settledCount >= this.tasks.size && runningCount === 0) {
          cleanup();
          const durationMs = Date.now() - startTime;
          const result: DagExecutionResult = {
            outputs,
            errors,
            stats: {
              totalTasks: this.tasks.size,
              completedTasks: completedCount,
              failedTasks: errors.size,
              skippedTasks: skippedTasks.size,
              durationMs,
            },
          };

          if (this.options.failFast && errors.size > 0) {
            const firstError = errors.values().next().value;
            reject(firstError);
          } else {
            resolve(result);
          }
        }
      };

      const dispatch = () => {
        if (isAborted) {
          return;
        }

        while (
          readyQueue.length > 0 &&
          runningCount < this.options.maxConcurrency &&
          !isAborted
        ) {
          const item = readyQueue.shift()!;
          const taskId = item.id;

          if (skippedTasks.has(taskId)) {
            checkCompletion();
            continue;
          }

          runningCount++;
          const task = this.tasks.get(taskId)!;

          const context: DagExecutionContext = {
            getDependencyOutput: <T = unknown>(depId: string): T => {
              if (!outputs.has(depId)) {
                throw new Error(
                  `Output for dependency '${depId}' is unavailable for task '${taskId}'`,
                );
              }
              return outputs.get(depId) as T;
            },
            allOutputs: outputs,
          };

          // Execute task
          task
            .run(context)
            .then((output) => {
              runningCount--;
              completedCount++;
              outputs.set(taskId, output);

              // Unblock dependent children
              for (const childId of this.adjacencyList.get(taskId) ?? []) {
                if (skippedTasks.has(childId)) {
                  continue;
                }

                const remaining = currentInDegree.get(childId)! - 1;
                currentInDegree.set(childId, remaining);

                if (remaining === 0) {
                  readyQueue.push({ id: childId });
                }
              }

              dispatch();
              checkCompletion();
            })
            .catch((error: unknown) => {
              runningCount--;
              const err = error instanceof Error ? error : new Error(String(error));
              errors.set(taskId, err);

              if (this.options.failFast) {
                isAborted = true;
                cleanup();
                reject(err);
                return;
              }

              // Skip downstream dependent tasks
              markDescendantsSkipped(taskId);

              dispatch();
              checkCompletion();
            });
        }

        checkCompletion();
      };

      // Kickoff execution
      dispatch();
    });
  }

  /**
   * Helper DFS method to pinpoint and trace a circular dependency path for error reporting.
   */
  private findCyclePath(): string[] {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const parentMap = new Map<string, string>();

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of this.adjacencyList.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          parentMap.set(neighbor, node);
          const cycle = dfs(neighbor);
          if (cycle) {
            return cycle;
          }
        } else if (recStack.has(neighbor)) {
          // Cycle found! Reconstruct cycle path
          const path = [neighbor];
          let curr = node;
          while (curr !== neighbor) {
            path.push(curr);
            curr = parentMap.get(curr)!;
          }
          path.push(neighbor);
          return path.reverse();
        }
      }

      recStack.delete(node);
      return null;
    };

    for (const node of this.tasks.keys()) {
      if (!visited.has(node)) {
        const cycle = dfs(node);
        if (cycle) {
          return cycle;
        }
      }
    }

    return ['(unknown cycle)'];
  }
}
