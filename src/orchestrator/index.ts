import { ProviderLane } from './lane';
import { GlobalSemaphore } from './semaphore';
import type { OrchestratorOptions, Task } from './types';
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

  // Helper to generate key
  getProviderKey(provider: ApiProvider): string {
    return getProviderKey(provider);
  }

  private handleAbort = () => {
    this.shutdown(new Error('Operation cancelled'));
  };
}
