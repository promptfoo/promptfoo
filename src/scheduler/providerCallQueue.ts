import { AsyncResource } from 'node:async_hooks';

export interface QueuedProviderCall<T> {
  call: () => Promise<T>;
  providerId: string;
  reject: (error: unknown) => void;
  resolve: (result: T) => void;
}

export interface ProviderCallQueue {
  enqueue<T>(providerId: string, call: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}

export class ProviderGroupedCallQueue implements ProviderCallQueue {
  private jobs: QueuedProviderCall<unknown>[] = [];
  private waiters: (() => void)[] = [];

  enqueue<T>(providerId: string, call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const job: QueuedProviderCall<unknown> = {
        call: AsyncResource.bind(() => {
          cleanup();
          signal?.throwIfAborted();
          return call();
        }),
        providerId,
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
        const index = this.jobs.indexOf(job);
        if (index !== -1) {
          this.jobs.splice(index, 1);
        }
        job.reject(signal?.reason);
      };
      this.jobs.push(job);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
      }
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
      job.resolve(await job.call());
    } catch (error) {
      job.reject(error);
    }
  }

  private notifyWaiters() {
    for (const waiter of this.waiters.splice(0)) {
      waiter();
    }
  }
}
