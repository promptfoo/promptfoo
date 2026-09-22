import { AsyncResource } from 'node:async_hooks';

export interface QueuedProviderCall<T> {
  call: () => Promise<T>;
  providerId: string;
  reject: (error: unknown) => void;
  resolve: (result: T) => void;
  settled: Promise<void>;
}

export interface ProviderCallQueue {
  enqueue<T>(providerId: string, call: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export class ProviderGroupedCallQueue implements ProviderCallQueue {
  private jobs: QueuedProviderCall<unknown>[] = [];
  private waiters: (() => void)[] = [];

  async enqueue<T>(providerId: string, call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const boundCall = AsyncResource.bind(call);
    return new Promise<T>((resolve, reject) => {
      let started = false;
      let pendingAbort: NodeJS.Immediate | undefined;
      let settle!: () => void;
      const settled = new Promise<void>((resolveSettled) => {
        settle = resolveSettled;
      });
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        if (pendingAbort) {
          clearImmediate(pendingAbort);
        }
        settle();
      };
      const job: QueuedProviderCall<unknown> = {
        call: () => {
          signal?.throwIfAborted();
          started = true;
          return boundCall();
        },
        providerId,
        settled,
        reject: (error) => {
          cleanup();
          reject(error);
        },
        resolve: (result) => {
          cleanup();
          resolve(result as T);
        },
      };
      const onAbort = () => {
        if (started) {
          // Preserve a provider failure already unwinding this turn; do not wait for an
          // uncooperative provider after that when the evaluation has been cancelled.
          pendingAbort = setImmediate(() => job.reject(signal?.reason));
          return;
        }
        const index = this.jobs.indexOf(job);
        if (index !== -1) {
          this.jobs.splice(index, 1);
        }
        job.reject(signal?.reason);
      };
      this.jobs.push(job);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.notifyWaiters();
    });
  }

  hasJobs(): boolean {
    return this.jobs.length > 0;
  }

  takeNextGroup(preferredProviderId?: string): QueuedProviderCall<unknown>[] {
    if (this.jobs.length === 0) {
      return [];
    }

    const providerId =
      preferredProviderId && this.jobs.some((job) => job.providerId === preferredProviderId)
        ? preferredProviderId
        : this.jobs[0].providerId;
    const group: QueuedProviderCall<unknown>[] = [];
    const remaining: QueuedProviderCall<unknown>[] = [];

    for (const job of this.jobs) {
      if (job.providerId === providerId) {
        group.push(job);
      } else {
        remaining.push(job);
      }
    }

    this.jobs = remaining;
    return group;
  }

  waitForJob(): Promise<void> {
    if (this.hasJobs()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async run(job: QueuedProviderCall<unknown>): Promise<void> {
    try {
      void job.call().then(job.resolve, job.reject);
    } catch (error) {
      job.reject(error);
    }
    await job.settled;
  }

  private notifyWaiters() {
    for (const waiter of this.waiters.splice(0)) {
      waiter();
    }
  }
}
