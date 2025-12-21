import { ProviderLane } from './lane';
import { GlobalSemaphore } from './semaphore';
import type { OrchestratorOptions, OrchestratorStats, Task } from './types';
import { getProviderKey } from './utils';
import type { ApiProvider } from '../types/providers';

export class Orchestrator {
  private lanes = new Map<string, ProviderLane>();
  private semaphore: GlobalSemaphore;
  private stopped = false;
  private abortSignal?: AbortSignal;

  constructor(options: OrchestratorOptions) {
    this.semaphore = new GlobalSemaphore(options.maxConcurrency);
    this.abortSignal = options.abortSignal;
    if (this.abortSignal) {
      this.abortSignal.addEventListener('abort', this.handleAbort, { once: true });
    }
  }

  dispatch(task: Task): Promise<void> {
    if (this.stopped || this.abortSignal?.aborted) {
      return Promise.reject(new Error('Orchestrator stopped'));
    }
    let lane = this.lanes.get(task.providerKey);
    if (!lane) {
      lane = new ProviderLane({
        providerKey: task.providerKey,
        semaphore: this.semaphore,
        shouldStop: () => this.stopped || Boolean(this.abortSignal?.aborted),
      });
      this.lanes.set(task.providerKey, lane);
    }
    return lane.add(task);
  }

  async run(tasks: Task[]): Promise<void> {
    try {
      await Promise.all(tasks.map((task) => this.dispatch(task)));
    } catch (error) {
      this.shutdown(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      if (this.abortSignal) {
        this.abortSignal.removeEventListener('abort', this.handleAbort);
      }
    }
  }

  shutdown(reason: Error): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    for (const lane of this.lanes.values()) {
      lane.stop(reason);
    }
  }

  getStats(): OrchestratorStats {
    const lanes = Array.from(this.lanes.values()).map((lane) => lane.getStats());
    let totalStarted = 0;
    let totalCompleted = 0;
    let totalEstimatedTokens = 0;
    let rateLimitEvents = 0;
    let maxQueueDepth = 0;
    let elapsedMs = 0;

    for (const lane of lanes) {
      totalStarted += lane.totalStarted;
      totalCompleted += lane.totalCompleted;
      totalEstimatedTokens += lane.totalEstimatedTokens;
      rateLimitEvents += lane.rateLimitEvents;
      maxQueueDepth = Math.max(maxQueueDepth, lane.maxQueueDepth);
      elapsedMs = Math.max(elapsedMs, lane.elapsedMs);
    }

    const minutes = elapsedMs > 0 ? elapsedMs / 60_000 : 0;
    const effectiveRpm = minutes > 0 ? totalStarted / minutes : 0;
    const effectiveTpm = minutes > 0 ? totalEstimatedTokens / minutes : 0;

    return {
      laneCount: lanes.length,
      totalStarted,
      totalCompleted,
      totalEstimatedTokens,
      rateLimitEvents,
      maxQueueDepth,
      elapsedMs,
      effectiveRpm,
      effectiveTpm,
      lanes,
    };
  }

  // Helper to generate key
  getProviderKey(provider: ApiProvider): string {
    return getProviderKey(provider);
  }

  private handleAbort = () => {
    this.shutdown(new Error('Operation cancelled'));
  };
}
