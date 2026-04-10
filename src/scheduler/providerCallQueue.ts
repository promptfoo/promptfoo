import { AsyncResource } from 'node:async_hooks';

export interface QueuedProviderCall<T> {
  call: () => Promise<T>;
  providerId: string;
  reject: (error: unknown) => void;
  resolve: (result: T) => void;
}

export interface ProviderCallQueue {
  enqueue<T>(providerId: string, call: () => Promise<T>): Promise<T>;
}

export class ProviderGroupedCallQueue implements ProviderCallQueue {
  private jobs: QueuedProviderCall<unknown>[] = [];
  private waiters: (() => void)[] = [];

  enqueue<T>(providerId: string, call: () => Promise<T>): Promise<T> {
    const boundCall = AsyncResource.bind(call);
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        call: boundCall as () => Promise<unknown>,
        providerId,
        reject,
        resolve: resolve as (result: unknown) => void,
      });
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
